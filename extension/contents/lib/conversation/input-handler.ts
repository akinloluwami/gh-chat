// Input handling for conversation view - textarea, typing, sending messages

import {
  editMessage as apiEditMessage,
  sendMessage as apiSendMessage,
  sendStopTyping,
  sendTypingIndicator
} from "~lib/api"

import {
  clearEditingMessage,
  clearQuotedMessage,
  currentConversationId,
  getChatContainer,
  getEditingMessage,
  getQuotedMessage,
  incrementPendingMessageId,
  messageCache,
  setTypingTimeout,
  typingTimeout
} from "../state"
import { STATUS_ICONS } from "../types"
import { escapeHtml, formatTime } from "../utils"
import { showEmojiPickerForInsert } from "./emoji-picker"
import { MESSAGE_ACTION_ICONS } from "./message-html"

// Show quote preview bar above input
export function showQuotePreview(
  content: string,
  senderUsername: string
): void {
  const container = getChatContainer()
  const inputArea = container?.querySelector(".github-chat-input-area")
  if (!inputArea) return

  // Remove existing previews
  hideQuotePreview()
  hideEditPreview()

  // Create preview bar
  const preview = document.createElement("div")
  preview.className = "github-chat-quote-preview"
  preview.innerHTML = `
    <div class="github-chat-quote-preview-content">
      <span class="github-chat-quote-preview-sender">@${escapeHtml(senderUsername)}</span>
      <span class="github-chat-quote-preview-text">${escapeHtml(content.length > 50 ? content.substring(0, 50) + "..." : content)}</span>
    </div>
    <button class="github-chat-quote-preview-close" aria-label="Cancel reply">
      <svg viewBox="0 0 16 16" width="12" height="12">
        <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
      </svg>
    </button>
  `

  // Insert before input area
  inputArea.parentNode?.insertBefore(preview, inputArea)

  // Setup close button
  const closeBtn = preview.querySelector(".github-chat-quote-preview-close")
  closeBtn?.addEventListener("click", () => {
    clearQuotedMessage()
    hideQuotePreview()
  })
}

// Hide quote preview bar
export function hideQuotePreview(): void {
  const container = getChatContainer()
  const existing = container?.querySelector(".github-chat-quote-preview")
  existing?.remove()
}

// Show edit preview bar above input (Twitter-style)
export function showEditPreview(content: string): void {
  const container = getChatContainer()
  const inputArea = container?.querySelector(".github-chat-input-area")
  if (!inputArea) return

  // Remove existing previews
  hideQuotePreview()
  hideEditPreview()

  // Create edit preview bar
  const preview = document.createElement("div")
  preview.className = "github-chat-edit-preview"
  preview.innerHTML = `
    <div class="github-chat-edit-preview-content">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path>
      </svg>
      <span>Edit message</span>
    </div>
    <button class="github-chat-edit-preview-close" aria-label="Cancel edit">
      <svg viewBox="0 0 16 16" width="12" height="12">
        <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
      </svg>
    </button>
  `

  // Insert before input area
  inputArea.parentNode?.insertBefore(preview, inputArea)

  // Setup close button
  const closeBtn = preview.querySelector(".github-chat-edit-preview-close")
  closeBtn?.addEventListener("click", () => {
    clearEditingMessage()
    hideEditPreview()
    // Clear input
    const container = getChatContainer()
    const input = container?.querySelector(
      "#github-chat-input"
    ) as HTMLTextAreaElement
    if (input) {
      input.value = ""
      input.style.height = "auto"
    }
  })
}

// Hide edit preview bar
export function hideEditPreview(): void {
  const container = getChatContainer()
  const existing = container?.querySelector(".github-chat-edit-preview")
  existing?.remove()
}

