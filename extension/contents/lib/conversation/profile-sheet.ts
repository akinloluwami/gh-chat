// Profile sheet modal with block/unblock and pin functionality

import {
  blockUser,
  getBlockStatus,
  getPinStatus,
  pinConversation,
  setBlockStatusListener,
  unblockUser,
  unpinConversation
} from "~lib/api"

import { isExpandedViewOpen, loadConversationList } from "../expanded-view"
import { escapeHtml } from "../utils"

// Current state
let currentBlockedUserId: string | null = null
let currentConversationId: string | null = null
let currentBlockStatus: "none" | "blocked_by_me" | "blocked_by_them" = "none"
let currentPinStatus: boolean = false
let isPinStatusLoading: boolean = true
let currentUserInfo: {
  avatar: string
  displayName: string
  username: string
} | null = null
let modalElement: HTMLElement | null = null
let currentContainer: HTMLElement | null = null

// Setup menu button handler
export function setupProfileSheet(
  container: HTMLElement,
  otherUserId: string,
  conversationId: string,
  userInfo?: { avatar: string; displayName: string; username: string }
): void {
  currentBlockedUserId = otherUserId
  currentConversationId = conversationId
  currentUserInfo = userInfo || null
  currentContainer = container
  isPinStatusLoading = true

  const menuBtn = container.querySelector("#github-chat-menu-btn")
  if (!menuBtn) return

  // Open modal on click
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    showProfileModal(container)
  })

  // Set up real-time block status listener
  setBlockStatusListener((blockedBy, status) => {
    // Only update if it's from the current conversation partner
    if (blockedBy === currentBlockedUserId && currentContainer) {
      currentBlockStatus = status
      updateBlockUI(currentContainer, status)
      // Close modal if open when we get blocked
      if (status === "blocked_by_them") {
        closeModal()
      }
    }
  })

  // Fetch and display initial block and pin status
  fetchAndDisplayBlockStatus(container, otherUserId)
  fetchAndDisplayPinStatus(conversationId)
}

