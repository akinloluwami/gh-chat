// Input handling for conversation view - textarea, typing, sending messages

import {
  sendMessage as apiSendMessage,
  sendStopTyping,
  sendTypingIndicator
} from "~lib/api"

import {
  currentConversationId,
  incrementPendingMessageId,
  messageCache,
  setTypingTimeout,
  typingTimeout
} from "../state"
import { STATUS_ICONS } from "../types"
import { escapeHtml, formatTime } from "../utils"
import { MESSAGE_ACTION_ICONS } from "./message-html"

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

  // Generate a temporary ID for the optimistic message
  const tempId = `pending-${incrementPendingMessageId()}`

  // Clear input immediately for better UX
  const messageText = text
  input.value = ""
  input.style.height = "auto"
  input?.focus()

  // Add message to UI immediately with pending status (optimistic update)
  const msgContainer = container.querySelector("#github-chat-messages")
  const emptyState = msgContainer?.querySelector(".github-chat-empty")
  if (emptyState) emptyState.remove()

  const messageEl = document.createElement("div")
  messageEl.className = "github-chat-message sent"
  messageEl.id = tempId
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
      <div class="github-chat-bubble">${escapeHtml(messageText)}</div>
    </div>
    <div class="github-chat-meta">
      <span class="github-chat-time">${formatTime(Date.now())}</span>
      ${pendingStatusIcon}
    </div>
  `
  msgContainer?.appendChild(messageEl)
  msgContainer?.scrollTo(0, msgContainer.scrollHeight)

  // Send to server
  const sentMessage = await apiSendMessage(currentConversationId, messageText)

  // Update the optimistic message with the result
  const pendingEl = document.getElementById(tempId)
  if (pendingEl) {
    if (sentMessage) {
      // Success - update to sent status
      pendingEl.setAttribute("data-message-id", sentMessage.id.toString())
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
