// Expanded view - WhatsApp Web style two-panel chat interface

import {
  getConversations,
  getSettings,
  setGlobalMessageListener,
  updateSettings,
  type Message as ApiMessage,
  type Conversation
} from "~lib/api"

import {
  renderConversationView,
  renderConversationViewInto
} from "./conversation"
import {
  clearEditingMessage,
  clearQuotedMessage,
  getCurrentUserId,
  getDraftMessage,
  getNavigationCallbacks,
  setCurrentConversationId,
  setDraftMessage,
  setExpandedViewMode,
  setPreferredViewMode,
  setWsCleanup,
  wsCleanup
} from "./state"
import { escapeHtml, formatRelativeTime, formatTime } from "./utils"

let expandedViewEl: HTMLElement | null = null
let selectedConversationId: string | null = null
let conversationListData: Conversation[] = []

// Icons
const ICONS = {
  close: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>`,
  minimize: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`,
  newChat: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 8a6.5 6.5 0 1 1 13 0A.75.75 0 0 0 16 8a8 8 0 1 0-8 8 .75.75 0 0 0 0-1.5A6.5 6.5 0 0 1 1.5 8Z"></path><path fill="currentColor" d="M11.75 7.75a.75.75 0 0 1 .75.75v2.25H14.75a.75.75 0 0 1 0 1.5H12.5v2.25a.75.75 0 0 1-1.5 0v-2.25H8.75a.75.75 0 0 1 0-1.5H11V8.5a.75.75 0 0 1 .75-.75Z"></path></svg>`,
  search: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path></svg>`,
  settings: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294a6.1 6.1 0 0 1 0 .772c-.01.147.039.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.161.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>`
}

// Check if expanded view is open
export function isExpandedViewOpen(): boolean {
  return expandedViewEl !== null
}