// Create and show the profile modal
function showProfileModal(container: HTMLElement): void {
  // Remove existing modal if any
  modalElement?.remove()

  const modal = document.createElement("div")
  modal.className = "github-chat-profile-modal"
  modal.innerHTML = `
    <div class="github-chat-profile-overlay"></div>
    <div class="github-chat-profile-sheet">
      <div class="github-chat-profile-header">
        <button class="github-chat-profile-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="github-chat-profile-content">
        <div class="github-chat-profile-avatar">
          <img src="${escapeHtml(currentUserInfo?.avatar || "")}" alt="${escapeHtml(currentUserInfo?.displayName || "User")}" />
        </div>
        <div class="github-chat-profile-name">${escapeHtml(currentUserInfo?.displayName || "User")}</div>
        <div class="github-chat-profile-username">@${escapeHtml(currentUserInfo?.username || "")}</div>
        
        <div class="github-chat-profile-actions">
          <button class="github-chat-action-btn" data-action="pin" id="github-chat-pin-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 17v5M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
            </svg>
            <span>Pin</span>
          </button>
        </div>

        <div class="github-chat-profile-menu">
          <div class="github-chat-menu-item" id="github-chat-modal-block">
            <span class="github-chat-menu-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M4.93 4.93l14.14 14.14"/>
              </svg>
            </span>
            <span class="github-chat-menu-label">Block user</span>
          </div>
          
          <div class="github-chat-block-confirm" id="github-chat-block-confirm" style="display: none;">
            <span class="github-chat-confirm-text">Block user?</span>
            <button class="github-chat-confirm-yes" id="github-chat-confirm-block">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </button>
            <button class="github-chat-confirm-no" id="github-chat-confirm-cancel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  container.appendChild(modal)
  modalElement = modal

  // Update block and pin button states
  updateModalBlockButton()
  updateModalPinButton()

  // Close handlers
  const overlay = modal.querySelector(".github-chat-profile-overlay")
  const closeBtn = modal.querySelector(".github-chat-profile-close")

  overlay?.addEventListener("click", () => closeModal())
  closeBtn?.addEventListener("click", () => closeModal())

  // Pin button handler
  const pinBtn = modal.querySelector("#github-chat-pin-btn") as HTMLElement
  pinBtn?.addEventListener("click", async () => {
    if (currentPinStatus) {
      await handleUnpin()
    } else {
      await handlePin()
    }
    updateModalPinButton()
  })

  // Block button handler - show confirmation or unblock directly
  const blockBtn = modal.querySelector(
    "#github-chat-modal-block"
  ) as HTMLElement
  const confirmSection = modal.querySelector(
    "#github-chat-block-confirm"
  ) as HTMLElement
  const cancelBtn = modal.querySelector("#github-chat-confirm-cancel")
  const confirmBlockBtn = modal.querySelector("#github-chat-confirm-block")

  blockBtn?.addEventListener("click", async () => {
    if (currentBlockStatus === "blocked_by_me") {
      // Unblock directly
      await handleUnblock(container)
      closeModal()
    } else {
      // Show confirmation inline with smooth transition
      if (confirmSection && blockBtn) {
        blockBtn.style.opacity = "0"
        setTimeout(() => {
          blockBtn.style.display = "none"
          confirmSection.style.display = "flex"
        }, 150)
      }
    }
  })

  cancelBtn?.addEventListener("click", () => {
    if (confirmSection && blockBtn) {
      confirmSection.style.display = "none"
      blockBtn.style.display = "flex"
      // Trigger reflow for animation
      blockBtn.offsetHeight
      blockBtn.style.opacity = "1"
    }
  })

  confirmBlockBtn?.addEventListener("click", async () => {
    await handleBlock(container)
    closeModal()
  })

  // Prevent clicks inside sheet from closing
  const sheet = modal.querySelector(".github-chat-profile-sheet")
  sheet?.addEventListener("click", (e) => e.stopPropagation())
}

// Close the modal
function closeModal(): void {
  modalElement?.remove()
  modalElement = null
}

// Update block button in modal
function updateModalBlockButton(): void {
  if (!modalElement) return

  const blockBtn = modalElement.querySelector("#github-chat-modal-block")
  if (!blockBtn) return

  const label = blockBtn.querySelector(".github-chat-menu-label")
  const icon = blockBtn.querySelector(".github-chat-menu-icon")

  if (currentBlockStatus === "blocked_by_me") {
    if (label) label.textContent = "Unblock user"
    if (icon)
      icon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    `
    blockBtn.classList.add("github-chat-menu-unblock")
  } else {
    if (label) label.textContent = "Block user"
    if (icon)
      icon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M4.93 4.93l14.14 14.14"/>
      </svg>
    `
    blockBtn.classList.remove("github-chat-menu-unblock")
  }
}

// Update pin button in modal
function updateModalPinButton(): void {
  if (!modalElement) return

  const pinBtn = modalElement.querySelector(
    "#github-chat-pin-btn"
  ) as HTMLButtonElement
  if (!pinBtn) return

  const label = pinBtn.querySelector("span")
  const icon = pinBtn.querySelector("svg")

  // Disable button while loading
  if (isPinStatusLoading) {
    pinBtn.disabled = true
    pinBtn.style.opacity = "0.5"
    pinBtn.style.cursor = "not-allowed"
    return
  }

  // Enable button when loaded
  pinBtn.disabled = false
  pinBtn.style.opacity = ""
  pinBtn.style.cursor = ""

  if (currentPinStatus) {
    if (label) label.textContent = "Unpin"
    if (icon) {
      icon.innerHTML = `
        <path d="M12 17v5M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
        <line x1="5" y1="5" x2="19" y2="19" stroke-linecap="round" stroke-width="2.5"/>
      `
    }
    pinBtn.classList.add("github-chat-pinned")
  } else {
    if (label) label.textContent = "Pin"
    if (icon) {
      icon.innerHTML = `
        <path d="M12 17v5M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
      `
    }
    pinBtn.classList.remove("github-chat-pinned")
  }
}

// Fetch and display pin status
async function fetchAndDisplayPinStatus(conversationId: string): Promise<void> {
  isPinStatusLoading = true
  updateModalPinButton()

  const status = await getPinStatus(conversationId)
  if (status) {
    currentPinStatus = status.pinned
  }

  isPinStatusLoading = false
  updateModalPinButton()
}

// Fetch and display block status
async function fetchAndDisplayBlockStatus(
  container: HTMLElement,
  otherUserId: string
): Promise<void> {
  const status = await getBlockStatus(otherUserId)
  if (status) {
    currentBlockStatus = status.status
    updateBlockUI(container, status.status)
  }
}

// Update UI based on block status
function updateBlockUI(
  container: HTMLElement,
  status: "none" | "blocked_by_me" | "blocked_by_them"
): void {
  const inputArea = container.querySelector(
    ".github-chat-input-area"
  ) as HTMLElement

  // Remove existing banner
  const existingBanner = container.querySelector(".github-chat-blocked-banner")
  existingBanner?.remove()

  // Show/hide blocked banner and disable input
  if (status === "blocked_by_me") {
    showBlockedBanner(container, "You blocked this user", true)
    if (inputArea) inputArea.style.display = "none"
  } else if (status === "blocked_by_them") {
    showBlockedBanner(container, "You can't reply to this conversation", false)
    if (inputArea) inputArea.style.display = "none"
  } else {
    if (inputArea) inputArea.style.display = ""
  }

  // Update modal if open
  updateModalBlockButton()
}

// Show blocked banner
function showBlockedBanner(
  container: HTMLElement,
  message: string,
  showUnblockBtn: boolean
): void {
  const header = container.querySelector(".github-chat-header")
  if (!header) return

  const banner = document.createElement("div")
  banner.className = "github-chat-blocked-banner"
  banner.innerHTML = `
    <span>${message}</span>
    ${showUnblockBtn ? '<button id="github-chat-banner-unblock">Unblock</button>' : ""}
  `

  header.insertAdjacentElement("afterend", banner)

  // Unblock button in banner
  const unblockBtn = banner.querySelector("#github-chat-banner-unblock")
  unblockBtn?.addEventListener("click", () => {
    if (currentBlockedUserId) {
      handleUnblock(container)
    }
  })
}

// Handle blocking a user (confirmation is handled in the modal UI)
async function handleBlock(container: HTMLElement): Promise<void> {
  if (!currentBlockedUserId) return

  const success = await blockUser(currentBlockedUserId)
  if (success) {
    currentBlockStatus = "blocked_by_me"
    updateBlockUI(container, "blocked_by_me")
  }
}

// Handle unblocking a user
async function handleUnblock(container: HTMLElement): Promise<void> {
  if (!currentBlockedUserId) return

  const success = await unblockUser(currentBlockedUserId)
  if (success) {
    currentBlockStatus = "none"
    updateBlockUI(container, "none")
  }
}

// Handle pinning a conversation
async function handlePin(): Promise<void> {
  if (!currentConversationId) return

  const success = await pinConversation(currentConversationId)
  if (success) {
    currentPinStatus = true
    // Refresh the conversation list to show the pinned chat at top
    if (isExpandedViewOpen()) {
      loadConversationList()
    }
  }
}

// Handle unpinning a conversation
async function handleUnpin(): Promise<void> {
  if (!currentConversationId) return

  const success = await unpinConversation(currentConversationId)
  if (success) {
    currentPinStatus = false
    // Refresh the conversation list to update the order
    if (isExpandedViewOpen()) {
      loadConversationList()
    }
  }
}

// Cleanup
export function cleanupProfileSheet(): void {
  closeModal()
  setBlockStatusListener(null)
  currentBlockedUserId = null
  currentConversationId = null
  currentBlockStatus = "none"
  currentPinStatus = false
  isPinStatusLoading = true
  currentUserInfo = null
  currentContainer = null
}
