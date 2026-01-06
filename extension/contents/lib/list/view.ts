// List view rendering

import { renderConversationViewAnimated } from "../conversation"
import {
  CHAT_LIST_CACHE_TTL,
  chatListCache,
  getChatDrawer,
  getNavigationCallbacks,
  setCurrentView
} from "../state"
import type { ChatPreview } from "../types"
import { escapeHtml, formatRelativeTime } from "../utils"
import { getAllChats } from "./data"
import { startListMessageListener } from "./message-listener"

// Icons
const ICONS = {
  expand: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.75 2h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0v-2.5C2 2.784 2.784 2 3.75 2Zm6.5 0h2.5C13.216 2 14 2.784 14 3.75v2.5a.75.75 0 0 1-1.5 0v-2.5a.25.25 0 0 0-.25-.25h-2.5a.75.75 0 0 1 0-1.5ZM3.5 9.75a.75.75 0 0 0-1.5 0v2.5c0 .966.784 1.75 1.75 1.75h2.5a.75.75 0 0 1 0-1.5h-2.5a.25.25 0 0 1-.25-.25v-2.5Zm10 0a.75.75 0 0 0-1.5 0v2.5a.25.25 0 0 1-.25.25h-2.5a.75.75 0 0 0 0 1.5h2.5c.966 0 1.75-.784 1.75-1.75v-2.5Z"></path></svg>`,
  close: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>`
}

// Generate list view inner HTML
export function generateListViewInnerHTML(chats: ChatPreview[]): string {
  return `
    <div class="github-chat-header">
      <div class="github-chat-user-info">
        <span class="github-chat-display-name">Messages</span>
        <span class="github-chat-username">${chats.length} conversation${chats.length !== 1 ? "s" : ""}</span>
      </div>
      <button class="github-chat-expand" aria-label="Expand" title="Open expanded view">
        ${ICONS.expand}
      </button>
      <button class="github-chat-close" aria-label="Close">
        ${ICONS.close}
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
  const root = container || getChatDrawer()
  if (!root) return

  const closeBtn = root.querySelector(".github-chat-close")
  closeBtn?.addEventListener("click", () => {
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()
  })

  // Expand button handler
  const expandBtn = root.querySelector(".github-chat-expand")
  expandBtn?.addEventListener("click", async () => {
    // Close the drawer first
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()

    // Open expanded view
    const { openExpandedView } = await import("../expanded-view")
    openExpandedView()
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
  const chatDrawer = getChatDrawer()
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
      const drawer = getChatDrawer()
      if (drawer) {
        drawer.innerHTML = generateListViewInnerHTML(freshChats)
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
  const chatDrawer = getChatDrawer()
  if (!chatDrawer) return

  // Start listening for new messages
  startListMessageListener()

  // Use cached chats for instant rendering
  const hasCachedChats =
    chatListCache && Date.now() - chatListCache.timestamp < CHAT_LIST_CACHE_TTL
  const cachedChats = hasCachedChats ? chatListCache.chats : []

  // Create new view element with animation
  const viewEl = document.createElement("div")
  viewEl.className = `github-chat-view ${animationClass}`

  // Show loading state if no cached chats, otherwise show cached chats
  if (!hasCachedChats) {
    viewEl.innerHTML = `
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
  } else {
    viewEl.innerHTML = generateListViewInnerHTML(cachedChats)
  }

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
    // Fallback: remove after timeout in case animation doesn't fire
    setTimeout(() => {
      if (oldView.isConnected) oldView.remove()
    }, 300)
  }

  chatDrawer.appendChild(viewEl)

  // Add close button listener for loading state
  if (!hasCachedChats) {
    const closeBtn = viewEl.querySelector(".github-chat-close")
    closeBtn?.addEventListener("click", () => {
      const nav = getNavigationCallbacks()
      nav?.closeChatDrawer()
    })
  } else {
    setupListViewEventListeners(cachedChats, viewEl)
  }

  // Always refresh chats in background and update the view
  getAllChats().then((freshChats) => {
    // Always re-render with fresh data to update unread counts
    if (viewEl.isConnected) {
      viewEl.innerHTML = generateListViewInnerHTML(freshChats)
      setupListViewEventListeners(freshChats, viewEl)
    }
  })
}