// Open expanded view
export async function openExpandedView(
  initialConversationId?: string
): Promise<void> {
  if (expandedViewEl) return // Already open

  // Set expanded view mode and save preference
  setExpandedViewMode(true)
  setPreferredViewMode("expanded")

  // Create the expanded view overlay
  expandedViewEl = document.createElement("div")
  expandedViewEl.className = "github-chat-expanded-overlay"
  expandedViewEl.innerHTML = `
    <div class="github-chat-expanded-container">
      <div class="github-chat-expanded-sidebar">
        <div class="github-chat-expanded-sidebar-header">
          <h2>Messages</h2>
          <div class="github-chat-expanded-header-actions">
            <button class="github-chat-expanded-btn" id="github-chat-expanded-settings" title="Settings">
              ${ICONS.settings}
            </button>
            <button class="github-chat-expanded-btn" id="github-chat-expanded-new" title="New chat">
              ${ICONS.newChat}
            </button>
          </div>
        </div>
        <div class="github-chat-expanded-search">
          <div class="github-chat-expanded-search-input">
            ${ICONS.search}
            <input type="text" placeholder="Search conversations..." id="github-chat-expanded-search" />
          </div>
        </div>
        <div class="github-chat-expanded-list" id="github-chat-expanded-list">
          <div class="github-chat-loading">Loading conversations...</div>
        </div>
      </div>
      <div class="github-chat-expanded-main" id="github-chat-expanded-main">
        <div class="github-chat-expanded-empty">
          <div class="github-chat-expanded-empty-icon">💬</div>
          <p>Select a conversation to start chatting</p>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(expandedViewEl)

  // Setup event listeners
  setupExpandedViewListeners()

  // Start listening for new messages to update sidebar
  startExpandedViewMessageListener()

  // Load conversations
  await loadConversationList()

  // If initial conversation provided, select it
  if (initialConversationId) {
    await selectConversation(initialConversationId)
  }
}

// Start listening for new messages in expanded view
function startExpandedViewMessageListener(): void {
  setGlobalMessageListener((conversationId, message) => {
    if (!expandedViewEl) return

    const currentUserId = getCurrentUserId()
    const isOwnMessage = message.sender_id === currentUserId

    // Update the sidebar list item
    updateConversationListItem(
      conversationId,
      message.content,
      !isOwnMessage && conversationId !== selectedConversationId // increment unread if not own message and not currently viewing
    )

    // Also update the cached conversation data
    const conv = conversationListData.find((c) => c.id === conversationId)
    if (conv) {
      conv.last_message = message.content
      conv.last_message_time = message.created_at
      if (!isOwnMessage && conversationId !== selectedConversationId) {
        conv.unread_count = (conv.unread_count || 0) + 1
      }
    }
  })
}

// Stop listening for messages
function stopExpandedViewMessageListener(): void {
  setGlobalMessageListener(null)
}

// Open expanded view with a specific user (from profile page)
export async function openExpandedViewWithUser(
  username: string,
  displayName: string,
  avatar: string
): Promise<void> {
  // First open the expanded view
  await openExpandedView()

  // Find the conversation with this user in the loaded list
  const existingConv = conversationListData.find(
    (c) => c.other_username.toLowerCase() === username.toLowerCase()
  )

  if (existingConv) {
    // Select the existing conversation
    await selectConversation(existingConv.id)
  } else {
    // No existing conversation - render conversation view directly for new chat
    const mainPanel = document.getElementById("github-chat-expanded-main")
    if (mainPanel) {
      mainPanel.innerHTML = ""
      await renderConversationViewInto(
        mainPanel,
        username,
        displayName,
        avatar,
        undefined, // no existing conversation ID
        true // isExpandedView
      )
    }
  }
}

// Save draft message from current input
function saveDraftFromInput(): void {
  if (!selectedConversationId) return
  const input = expandedViewEl?.querySelector(
    "#github-chat-input"
  ) as HTMLTextAreaElement
  if (input && input.value.trim()) {
    setDraftMessage(selectedConversationId, input.value)
  }
}

// Close expanded view (without reopening drawer)
export function closeExpandedView(): void {
  if (!expandedViewEl) return

  // Save draft before closing
  saveDraftFromInput()

  // Stop listening for messages
  stopExpandedViewMessageListener()

  // Cleanup WebSocket
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }

  // Clear state
  clearQuotedMessage()
  clearEditingMessage()
  setCurrentConversationId(null)
  setExpandedViewMode(false)
  selectedConversationId = null

  // Remove from DOM
  expandedViewEl.remove()
  expandedViewEl = null
}

// Collapse to drawer view (minimize)
export async function collapseToDrawer(): Promise<void> {
  if (!expandedViewEl) return

  // Capture current conversation data before closing
  const currentConvId = selectedConversationId
  const currentConv = conversationListData.find((c) => c.id === currentConvId)

  // Save draft before closing
  saveDraftFromInput()

  // Stop listening for messages
  stopExpandedViewMessageListener()

  // Cleanup WebSocket
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }

  // Clear state and save drawer preference
  clearQuotedMessage()
  clearEditingMessage()
  setCurrentConversationId(null)
  setExpandedViewMode(false)
  setPreferredViewMode("drawer")
  selectedConversationId = null

  // Remove from DOM
  expandedViewEl.remove()
  expandedViewEl = null

  // Reopen drawer with the same conversation if one was selected
  const nav = getNavigationCallbacks()
  if (currentConv && nav) {
    await nav.openChatDrawer(
      currentConv.other_username,
      currentConv.other_display_name || currentConv.other_username,
      currentConv.other_avatar_url,
      currentConvId || undefined
    )
  } else if (nav) {
    // No conversation selected, open list view
    await nav.openChatListDrawer()
  }
}

// Setup event listeners
function setupExpandedViewListeners(): void {
  if (!expandedViewEl) return

  // Close on overlay click
  expandedViewEl.addEventListener("click", (e) => {
    if (e.target === expandedViewEl) {
      closeExpandedView()
    }
  })

  // Collapse button (using event delegation since it's rendered dynamically in the chat header)
  expandedViewEl.addEventListener("click", (e) => {
    const collapseBtn = (e.target as HTMLElement).closest(
      "#github-chat-expanded-collapse"
    )
    if (collapseBtn) {
      collapseToDrawer()
    }
  })

  // Close button in conversation header (using event delegation)
  expandedViewEl.addEventListener("click", (e) => {
    const closeBtn = (e.target as HTMLElement).closest(
      "#github-chat-expanded-close"
    )
    if (closeBtn) {
      closeExpandedView()
    }
  })

  // New chat button
  const newChatBtn = expandedViewEl.querySelector("#github-chat-expanded-new")
  newChatBtn?.addEventListener("click", () => {
    showNewChatDialog()
  })

  // Settings button
  const settingsBtn = expandedViewEl.querySelector(
    "#github-chat-expanded-settings"
  )
  settingsBtn?.addEventListener("click", () => {
    showSettingsDialog()
  })

  // Search input
  const searchInput = expandedViewEl.querySelector(
    "#github-chat-expanded-search"
  ) as HTMLInputElement
  searchInput?.addEventListener("input", () => {
    filterConversationList(searchInput.value)
  })

  // Escape key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape" && expandedViewEl) {
      closeExpandedView()
      document.removeEventListener("keydown", handleEscape)
    }
  }
  document.addEventListener("keydown", handleEscape)
}

// Load conversation list
async function loadConversationList(): Promise<void> {
  const listEl = expandedViewEl?.querySelector("#github-chat-expanded-list")
  if (!listEl) return

  try {
    const conversations = await getConversations()
    conversationListData = conversations

    if (conversations.length === 0) {
      listEl.innerHTML = `
        <div class="github-chat-expanded-list-empty">
          <p>No conversations yet</p>
          <button class="github-chat-expanded-start-btn" id="github-chat-expanded-start">
            Start a new chat
          </button>
        </div>
      `
      const startBtn = listEl.querySelector("#github-chat-expanded-start")
      startBtn?.addEventListener("click", () => showNewChatDialog())
      return
    }

    renderConversationList(conversations)
  } catch (error) {
    console.error("Failed to load conversations:", error)
    listEl.innerHTML = `<div class="github-chat-error">Failed to load conversations</div>`
  }
}

// Render conversation list
function renderConversationList(conversations: Conversation[]): void {
  const listEl = expandedViewEl?.querySelector("#github-chat-expanded-list")
  if (!listEl) return

  listEl.innerHTML = conversations
    .map((conv) => {
      const isSelected = conv.id === selectedConversationId
      const unreadClass = conv.unread_count > 0 ? "unread" : ""
      const selectedClass = isSelected ? "selected" : ""
      const lastMessageTime = conv.last_message_time
        ? formatRelativeTime(new Date(conv.last_message_time).getTime())
        : ""
      const notOnPlatformBadge = !conv.other_has_account
        ? '<span class="github-chat-not-on-platform-badge" title="Not on GH Chat yet">!</span>'
        : ""

      return `
        <div class="github-chat-expanded-list-item ${unreadClass} ${selectedClass}" data-conversation-id="${conv.id}">
          <div class="github-chat-expanded-avatar-wrapper">
            <img src="${conv.other_avatar_url}" alt="${conv.other_username}" class="github-chat-expanded-avatar" />
            ${notOnPlatformBadge}
          </div>
          <div class="github-chat-expanded-list-item-content">
            <span class="github-chat-expanded-list-item-name">${escapeHtml(conv.other_display_name || conv.other_username)}</span>
            <div class="github-chat-expanded-list-item-preview">
              ${conv.last_message ? escapeHtml(conv.last_message.substring(0, 50)) + (conv.last_message.length > 50 ? "..." : "") : "No messages yet"}
            </div>
          </div>
          <div class="github-chat-expanded-list-item-meta">
            <span class="github-chat-expanded-list-item-time">${lastMessageTime}</span>
            ${conv.unread_count > 0 ? `<span class="github-chat-expanded-unread-badge">${conv.unread_count}</span>` : ""}
          </div>
        </div>
      `
    })
    .join("")

  // Add click listeners
  listEl.querySelectorAll(".github-chat-expanded-list-item").forEach((item) => {
    item.addEventListener("click", () => {
      const convId = (item as HTMLElement).dataset.conversationId
      if (convId) {
        selectConversation(convId)
      }
    })
  })
}

// Filter conversation list by search query
function filterConversationList(query: string): void {
  const normalizedQuery = query.toLowerCase().trim()

  if (!normalizedQuery) {
    renderConversationList(conversationListData)
    return
  }

  const filtered = conversationListData.filter((conv) => {
    return (
      conv.other_username.toLowerCase().includes(normalizedQuery) ||
      conv.other_display_name?.toLowerCase().includes(normalizedQuery) ||
      conv.last_message?.toLowerCase().includes(normalizedQuery)
    )
  })

  renderConversationList(filtered)
}

// Select a conversation
async function selectConversation(conversationId: string): Promise<void> {
  if (selectedConversationId === conversationId) return

  // Save draft from current conversation before switching
  saveDraftFromInput()

  // Cleanup previous conversation
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }
  clearQuotedMessage()
  clearEditingMessage()

  selectedConversationId = conversationId
  setCurrentConversationId(conversationId)

  // Update selected state in list
  const listEl = expandedViewEl?.querySelector("#github-chat-expanded-list")
  listEl
    ?.querySelectorAll(".github-chat-expanded-list-item")
    .forEach((item) => {
      const itemConvId = (item as HTMLElement).dataset.conversationId
      item.classList.toggle("selected", itemConvId === conversationId)
      // Clear unread badge when selected
      if (itemConvId === conversationId) {
        item.classList.remove("unread")
        item.querySelector(".github-chat-expanded-unread-badge")?.remove()
      }
    })

  // Find conversation data
  const conv = conversationListData.find((c) => c.id === conversationId)
  if (!conv) return

  // Render conversation in main panel
  const mainEl = expandedViewEl?.querySelector(
    "#github-chat-expanded-main"
  ) as HTMLElement
  if (!mainEl) return

  // Use existing conversation view renderer
  await renderConversationView(
    mainEl,
    conversationId,
    conv.other_user_id,
    conv.other_username,
    conv.other_display_name || conv.other_username,
    conv.other_avatar_url,
    conv.other_has_account,
    true // isExpandedView flag
  )
}

// Show settings dialog
async function showSettingsDialog(): Promise<void> {
  const existingDialog = expandedViewEl?.querySelector(
    ".github-chat-expanded-settings-dialog"
  )
  if (existingDialog) {
    existingDialog.remove()
    return
  }

  // Load current settings
  const settings = await getSettings()
  const hideOnlineStatus = settings?.hide_online_status ?? false

  const dialog = document.createElement("div")
  dialog.className = "github-chat-expanded-settings-dialog"
  dialog.innerHTML = `
    <div class="github-chat-expanded-settings-dialog-content">
      <div class="github-chat-expanded-settings-dialog-header">
        <h3>Settings</h3>
        <button class="github-chat-expanded-settings-close" aria-label="Close">
          ${ICONS.close}
        </button>
      </div>
      <div class="github-chat-expanded-settings-body">
        <div class="github-chat-expanded-settings-section">
          <h4>Privacy</h4>
          <label class="github-chat-expanded-settings-toggle">
            <span class="github-chat-expanded-settings-label">
              <span class="github-chat-expanded-settings-label-text">Hide online status</span>
              <span class="github-chat-expanded-settings-label-desc">When enabled, others won't see when you're online, and you won't see their online status either.</span>
            </span>
            <input type="checkbox" id="github-chat-settings-hide-status" ${hideOnlineStatus ? "checked" : ""} />
            <span class="github-chat-expanded-settings-switch"></span>
          </label>
        </div>
      </div>
      <div class="github-chat-expanded-settings-footer">
        <span class="github-chat-expanded-settings-status" id="github-chat-settings-status"></span>
      </div>
    </div>
  `

  expandedViewEl?.appendChild(dialog)

  const closeBtn = dialog.querySelector(".github-chat-expanded-settings-close")
  const hideStatusCheckbox = dialog.querySelector(
    "#github-chat-settings-hide-status"
  ) as HTMLInputElement
  const statusEl = dialog.querySelector("#github-chat-settings-status")

  closeBtn?.addEventListener("click", () => dialog.remove())
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.remove()
  })

  // Handle toggle change
  hideStatusCheckbox?.addEventListener("change", async () => {
    const newValue = hideStatusCheckbox.checked
    if (statusEl) statusEl.textContent = "Saving..."

    const result = await updateSettings({ hide_online_status: newValue })

    if (result) {
      if (statusEl) statusEl.textContent = "Saved"
      setTimeout(() => {
        if (statusEl) statusEl.textContent = ""
      }, 2000)
    } else {
      if (statusEl) statusEl.textContent = "Failed to save"
      // Revert checkbox
      hideStatusCheckbox.checked = !newValue
    }
  })
}

// Show new chat dialog
function showNewChatDialog(): void {
  const existingDialog = expandedViewEl?.querySelector(
    ".github-chat-expanded-new-dialog"
  )
  if (existingDialog) {
    existingDialog.remove()
    return
  }

  const dialog = document.createElement("div")
  dialog.className = "github-chat-expanded-new-dialog"
  dialog.innerHTML = `
    <div class="github-chat-expanded-new-dialog-content">
      <div class="github-chat-expanded-new-dialog-header">
        <h3>New Conversation</h3>
        <button class="github-chat-expanded-new-close" aria-label="Close">
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
        </button>
      </div>
      <div class="github-chat-expanded-new-input-wrapper">
        <svg viewBox="0 0 16 16" width="16" height="16" class="github-chat-expanded-new-search-icon">
          <path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path>
        </svg>
        <input type="text" placeholder="Search GitHub username..." id="github-chat-new-username" autocomplete="off" />
        <div class="github-chat-expanded-new-loading" id="github-chat-new-loading" style="display: none;">
          <div class="github-chat-expanded-new-spinner"></div>
        </div>
      </div>
      <div class="github-chat-expanded-new-preview" id="github-chat-new-preview" style="display: none;">
        <img src="" alt="" class="github-chat-expanded-new-preview-avatar" id="github-chat-new-preview-avatar" />
        <div class="github-chat-expanded-new-preview-info">
          <span class="github-chat-expanded-new-preview-name" id="github-chat-new-preview-name"></span>
          <span class="github-chat-expanded-new-preview-username" id="github-chat-new-preview-username"></span>
        </div>
        <button class="github-chat-expanded-new-start" id="github-chat-new-start">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path fill="currentColor" d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Z"></path>
          </svg>
          Chat
        </button>
      </div>
      <div class="github-chat-expanded-new-error" id="github-chat-new-error"></div>
      <p class="github-chat-expanded-new-hint">Enter a GitHub username to start a conversation</p>
    </div>
  `

  // Append to expanded view overlay for proper centering
  expandedViewEl?.appendChild(dialog)

  const input = dialog.querySelector(
    "#github-chat-new-username"
  ) as HTMLInputElement
  const closeBtn = dialog.querySelector(".github-chat-expanded-new-close")
  const startBtn = dialog.querySelector("#github-chat-new-start")
  const errorEl = dialog.querySelector("#github-chat-new-error")
  const loadingEl = dialog.querySelector("#github-chat-new-loading")
  const previewEl = dialog.querySelector("#github-chat-new-preview")
  const previewAvatar = dialog.querySelector(
    "#github-chat-new-preview-avatar"
  ) as HTMLImageElement
  const previewName = dialog.querySelector("#github-chat-new-preview-name")
  const previewUsername = dialog.querySelector(
    "#github-chat-new-preview-username"
  )
  const hintEl = dialog.querySelector(".github-chat-expanded-new-hint")

  input?.focus()

  closeBtn?.addEventListener("click", () => dialog.remove())
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.remove()
  })

  let searchTimeout: ReturnType<typeof setTimeout> | null = null
  let currentUser: {
    login: string
    name: string | null
    avatar_url: string
  } | null = null

  // Search for user as they type
  const searchUser = async (username: string) => {
    if (!username) {
      if (previewEl) (previewEl as HTMLElement).style.display = "none"
      if (hintEl) (hintEl as HTMLElement).style.display = "block"
      if (errorEl) errorEl.textContent = ""
      currentUser = null
      return
    }

    if (loadingEl) (loadingEl as HTMLElement).style.display = "flex"
    if (errorEl) errorEl.textContent = ""
    if (hintEl) (hintEl as HTMLElement).style.display = "none"

    try {
      const response = await fetch(`https://api.github.com/users/${username}`)
      if (response.ok) {
        const user = await response.json()
        currentUser = {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url
        }

        if (previewAvatar) previewAvatar.src = user.avatar_url
        if (previewName) previewName.textContent = user.name || user.login
        if (previewUsername) previewUsername.textContent = `@${user.login}`
        if (previewEl) (previewEl as HTMLElement).style.display = "flex"
      } else if (response.status === 404) {
        currentUser = null
        if (previewEl) (previewEl as HTMLElement).style.display = "none"
        if (errorEl) errorEl.textContent = "User not found on GitHub"
      } else {
        throw new Error("Failed to search")
      }
    } catch {
      currentUser = null
      if (previewEl) (previewEl as HTMLElement).style.display = "none"
    } finally {
      if (loadingEl) (loadingEl as HTMLElement).style.display = "none"
    }
  }

  input?.addEventListener("input", () => {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      searchUser(input.value.trim())
    }, 400)
  })

  const startChat = async () => {
    if (!currentUser) return

    startBtn?.setAttribute("disabled", "true")
    if (errorEl) errorEl.textContent = ""

    try {
      const { getOrCreateConversation } = await import("~lib/api")
      const result = await getOrCreateConversation(currentUser.login)

      if (result.conversation) {
        dialog.remove()
        // Refresh list and select new conversation
        await loadConversationList()
        await selectConversation(result.conversation.id)
      } else if (result.error) {
        if (errorEl) {
          errorEl.textContent = result.error
        }
        startBtn?.removeAttribute("disabled")
      }
    } catch (error: any) {
      if (errorEl) {
        errorEl.textContent = error.message || "Failed to start conversation"
      }
      startBtn?.removeAttribute("disabled")
    }
  }

  startBtn?.addEventListener("click", startChat)
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && currentUser) startChat()
    if (e.key === "Escape") dialog.remove()
  })
}

