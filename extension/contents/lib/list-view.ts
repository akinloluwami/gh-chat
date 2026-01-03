// List view rendering and logic
import { getConversations, getMessages, type Conversation } from "~lib/api"

import { renderConversationViewAnimated } from "./conversation-view"
import {
  CACHE_TTL,
  CHAT_LIST_CACHE_TTL,
  chatDrawer,
  chatListCache,
  getNavigationCallbacks,
  messageCache,
  setChatListCache
} from "./state"
import type { ChatPreview } from "./types"
import { escapeHtml, formatRelativeTime } from "./utils"

// Prefetch messages for a conversation in the background
export async function prefetchMessages(conversationId: number): Promise<void> {
  const cached = messageCache.get(conversationId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return

  try {
    const messages = await getMessages(conversationId)
    messageCache.set(conversationId, { messages, timestamp: Date.now() })
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
    unread: false,
    hasAccount: conv.other_has_account,
    conversationId: conv.id
  }))

  // Update cache
  setChatListCache({ chats, timestamp: Date.now() })

  return chats
}

// Generate list view inner HTML
export function generateListViewInnerHTML(chats: ChatPreview[]): string {
  return `
    <div class="github-chat-header">
      <div class="github-chat-user-info">
        <span class="github-chat-display-name">Messages</span>
        <span class="github-chat-username">${chats.length} conversation${chats.length !== 1 ? "s" : ""}</span>
      </div>
      <button class="github-chat-close" aria-label="Close">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
        </svg>
      </button>
    </div>
    <div class="github-chat-list">
      ${
        chats.length === 0
          ? `<div class="github-chat-empty">
            <svg viewBox="0 0 16 16" width="48" height="48" style="opacity: 0.3; margin-bottom: 12px;">
              <path fill="currentColor" d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"></path>
            </svg>
            <p>No conversations yet</p>
            <p class="github-chat-empty-hint">Visit a GitHub profile and click Chat to start messaging!</p>
          </div>`
          : chats
              .map(
                (chat) => `
            <div class="github-chat-list-item" data-username="${chat.username}" data-conversation-id="${chat.conversationId}">
              <div class="github-chat-list-avatar-wrapper">
                <img src="${chat.avatar}" alt="${chat.displayName}" class="github-chat-list-avatar" />
                ${!chat.hasAccount ? '<span class="github-chat-not-on-platform-badge" title="Not on GitHub Chat yet">!</span>' : ""}
              </div>
              <div class="github-chat-list-content">
                <div class="github-chat-list-header">
                  <span class="github-chat-list-name">${escapeHtml(chat.displayName)}</span>
                  <span class="github-chat-list-time">${formatRelativeTime(chat.lastMessageTime)}</span>
                </div>
                <p class="github-chat-list-preview">${escapeHtml(chat.lastMessage)}</p>
              </div>
            </div>
          `
              )
              .join("")
      }
    </div>
  `
}

// Setup event listeners for list view
export function setupListViewEventListeners(
  chats: ChatPreview[],
  container?: Element
): void {
  const root = container || chatDrawer
  if (!root) return

  const closeBtn = root.querySelector(".github-chat-close")
  closeBtn?.addEventListener("click", () => {
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()
  })

  const chatItems = root.querySelectorAll(".github-chat-list-item")
  chatItems.forEach((item) => {
    item.addEventListener("click", async () => {
      const username = item.getAttribute("data-username")
      const conversationId = item.getAttribute("data-conversation-id")
      if (username) {
        const chat = chats.find((c) => c.username === username)
        renderConversationViewAnimated(
          username,
          chat?.displayName || username,
          chat?.avatar || `https://github.com/${username}.png`,
          conversationId ? parseInt(conversationId) : undefined
        )
      }
    })
  })
}

// Render list view inside the drawer
export async function renderListView(): Promise<void> {
  if (!chatDrawer) return

  const chats = await getAllChats()
  chatDrawer.innerHTML = generateListViewInnerHTML(chats)
  setupListViewEventListeners(chats)
}

// Render list view with animation (uses cache for instant display)
export function renderListViewAnimated(animationClass: string): void {
  if (!chatDrawer) return

  // Use cached chats for instant rendering
  const chats =
    chatListCache && Date.now() - chatListCache.timestamp < CHAT_LIST_CACHE_TTL
      ? chatListCache.chats
      : []

  // Create new view element with animation
  const viewEl = document.createElement("div")
  viewEl.className = `github-chat-view ${animationClass}`
  viewEl.innerHTML = generateListViewInnerHTML(chats)

  // Remove old view after animation
  const oldView = chatDrawer.querySelector(".github-chat-view")
  if (oldView) {
    oldView.addEventListener(
      "animationend",
      () => {
        oldView.remove()
      },
      { once: true }
    )
  }

  chatDrawer.appendChild(viewEl)
  setupListViewEventListeners(chats, viewEl)

  // Refresh chats in background
  getAllChats()
}
