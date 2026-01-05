// WebSocket handler for real-time conversation updates

import {
  joinConversation,
  markMessagesAsRead,
  type Message as ApiMessage
} from "~lib/api"

import { messageCache, setWsCleanup } from "../state"
import { STATUS_ICONS } from "../types"
import { escapeHtml, formatTime } from "../utils"
import { generateTypingIndicatorHTML } from "./layout"
import { MESSAGE_ACTION_ICONS } from "./message-html"
import { updateReactionInDOM } from "./reactions"
import { scheduleMarkAsRead } from "./read-status"

// Typing indicator management
let typingIndicatorEl: HTMLElement | null = null

function showTypingIndicator(
  container: HTMLElement,
  typingUsername: string
): void {
  if (typingIndicatorEl) return // Already showing

  typingIndicatorEl = document.createElement("div")
  typingIndicatorEl.className = "github-chat-typing-indicator"
  typingIndicatorEl.innerHTML = generateTypingIndicatorHTML(typingUsername)

  const msgContainer = container.querySelector("#github-chat-messages")
  msgContainer?.appendChild(typingIndicatorEl)
  msgContainer?.scrollTo(0, msgContainer.scrollHeight)
}

function hideTypingIndicator(): void {
  if (typingIndicatorEl) {
    typingIndicatorEl.remove()
    typingIndicatorEl = null
  }
}

// Setup WebSocket subscription for real-time updates
export async function setupWebSocketHandler(
  container: HTMLElement,
  conversationId: string,
  otherUserId: string,
  currentUserId: string | null,
  unreadMessageIds: string[]
): Promise<void> {
  try {
    const cleanup = await joinConversation(conversationId, {
      onMessage: (newMessage: ApiMessage) => {
        if (newMessage.sender_id !== otherUserId) return

        hideTypingIndicator()

        // Update cache with new message (check for duplicates)
        const cachedData = messageCache.get(conversationId)
        if (cachedData) {
          const exists = cachedData.messages.some((m) => m.id === newMessage.id)
          if (!exists) {
            cachedData.messages.push(newMessage)
            cachedData.timestamp = Date.now()
          }
        }

        // Check if message already displayed in the DOM
        const msgContainer = container.querySelector("#github-chat-messages")
        const existingMsgEl = msgContainer?.querySelector(
          `[data-message-id="${newMessage.id}"]`
        )
        if (existingMsgEl) return // Already displayed, skip

        const emptyState = msgContainer?.querySelector(".github-chat-empty")
        if (emptyState) emptyState.remove()

        const messageEl = document.createElement("div")
        messageEl.className = "github-chat-message received"
        messageEl.setAttribute("data-message-id", newMessage.id.toString())
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
            <div class="github-chat-bubble">${escapeHtml(newMessage.content)}</div>
          </div>
          <div class="github-chat-meta">
            <span class="github-chat-time">${formatTime(new Date(newMessage.created_at).getTime())}</span>
          </div>
        `
        msgContainer?.appendChild(messageEl)
        msgContainer?.scrollTo(0, msgContainer.scrollHeight)

        // Mark as read immediately - user is actively viewing this conversation
        markMessagesAsRead([newMessage.id])
      },

      onTyping: (_typingUserId: string, typingUsername: string) => {
        showTypingIndicator(container, typingUsername)
      },

      onStopTyping: (_typingUserId: string) => {
        hideTypingIndicator()
      },

      onMessagesRead: (readMessageIds: string[]) => {
        readMessageIds.forEach((id) => {
          const msgEl = container?.querySelector(`[data-message-id="${id}"]`)
          if (msgEl && msgEl.classList.contains("sent")) {
            const statusEl = msgEl.querySelector(".github-chat-status")
            if (statusEl) {
              statusEl.className = "github-chat-status read"
              statusEl.innerHTML = STATUS_ICONS.read
            }
          }
        })
      },

      onReaction: (
        type: "added" | "removed",
        messageId: string,
        emoji: string,
        reactionUserId: string,
        reactionUsername: string
      ) => {
        updateReactionInDOM(
          messageId,
          emoji,
          reactionUserId,
          reactionUsername,
          type === "added",
          currentUserId
        )
      }
    })

    setWsCleanup(cleanup)

    // Schedule marking as read after a delay (gives user time to actually read)
    scheduleMarkAsRead(conversationId, unreadMessageIds)
  } catch (error) {
    console.error("WebSocket error:", error)
  }
}
