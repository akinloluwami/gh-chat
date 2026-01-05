// Read status management with delayed marking

import { markConversationAsRead, markMessagesAsRead } from "~lib/api"

import { getNavigationCallbacks, setChatListCache } from "../state"

// Pending read timeout - cancelled if user leaves conversation quickly
let pendingReadTimeout: ReturnType<typeof setTimeout> | null = null
let pendingReadConversationId: string | null = null
let pendingReadMessageIds: string[] = []

// Cancel any pending mark-as-read operation
export function cancelPendingRead(): void {
  if (pendingReadTimeout) {
    clearTimeout(pendingReadTimeout)
    pendingReadTimeout = null
  }
  pendingReadConversationId = null
  pendingReadMessageIds = []
}

// Schedule marking messages as read after a delay
export function scheduleMarkAsRead(
  conversationId: string,
  messageIds: string[]
): void {
  // Cancel any existing pending read
  cancelPendingRead()

  pendingReadConversationId = conversationId
  pendingReadMessageIds = messageIds

  // Wait 1.5 seconds before marking as read - gives user time to actually read
  pendingReadTimeout = setTimeout(() => {
    if (pendingReadConversationId === conversationId) {
      // Mark conversation as read
      markConversationAsRead(conversationId).then(() => {
        setChatListCache(null)
        const nav = getNavigationCallbacks()
        nav?.refreshUnreadBadge()
      })

      // Mark individual messages as read
      if (pendingReadMessageIds.length > 0) {
        markMessagesAsRead(pendingReadMessageIds)
      }
    }
    pendingReadTimeout = null
    pendingReadConversationId = null
    pendingReadMessageIds = []
  }, 1500)
}

// Helper to clear unread count in chat list cache when opening a conversation
export function clearUnreadInCache(conversationId: string): void {
  // This import must be done dynamically to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chatListCache } = require("../state")
  if (!chatListCache) return

  const chat = chatListCache.chats.find(
    (c: { conversationId: string }) => c.conversationId === conversationId
  )
  if (chat) {
    chat.unread = false
    chat.unreadCount = 0
  }
}
