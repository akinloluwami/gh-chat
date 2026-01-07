// Chat list data fetching

import { getConversations, getMessages, type Conversation } from "~lib/api"

import { CACHE_TTL, messageCache, setChatListCache } from "../state"
import type { ChatPreview } from "../types"

// Prefetch messages for a conversation in the background
export async function prefetchMessages(conversationId: string): Promise<void> {
  const cached = messageCache.get(conversationId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return

  try {
    const { messages } = await getMessages(conversationId)
    messageCache.set(conversationId, {
      messages,
      hasMore: messages.length >= 50,
      timestamp: Date.now()
    })
  } catch {
    // Silently fail - we'll fetch again when opening
  }
}

// Get all chats from API
export async function getAllChats(): Promise<ChatPreview[]> {
  const conversations = await getConversations()

  // Prefetch messages for recent conversations in background
  conversations.slice(0, 5).forEach((conv) => {
    prefetchMessages(conv.id)
  })

  const chats = conversations.map((conv: Conversation) => ({
    username: conv.other_username,
    displayName: conv.other_display_name || conv.other_username,
    avatar: conv.other_avatar_url,
    lastMessage: conv.last_message || "",
    lastMessageTime: conv.last_message_time
      ? new Date(conv.last_message_time).getTime()
      : new Date(conv.updated_at).getTime(),
    unread: conv.unread_count > 0,
    unreadCount: conv.unread_count,
    hasAccount: conv.other_has_account,
    conversationId: conv.id,
    isPinned: conv.is_pinned
  }))

  // Update cache
  setChatListCache({ chats, timestamp: Date.now() })

  return chats
}