// Update conversation list item (for real-time updates)
export function updateConversationListItem(
  conversationId: string,
  lastMessage?: string,
  incrementUnread?: boolean
): void {
  if (!expandedViewEl) return

  const item = expandedViewEl.querySelector(
    `.github-chat-expanded-list-item[data-conversation-id="${conversationId}"]`
  )

  if (!item) {
    // New conversation - reload list
    loadConversationList()
    return
  }

  // Update last message preview
  if (lastMessage) {
    const previewEl = item.querySelector(
      ".github-chat-expanded-list-item-preview"
    )
    if (previewEl) {
      previewEl.textContent =
        lastMessage.substring(0, 50) + (lastMessage.length > 50 ? "..." : "")
    }

    const timeEl = item.querySelector(".github-chat-expanded-list-item-time")
    if (timeEl) {
      timeEl.textContent = "now"
    }
  }

  // Update unread badge if not the selected conversation
  if (incrementUnread && conversationId !== selectedConversationId) {
    item.classList.add("unread")
    const metaEl = item.querySelector(".github-chat-expanded-list-item-meta")
    let badge = item.querySelector(".github-chat-expanded-unread-badge")
    if (badge) {
      const count = parseInt(badge.textContent || "0") + 1
      badge.textContent = String(count)
    } else if (metaEl) {
      badge = document.createElement("span")
      badge.className = "github-chat-expanded-unread-badge"
      badge.textContent = "1"
      metaEl.appendChild(badge)
    }
  }

  // Move to top of list
  const listEl = item.parentElement
  if (listEl && listEl.firstChild !== item) {
    listEl.insertBefore(item, listEl.firstChild)
  }
}
