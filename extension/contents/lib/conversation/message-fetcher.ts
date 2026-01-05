// Message fetching and rendering logic

import { getMessages, type Message as ApiMessage } from "~lib/api"

import { messageCache } from "../state"
import { STATUS_ICONS } from "../types"
import { generateEmptyConversationHTML } from "./layout"
import { generateMessageHTML } from "./message-html"

// Build initial messages HTML from cache
export function buildInitialMessagesHTML(
  cached: { messages: ApiMessage[]; hasMore: boolean } | null,
  userId: string | null
): { html: string; canUseInstantly: boolean } {
  const hasCachedMessages = cached && cached.messages.length > 0

  if (!hasCachedMessages || !userId) {
    return {
      html: '<div class="github-chat-loading">Loading...</div>',
      canUseInstantly: false
    }
  }

  const html = cached.messages
    .map((msg: ApiMessage) => {
      const isSent = msg.sender_id === userId
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
        userId,
        msg.reply_to
      )
    })
    .join("")

  return { html, canUseInstantly: true }
}

// Fetch and render messages when not using cache
export async function fetchAndRenderMessages(
  container: HTMLElement,
  conversationId: string,
  otherUserId: string,
  hasAccount: boolean,
  username: string,
  userId: string | null
): Promise<{ hasMore: boolean; unreadIds: string[] }> {
  const { messages, hasMore } = await getMessages(conversationId)
  const unreadIds: string[] = []

  messageCache.set(conversationId, {
    messages,
    hasMore,
    timestamp: Date.now()
  })

  const msgContainer = container.querySelector("#github-chat-messages")
  if (msgContainer) {
    if (messages.length === 0) {
      msgContainer.innerHTML = generateEmptyConversationHTML(
        username,
        hasAccount
      )
    } else {
      msgContainer.innerHTML = messages
        .map((msg: ApiMessage) => {
          const isReceived = msg.sender_id === otherUserId
          const isSent = !isReceived

          if (isReceived && !msg.read_at) {
            unreadIds.push(msg.id)
          }

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
            userId,
            msg.reply_to
          )
        })
        .join("")
    }
    msgContainer.scrollTo(0, msgContainer.scrollHeight)
  }

  return { hasMore, unreadIds }
}

// Refresh cache in background
export function refreshCacheInBackground(conversationId: string): void {
  getMessages(conversationId).then(({ messages: freshMessages, hasMore }) => {
    messageCache.set(conversationId, {
      messages: freshMessages,
      hasMore,
      timestamp: Date.now()
    })
  })
}
