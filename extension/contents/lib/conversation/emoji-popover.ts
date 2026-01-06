// Quick emoji popover for reactions

import {
  getCurrentConversationId,
  getCurrentUserId,
  getCurrentUsername
} from "../state"
import { handleReactionOptimistic } from "./reactions"

// Quick reaction emojis (13 total: 7 top row, 6 bottom row + expand button)
export const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🎉", // Top row
  "🔥",
  "👀",
  "🚀",
  "💯",
  "✅",
  "👎" // Bottom row
]

// Currently open emoji popover (only one at a time)
let currentEmojiPopover: HTMLElement | null = null

// Create emoji popover HTML
export function createEmojiPopover(messageId: string): HTMLElement {
  const popover = document.createElement("div")
  popover.className = "github-chat-emoji-popover"
  popover.dataset.messageId = messageId

  const emojiButtons = QUICK_EMOJIS.map(
    (emoji) =>
      `<button class="github-chat-emoji-btn" data-emoji="${emoji}">${emoji}</button>`
  ).join("")

  popover.innerHTML = `
    <div class="github-chat-emoji-grid">
      ${emojiButtons}
      <button class="github-chat-emoji-expand" title="More emojis">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4Z"></path></svg>
      </button>
    </div>
  `

  return popover
}

// Close any open emoji popover
export function closeEmojiPopover(): void {
  if (currentEmojiPopover) {
    currentEmojiPopover.remove()
    currentEmojiPopover = null
  }
}

// Handle clicks outside the popover
function handleOutsideClick(e: MouseEvent): void {
  if (currentEmojiPopover && !currentEmojiPopover.contains(e.target as Node)) {
    closeEmojiPopover()
    document.removeEventListener("click", handleOutsideClick)
  }
}

// Show emoji popover for a message
export function showEmojiPopover(
  reactionBtn: HTMLElement,
  messageId: string
): void {
  // Close any existing popover
  closeEmojiPopover()

  const popover = createEmojiPopover(messageId)

  // Position relative to the bubble for consistent placement
  const bubbleEl = reactionBtn
    .closest(".github-chat-message-wrapper")
    ?.querySelector(".github-chat-bubble")
  if (!bubbleEl) return

  bubbleEl.appendChild(popover)
  currentEmojiPopover = popover

  // Add click handlers for emoji buttons
  popover.querySelectorAll(".github-chat-emoji-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const emoji = (btn as HTMLElement).dataset.emoji
      const conversationId = getCurrentConversationId()
      const userId = getCurrentUserId()
      const username = getCurrentUsername()

      if (!emoji || !conversationId || !userId || !username) return

      closeEmojiPopover()

      // Check if user already reacted with this emoji
      const messageEl = document.querySelector(
        `.github-chat-message[data-message-id="${messageId}"]`
      )
      const existingReaction = messageEl?.querySelector(
        `.github-chat-reaction[data-emoji="${emoji}"][data-user-reacted="true"]`
      )

      // Use optimistic update (isAdding = true if no existing reaction)
      await handleReactionOptimistic(
        conversationId,
        messageId,
        emoji,
        !existingReaction,
        userId,
        username
      )
    })
  })

  // Add click handler for expand button
  popover
    .querySelector(".github-chat-emoji-expand")
    ?.addEventListener("click", async (e) => {
      e.stopPropagation()
      // Get the bubble element (popover's parent) before closing popover
      const bubbleEl = popover.parentElement as HTMLElement
      closeEmojiPopover()
      if (bubbleEl) {
        // Dynamic import to avoid circular dependency
        const { showFullEmojiPicker } = await import("./emoji-picker")
        showFullEmojiPicker(bubbleEl, messageId)
      }
    })

  // Close popover when clicking outside
  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick)
  }, 0)
}
