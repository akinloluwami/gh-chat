// Message action handlers (reactions, options menu)

import { deleteMessage } from "~lib/api"

import {
  clearEditingMessage,
  getChatContainer,
  getCurrentConversationId,
  getCurrentUserId,
  getCurrentUsername,
  messageCache,
  setEditingMessage,
  setQuotedMessage
} from "../state"
import { showEmojiPopover } from "./emoji-popover"
import {
  hideEditPreview,
  hideQuotePreview,
  showEditPreview,
  showQuotePreview
} from "./input-handler"
import { handleReactionOptimistic } from "./reactions"

let activeOptionsMenu: HTMLElement | null = null
let activeConfirmDialog: HTMLElement | null = null

// Close any open options menu
export function closeOptionsMenu(): void {
  if (activeOptionsMenu) {
    activeOptionsMenu.remove()
    activeOptionsMenu = null
  }
}

// Close any open confirmation dialog
export function closeConfirmDialog(): void {
  if (activeConfirmDialog) {
    activeConfirmDialog.remove()
    activeConfirmDialog = null
  }
}

// Show a custom confirmation dialog
function showConfirmDialog(
  message: string,
  confirmText: string,
  onConfirm: () => void
): void {
  // Close any existing dialog and options menu
  closeConfirmDialog()
  closeOptionsMenu()

  const container = getChatContainer()
  if (!container) return

  const dialog = document.createElement("div")
  dialog.className = "github-chat-confirm-overlay"
  dialog.innerHTML = `
    <div class="github-chat-confirm-dialog">
      <p class="github-chat-confirm-message">${message}</p>
      <div class="github-chat-confirm-actions">
        <button class="github-chat-confirm-btn github-chat-confirm-cancel">Cancel</button>
        <button class="github-chat-confirm-btn github-chat-confirm-delete">${confirmText}</button>
      </div>
    </div>
  `

  container.appendChild(dialog)
  activeConfirmDialog = dialog

  // Handle button clicks
  const cancelBtn = dialog.querySelector(".github-chat-confirm-cancel")
  const confirmBtn = dialog.querySelector(".github-chat-confirm-delete")

  cancelBtn?.addEventListener("click", (e) => {
    e.stopPropagation()
    closeConfirmDialog()
  })

  confirmBtn?.addEventListener("click", (e) => {
    e.stopPropagation()
    closeConfirmDialog()
    onConfirm()
  })

  // Close on overlay click (but not on dialog content click)
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      closeConfirmDialog()
    }
  })
}

// Check if message is within 1 hour of creation
function isWithinEditWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const hourInMs = 60 * 60 * 1000
  // TODO: Change back to 1 hour after testing
  const windowMs = 24 * hourInMs // 24 hours for testing
  return now - created < windowMs
}

