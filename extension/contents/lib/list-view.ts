// List view rendering and logic
import {
  getConversations,
  getMessages,
  setGlobalMessageListener,
  type Conversation,
  type Message
} from "~lib/api"

import { renderConversationViewAnimated } from "./conversation-view"
import {
  CACHE_TTL,
  CHAT_LIST_CACHE_TTL,
  chatDrawer,
  chatListCache,
  currentUserId,
  currentView,
  getNavigationCallbacks,
  messageCache,
  setChatListCache
} from "./state"
import type { ChatPreview } from "./types"
import { escapeHtml, formatRelativeTime } from "./utils"

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
    conversationId: conv.id
  }))

  // Update cache
  setChatListCache({ chats, timestamp: Date.now() })

  return chats
}

// Update a single conversation in the list when a new message arrives
function updateConversationInList(
  conversationId: string,
  message: Message
): void {
  // Only update if we're on the list view
  if (currentView !== "list" || !chatDrawer) return

  // Update the message cache so the conversation shows the new message when opened
  const cached = messageCache.get(conversationId)
  if (cached) {
    // Add the new message to the cache
    cached.messages.push(message)
    cached.timestamp = Date.now()
  }

  // Check if this is our own message (don't show unread for sent messages)
  const isOwnMessage = message.sender_id === currentUserId

  const listItem = chatDrawer.querySelector(
    `.github-chat-list-item[data-conversation-id="${conversationId}"]`
  )

  if (listItem) {
    // Update the preview text
    const preview = listItem.querySelector(".github-chat-list-preview")
    if (preview) {
      preview.textContent = message.content
    }

    // Update the time
    const time = listItem.querySelector(".github-chat-list-time")
    if (time) {
      time.textContent = formatRelativeTime(Date.now())
    }

    // Only show unread badge for messages from others
    if (!isOwnMessage) {
      // Increment unread count badge
      const messageRow = listItem.querySelector(".github-chat-list-message-row")
      let badge = listItem.querySelector(".github-chat-list-unread-badge")
      if (badge) {
        const currentCount = parseInt(badge.textContent || "0") || 0
        const newCount = currentCount + 1
        badge.textContent = newCount > 99 ? "99+" : String(newCount)
      } else if (messageRow) {
        // Create new badge
        badge = document.createElement("span")
        badge.className = "github-chat-list-unread-badge"
        badge.textContent = "1"
        messageRow.appendChild(badge)
      }

      // Add unread class
      listItem.classList.add("unread")

      // Also update the header unread badge
      const nav = getNavigationCallbacks()
      nav?.refreshUnreadBadge()
    }

    // Move to top of list
    const chatList = chatDrawer.querySelector(".github-chat-list")
    if (chatList && listItem.parentElement === chatList) {
      chatList.insertBefore(listItem, chatList.firstChild)
    }
  } else {
    // Conversation not in list - refresh the whole list
    getAllChats().then((freshChats) => {
      const viewEl =
        chatDrawer?.querySelector(".github-chat-view") || chatDrawer
      if (viewEl) {
        viewEl.innerHTML = generateListViewInnerHTML(freshChats)
        setupListViewEventListeners(freshChats, viewEl as Element)
      }
      // Update header badge
      const nav = getNavigationCallbacks()
      nav?.refreshUnreadBadge()
    })
  }
}

// Start listening for new messages to update the list
export function startListMessageListener(): void {
  setGlobalMessageListener((conversationId, message) => {
    updateConversationInList(conversationId, message)
  })
}

// Stop listening for new messages
export function stopListMessageListener(): void {
  setGlobalMessageListener(null)
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
            <div class="github-chat-list-item${chat.unread ? " unread" : ""}" data-username="${chat.username}" data-conversation-id="${chat.conversationId}">
              <div class="github-chat-list-avatar-wrapper">
                <img src="${chat.avatar}" alt="${chat.displayName}" class="github-chat-list-avatar" />
                ${!chat.hasAccount ? '<span class="github-chat-not-on-platform-badge" title="Not on GH Chat yet">!</span>' : ""}
              </div>
              <div class="github-chat-list-content">
                <div class="github-chat-list-header">
                  <span class="github-chat-list-name">${escapeHtml(chat.displayName)}</span>
                  <span class="github-chat-list-time">${formatRelativeTime(chat.lastMessageTime)}</span>
                </div>
                <div class="github-chat-list-message-row">
                  <p class="github-chat-list-preview">${escapeHtml(chat.lastMessage)}</p>
                  ${chat.unreadCount && chat.unreadCount > 0 ? `<span class="github-chat-list-unread-badge">${chat.unreadCount > 99 ? "99+" : chat.unreadCount}</span>` : ""}
                </div>
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
          conversationId || undefined
        )
      }
    })
  })
}

// Render list view inside the drawer
export async function renderListView(): Promise<void> {
  if (!chatDrawer) return

  // Start listening for new messages
  startListMessageListener()

  // Check for cached chats for instant display
  const cachedChats =
    chatListCache && Date.now() - chatListCache.timestamp < CHAT_LIST_CACHE_TTL
      ? chatListCache.chats
      : null

  if (cachedChats) {
    // Use cached data for instant rendering
    chatDrawer.innerHTML = generateListViewInnerHTML(cachedChats)
    setupListViewEventListeners(cachedChats)

    // Refresh in background
    getAllChats().then((freshChats) => {
      if (chatDrawer) {
        chatDrawer.innerHTML = generateListViewInnerHTML(freshChats)
        setupListViewEventListeners(freshChats)
      }
    })
  } else {
    // Show loading state immediately
    chatDrawer.innerHTML = `
      <div class="github-chat-header">
        <div class="github-chat-user-info">
          <span class="github-chat-display-name">Messages</span>
          <span class="github-chat-username">Loading...</span>
        </div>
        <button class="github-chat-close" aria-label="Close">
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
        </button>
      </div>
      <div class="github-chat-list" style="display: flex; align-items: center; justify-content: center;">
        <div class="github-chat-loading-spinner"></div>
      </div>
    `

    // Add close button listener
    const closeBtn = chatDrawer.querySelector(".github-chat-close")
    closeBtn?.addEventListener("click", () => {
      const nav = getNavigationCallbacks()
      nav?.closeChatDrawer()
    })

    // Fetch chats and render
    const chats = await getAllChats()
    chatDrawer.innerHTML = generateListViewInnerHTML(chats)
    setupListViewEventListeners(chats)
  }
}

// Render list view with animation (uses cache for instant display)
export function renderListViewAnimated(animationClass: string): void {
  if (!chatDrawer) return

  // Start listening for new messages
  startListMessageListener()

  // Use cached chats for instant rendering
  const cachedChats =
    chatListCache && Date.now() - chatListCache.timestamp < CHAT_LIST_CACHE_TTL
      ? chatListCache.chats
      : []

  // Create new view element with animation
  const viewEl = document.createElement("div")
  viewEl.className = `github-chat-view ${animationClass}`
  viewEl.innerHTML = generateListViewInnerHTML(cachedChats)

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
  setupListViewEventListeners(cachedChats, viewEl)

  // Always refresh chats in background and update the view
  getAllChats().then((freshChats) => {
    // Always re-render with fresh data to update unread counts
    if (viewEl.isConnected) {
      viewEl.innerHTML = generateListViewInnerHTML(freshChats)
      setupListViewEventListeners(freshChats, viewEl)
    }
  })
}
