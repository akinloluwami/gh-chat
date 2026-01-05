// Infinite scroll and message loading for conversation view

import { getMessages, type Message as ApiMessage } from "~lib/api"

import { messageCache } from "../state"
import { STATUS_ICONS } from "../types"
import { generateMessageHTML } from "./message-html"

// Create infinite scroll handler
export function setupInfiniteScroll(
  msgContainer: HTMLElement,
  conversationId: string,
  otherUserId: string,
  currentUserId: string | null,
  initialHasMore: boolean
): void {
  let hasMoreMessages = initialHasMore
  let isLoadingMore = false

  async function loadMoreMessages(): Promise<void> {
    if (isLoadingMore || !hasMoreMessages || !msgContainer) return

    const firstMessage = msgContainer.querySelector(".github-chat-message")
    const oldestMessageId = firstMessage?.getAttribute("data-message-id")
    if (!oldestMessageId) return

    isLoadingMore = true

    // Show loading indicator at top
    const loadingEl = document.createElement("div")
    loadingEl.className = "github-chat-loading-more"
    loadingEl.innerHTML = '<div class="github-chat-loading-spinner"></div>'
    msgContainer.insertBefore(loadingEl, msgContainer.firstChild)

    // Remember scroll position
    const scrollHeightBefore = msgContainer.scrollHeight

    try {
      const { messages: olderMessages, hasMore } = await getMessages(
        conversationId,
        oldestMessageId
      )
      hasMoreMessages = hasMore

      // Update cache
      const cached = messageCache.get(conversationId)
      if (cached) {
        cached.messages = [...olderMessages, ...cached.messages]
        cached.hasMore = hasMore
        cached.timestamp = Date.now()
      }

      // Remove loading indicator
      loadingEl.remove()

      if (olderMessages.length > 0) {
        // Prepend older messages
        const messagesHtml = olderMessages
          .map((msg: ApiMessage) => {
            const isReceived = msg.sender_id === otherUserId
            const isSent = !isReceived

            let statusIcon = ""
            if (isSent) {
              const statusClass = msg.read_at ? "read" : "sent"
              statusIcon = `<span class="github-chat-status ${statusClass}">${msg.read_at ? STATUS_ICONS.read : STATUS_ICONS.sent}</span>`
            }

            return generateMessageHTML(
              msg.id,
              msg.content,
              msg.created_at,
              isSent,
              statusIcon,
              msg.reactions || [],
              currentUserId
            )
          })
          .join("")

        // Insert at top - use a wrapper to maintain order
        const tempDiv = document.createElement("div")
        tempDiv.innerHTML = messagesHtml

        // Get the first existing message to insert before
        const firstExistingMessage = msgContainer.firstChild

        // Insert all new messages before the first existing one (maintains order)
        while (tempDiv.firstChild) {
          msgContainer.insertBefore(tempDiv.firstChild, firstExistingMessage)
        }

        // Maintain scroll position
        const scrollHeightAfter = msgContainer.scrollHeight
        msgContainer.scrollTop = scrollHeightAfter - scrollHeightBefore
      }
    } catch (error) {
      console.error("Failed to load more messages:", error)
      loadingEl.remove()
    }

    isLoadingMore = false
  }

  // Add scroll listener for infinite scroll
  msgContainer.addEventListener("scroll", () => {
    // Load more when near the top (within 100px)
    if (msgContainer.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
      loadMoreMessages()
    }
  })
}