// Setup input event handlers
export function setupInputHandlers(
  container: HTMLElement,
  input: HTMLTextAreaElement,
  sendBtn: HTMLButtonElement
): void {
  // Auto-resize textarea and send typing indicator
  input.addEventListener("input", () => {
    input.style.height = "auto"
    input.style.height = Math.min(input.scrollHeight, 120) + "px"

    // Send typing indicator
    sendTypingIndicator()

    // Clear existing timeout and set new one
    if (typingTimeout) clearTimeout(typingTimeout)
    setTypingTimeout(
      setTimeout(() => {
        sendStopTyping()
      }, 2000)
    )
  })

  // Send message on Enter (without Shift)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(container, input)
    }
  })

  sendBtn.addEventListener("click", () => handleSendMessage(container, input))

  // Setup emoji button for inserting emojis
  setupEmojiButton(container, input)
}

// Setup emoji button click handler
function setupEmojiButton(
  container: HTMLElement,
  input: HTMLTextAreaElement
): void {
  const emojiBtn = container.querySelector("#github-chat-emoji-btn")
  if (!emojiBtn) return

  emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation()

    // Show emoji picker in insert mode
    showEmojiPickerForInsert(emojiBtn as HTMLElement, (emoji: string) => {
      // Insert emoji at cursor position
      insertEmojiAtCursor(input, emoji)
    })
  })
}

// Insert emoji at current cursor position in textarea
function insertEmojiAtCursor(input: HTMLTextAreaElement, emoji: string): void {
  const start = input.selectionStart
  const end = input.selectionEnd
  const text = input.value

  // Insert emoji at cursor position
  input.value = text.substring(0, start) + emoji + text.substring(end)

  // Move cursor to after the emoji
  const newCursorPos = start + emoji.length
  input.setSelectionRange(newCursorPos, newCursorPos)

  // Trigger input event to resize textarea
  input.dispatchEvent(new Event("input", { bubbles: true }))

  // Focus the input
  input.focus()
}

// Handle sending a message with optimistic UI update
async function handleSendMessage(
  container: HTMLElement,
  input: HTMLTextAreaElement
): Promise<void> {
  const text = input?.value.trim()
  if (!text || !currentConversationId) return

  // Stop typing indicator
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    setTypingTimeout(null)
  }
  sendStopTyping()

  // Check if we're in edit mode
  const editingMsg = getEditingMessage()
  if (editingMsg) {
    // Handle edit submission
    await handleEditMessage(editingMsg.id, text, input)
    return
  }

  // Get quoted message if replying
  const quotedMsg = getQuotedMessage()
  const replyToId = quotedMsg?.id || undefined

  // Generate a temporary ID for the optimistic message
  const tempId = `pending-${incrementPendingMessageId()}`

  // Clear input and quote preview immediately for better UX
  const messageText = text
  input.value = ""
  input.style.height = "auto"
  input?.focus()

  // Clear quote state and hide preview
  if (quotedMsg) {
    clearQuotedMessage()
    hideQuotePreview()
  }

  // Add message to UI immediately with pending status (optimistic update)
  const msgContainer = container.querySelector("#github-chat-messages")
  const emptyState = msgContainer?.querySelector(".github-chat-empty")
  if (emptyState) emptyState.remove()

  // Build quoted content HTML if replying
  const quotedContentHtml = quotedMsg
    ? `<div class="github-chat-quoted-content">
        <span class="github-chat-quoted-sender">@${escapeHtml(quotedMsg.senderUsername)}</span>
        <span class="github-chat-quoted-text">${escapeHtml(quotedMsg.content.length > 50 ? quotedMsg.content.substring(0, 50) + "..." : quotedMsg.content)}</span>
      </div>`
    : ""

  const messageEl = document.createElement("div")
  messageEl.className = "github-chat-message sent"
  messageEl.id = tempId
  // Set a temporary created_at for edit window calculation (will be updated on success)
  const tempCreatedAt = new Date().toISOString()
  messageEl.setAttribute("data-created-at", tempCreatedAt)
  const pendingStatusIcon = `<span class="github-chat-status pending">${STATUS_ICONS.pending}</span>`
  messageEl.innerHTML = `
    <div class="github-chat-message-wrapper">
      <div class="github-chat-message-actions">
        <button class="github-chat-action-btn" data-action="reaction" title="Add reaction">
          ${MESSAGE_ACTION_ICONS.reaction}
        </button>
        <button class="github-chat-action-btn" data-action="options" title="More options">
          ${MESSAGE_ACTION_ICONS.options}
        </button>
      </div>
      <div class="github-chat-bubble">${quotedContentHtml}${escapeHtml(messageText)}</div>
    </div>
    <div class="github-chat-meta">
      <span class="github-chat-time">${formatTime(Date.now())}</span>
      ${pendingStatusIcon}
    </div>
  `
  msgContainer?.appendChild(messageEl)
  msgContainer?.scrollTo(0, msgContainer.scrollHeight)

  // Send to server (with replyToId if replying)
  const sentMessage = await apiSendMessage(
    currentConversationId,
    messageText,
    replyToId
  )

  // Update the optimistic message with the result
  const pendingEl = document.getElementById(tempId)
  if (pendingEl) {
    if (sentMessage) {
      // Success - update to sent status
      pendingEl.setAttribute("data-message-id", sentMessage.id.toString())
      pendingEl.setAttribute("data-created-at", sentMessage.created_at)
      pendingEl.removeAttribute("id")
      const statusEl = pendingEl.querySelector(".github-chat-status")
      if (statusEl) {
        statusEl.className = "github-chat-status sent"
        statusEl.innerHTML = STATUS_ICONS.sent
      }
      // Update cache with sent message
      const cachedData = messageCache.get(currentConversationId)
      if (cachedData) {
        cachedData.messages.push(sentMessage)
        cachedData.timestamp = Date.now()
      }
    } else {
      // Failed - show error status
      const statusEl = pendingEl.querySelector(".github-chat-status")
      if (statusEl) {
        statusEl.className = "github-chat-status failed"
        statusEl.innerHTML = STATUS_ICONS.failed
      }
    }
  }
}