// Show options menu for a message
function showOptionsMenu(anchorBtn: HTMLElement, messageId: string): void {
  // Close any existing menu
  closeOptionsMenu()

  // Get message content for reply
  const messageEl = anchorBtn.closest(".github-chat-message") as HTMLElement
  const bubbleEl = messageEl?.querySelector(".github-chat-bubble")
  const quotedContent = bubbleEl?.querySelector(".github-chat-quoted-content")
  // Get content after the quoted message if present, otherwise get full bubble text
  let messageContent = ""
  if (quotedContent) {
    // Get text nodes after the quoted content
    const bubble = bubbleEl as HTMLElement
    const childNodes = Array.from(bubble.childNodes)
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        messageContent += node.textContent || ""
      }
    }
    messageContent = messageContent.trim()
  } else {
    messageContent = bubbleEl?.textContent?.trim() || ""
  }

  // Determine if message is sent or received
  const isSent = messageEl?.classList.contains("sent")

  // Get message created_at from data attribute (primary) or cache (fallback)
  let messageCreatedAt: string | null = messageEl?.dataset.createdAt || null
  const conversationId = getCurrentConversationId()

  if (!messageCreatedAt && conversationId) {
    const cached = messageCache.get(conversationId)
    if (cached) {
      const msg = cached.messages.find((m) => m.id === messageId)
      if (msg) {
        messageCreatedAt = msg.created_at
      }
    }
  }

  const canEdit =
    isSent && messageCreatedAt && isWithinEditWindow(messageCreatedAt)

  const canDelete = isSent

  // Build menu items
  let menuItems = `
    <button class="github-chat-options-item" data-action="copy">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
        <path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
      </svg>
      Copy
    </button>
    <button class="github-chat-options-item" data-action="reply">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M6.78 1.97a.75.75 0 0 1 0 1.06L3.81 6h6.44A4.75 4.75 0 0 1 15 10.75v2.5a.75.75 0 0 1-1.5 0v-2.5a3.25 3.25 0 0 0-3.25-3.25H3.81l2.97 2.97a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L1.47 7.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"></path>
      </svg>
      Reply
    </button>
  `

  if (canEdit) {
    menuItems += `
    <button class="github-chat-options-item" data-action="edit">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path>
      </svg>
      Edit
    </button>
    `
  }

  if (canDelete) {
    menuItems += `
    <button class="github-chat-options-item github-chat-options-item-danger" data-action="delete">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"></path>
      </svg>
      Delete
    </button>
    `
  }

  // Create options menu
  const menu = document.createElement("div")
  menu.className = "github-chat-options-menu"
  menu.innerHTML = menuItems

  // Position menu near the anchor button
  const rect = anchorBtn.getBoundingClientRect()
  const container = getChatContainer()
  if (!container) return

  const containerRect = container.getBoundingClientRect()
  menu.style.position = "absolute"
  menu.style.right = `${containerRect.right - rect.right}px`
  menu.style.zIndex = "10002"

  // Temporarily add to DOM to measure height
  menu.style.visibility = "hidden"
  container.appendChild(menu)
  const menuHeight = menu.offsetHeight
  menu.style.visibility = ""

  // Check if menu would overflow bottom of container
  const spaceBelow = containerRect.bottom - rect.bottom - 4
  const spaceAbove = rect.top - containerRect.top - 4

  if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
    // Position below the button
    menu.style.top = `${rect.bottom - containerRect.top + 4}px`
  } else {
    // Position above the button
    menu.style.top = `${rect.top - containerRect.top - menuHeight - 4}px`
  }

  activeOptionsMenu = menu

  // Handle menu item clicks
  menu.addEventListener("click", async (e) => {
    e.stopPropagation()

    const item = (e.target as HTMLElement).closest(
      ".github-chat-options-item"
    ) as HTMLElement
    if (!item) return

    const action = item.dataset.action

    if (action === "copy") {
      // Copy message content to clipboard
      try {
        await navigator.clipboard.writeText(messageContent)
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement("textarea")
        textarea.value = messageContent
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
    } else if (action === "reply") {
      // Get the sender's username for quote
      let quoteSenderUsername = ""
      if (isSent) {
        quoteSenderUsername = getCurrentUsername() || "You"
      } else {
        // Get from header
        const headerUsername = document.querySelector(
          ".github-chat-header .github-chat-username"
        )
        quoteSenderUsername =
          headerUsername?.textContent?.replace("@", "") || "User"
      }

      // Clear any edit state first
      clearEditingMessage()
      hideEditPreview()

      // Set quote state and show preview
      setQuotedMessage({
        id: messageId,
        content: messageContent,
        senderUsername: quoteSenderUsername
      })
      showQuotePreview(messageContent, quoteSenderUsername)

      // Focus input
      const input = document.getElementById(
        "github-chat-input"
      ) as HTMLTextAreaElement
      input?.focus()
    } else if (action === "edit" && messageCreatedAt) {
      // Clear any quote state first
      clearEditingMessage()
      hideQuotePreview()

      // Set edit state and show preview
      setEditingMessage({
        id: messageId,
        content: messageContent,
        createdAt: messageCreatedAt
      })
      showEditPreview(messageContent)

      // Put content in input and focus
      const input = document.getElementById(
        "github-chat-input"
      ) as HTMLTextAreaElement
      if (input) {
        input.value = messageContent
        input.focus()
        // Resize textarea
        input.style.height = "auto"
        input.style.height = Math.min(input.scrollHeight, 120) + "px"
      }
    } else if (action === "delete") {
      // Show custom confirmation dialog
      showConfirmDialog(
        "Delete this message? This cannot be undone.",
        "Delete",
        async () => {
          const convId = getCurrentConversationId()
          if (convId) {
            const result = await deleteMessage(convId, messageId)
            if (result.success) {
              // Remove from DOM
              messageEl?.remove()
              // Remove from cache
              const cached = messageCache.get(convId)
              if (cached) {
                cached.messages = cached.messages.filter(
                  (m) => m.id !== messageId
                )
              }
            }
          }
        }
      )
      // Don't close options menu here - let the dialog handle user interaction
      return
    }

    closeOptionsMenu()
  })

  // Close menu when clicking outside
  const closeOnOutsideClick = (e: MouseEvent) => {
    if (
      !menu.contains(e.target as Node) &&
      !anchorBtn.contains(e.target as Node)
    ) {
      closeOptionsMenu()
      document.removeEventListener("click", closeOnOutsideClick)
    }
  }
  setTimeout(() => document.addEventListener("click", closeOnOutsideClick), 0)
}

// Setup click handlers for message actions
export function setupMessageActionHandlers(msgContainer: HTMLElement): void {
  msgContainer.addEventListener("click", (e) => {
    const target = e.target as HTMLElement

    // Handle reaction badge clicks (toggle reaction)
    const reactionBtn = target.closest(".github-chat-reaction") as HTMLElement
    if (reactionBtn) {
      e.stopPropagation()
      const emoji = reactionBtn.dataset.emoji
      const messageEl = reactionBtn.closest(
        ".github-chat-message"
      ) as HTMLElement
      const messageId = messageEl?.dataset.messageId
      const userReacted = reactionBtn.dataset.userReacted === "true"

      const convId = getCurrentConversationId()
      const userId = getCurrentUserId()
      const username = getCurrentUsername()

      if (!emoji || !messageId || !convId || !userId || !username) return

      // Use optimistic update
      handleReactionOptimistic(
        convId,
        messageId,
        emoji,
        !userReacted,
        userId,
        username
      )
      return
    }

    // Handle action button clicks
    const actionBtn = target.closest(".github-chat-action-btn") as HTMLElement
    if (!actionBtn) return

    const action = actionBtn.dataset.action
    const messageEl = actionBtn.closest(".github-chat-message") as HTMLElement
    const messageId = messageEl?.dataset.messageId

    if (!messageId) return

    if (action === "reaction") {
      e.stopPropagation()
      showEmojiPopover(actionBtn, messageId)
    } else if (action === "options") {
      e.stopPropagation()
      showOptionsMenu(actionBtn, messageId)
    }
  })
}