// Handle editing an existing message
async function handleEditMessage(
  messageId: string,
  newContent: string,
  input: HTMLTextAreaElement
): Promise<void> {
  if (!currentConversationId) return

  // Clear edit state and preview
  clearEditingMessage()
  hideEditPreview()

  // Clear input
  input.value = ""
  input.style.height = "auto"

  // Call API to edit message
  const result = await apiEditMessage(
    currentConversationId,
    messageId,
    newContent
  )

  if (result.success) {
    // Update message in DOM within the current container
    const container = getChatContainer()
    const messageEl = container?.querySelector(
      `[data-message-id="${messageId}"]`
    )
    if (messageEl) {
      const bubbleEl = messageEl.querySelector(".github-chat-bubble")
      if (bubbleEl) {
        // Preserve quoted content if present
        const quotedContent = bubbleEl.querySelector(
          ".github-chat-quoted-content"
        )
        const quotedHtml = quotedContent ? quotedContent.outerHTML : ""
        bubbleEl.innerHTML = quotedHtml + escapeHtml(newContent)
      }

      // Add/update edited indicator in meta
      const metaEl = messageEl.querySelector(".github-chat-meta")
      if (metaEl) {
        let editedSpan = metaEl.querySelector(".github-chat-edited")
        if (!editedSpan) {
          editedSpan = document.createElement("span")
          editedSpan.className = "github-chat-edited"
          editedSpan.textContent = "(edited)"
          // Insert before time
          const timeEl = metaEl.querySelector(".github-chat-time")
          if (timeEl) {
            metaEl.insertBefore(editedSpan, timeEl)
          } else {
            metaEl.appendChild(editedSpan)
          }
        }
      }
    }

    // Update cache
    const cachedData = messageCache.get(currentConversationId)
    if (cachedData) {
      const msgIndex = cachedData.messages.findIndex((m) => m.id === messageId)
      if (msgIndex !== -1) {
        cachedData.messages[msgIndex].content = newContent
        cachedData.messages[msgIndex].edited_at = new Date().toISOString()
      }
    }
  } else {
    // Show error - could add a toast here
    console.error("Failed to edit message:", result.error)
  }
}
