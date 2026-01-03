import type { PlasmoCSConfig } from "plasmo"

import {
  sendMessage as apiSendMessage,
  disconnectWebSocket,
  ensureWebSocketConnected,
  getConversations,
  getMessages,
  getOrCreateConversation,
  joinConversation,
  markMessagesAsRead,
  sendStopTyping,
  sendTypingIndicator,
  type Message as ApiMessage,
  type Conversation,
  type OtherUser
} from "~lib/api"

import "./github.css"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"]
}

let currentUsername: string | null = null
let chatDrawer: HTMLElement | null = null
let chatOverlay: HTMLElement | null = null
let currentConversationId: number | null = null
let currentUserId: number | null = null
let wsCleanup: (() => void) | null = null
let pendingMessageId = 0 // For tracking optimistic messages
let typingTimeout: ReturnType<typeof setTimeout> | null = null
let currentView: "list" | "conversation" = "list"
let currentOtherUser: {
  username: string
  displayName: string
  avatar: string
} | null = null

// Message cache for instant loading
const messageCache: Map<number, { messages: ApiMessage[]; timestamp: number }> =
  new Map()
const CACHE_TTL = 30000 // 30 seconds

// Chat list cache for instant back navigation
let chatListCache: { chats: ChatPreview[]; timestamp: number } | null = null
const CHAT_LIST_CACHE_TTL = 10000 // 10 seconds

// Status icons
const STATUS_ICONS = {
  pending: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>`,
  sent: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`,
  read: `<svg viewBox="0 0 24 16" width="18" height="12"><path fill="currentColor" d="M11.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L4 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/><path fill="currentColor" d="M19.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0l-1.5-1.5a.751.751 0 0 1 1.06-1.06l.97.97 6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`,
  failed: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L9.06 8l3.22 3.22a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`
}

interface ChatPreview {
  username: string
  displayName: string
  avatar: string
  lastMessage: string
  lastMessageTime: number
  unread: boolean
  hasAccount: boolean
}

// Check if we're on a GitHub profile page
function isProfilePage(): boolean {
  const path = window.location.pathname
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0 || segments.length > 2) return false

  const profileHeader =
    document.querySelector('[itemtype="http://schema.org/Person"]') ||
    document.querySelector(".js-profile-editable-replace") ||
    document.querySelector('[data-hovercard-type="user"]')

  const nonProfilePaths = [
    "settings",
    "notifications",
    "explore",
    "marketplace",
    "pulls",
    "issues",
    "codespaces",
    "sponsors",
    "login",
    "signup",
    "organizations",
    "orgs",
    "new",
    "features"
  ]

  if (nonProfilePaths.includes(segments[0])) return false

  return (
    profileHeader !== null || document.querySelector(".vcard-names") !== null
  )
}

// Get username from the profile page
function getProfileUsername(): string | null {
  const vcardUsername = document.querySelector(".vcard-username")
  if (vcardUsername)
    return vcardUsername.textContent?.trim()?.replace("@", "") || null

  const pathSegments = window.location.pathname.split("/").filter(Boolean)
  if (pathSegments.length >= 1) {
    return pathSegments[0]
  }
  return null
}

// Get user avatar from the profile page
function getProfileAvatar(): string {
  const avatar =
    document.querySelector(".avatar-user") ||
    document.querySelector("img.avatar")
  return avatar instanceof HTMLImageElement
    ? avatar.src
    : "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
}

// Get display name from the profile page
function getProfileDisplayName(): string {
  const displayName =
    document.querySelector(".vcard-fullname") ||
    document.querySelector('[itemprop="name"]')
  return displayName?.textContent?.trim() || getProfileUsername() || "User"
}

// Check if user is authenticated and get user id
async function checkAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CHECK_AUTH" }, (response) => {
      resolve(response?.isAuthenticated || false)
    })
  })
}

// Get current user info
async function getCurrentUserInfo(): Promise<{
  id: number
  username: string
} | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_USER" }, (response) => {
      if (response?.user) {
        resolve({ id: response.user.id, username: response.user.username })
      } else {
        resolve(null)
      }
    })
  })
}

// Open login page
function openLogin(): void {
  chrome.runtime.sendMessage({ type: "OPEN_LOGIN" })
}

// Prefetch messages for a conversation in the background
async function prefetchMessages(conversationId: number): Promise<void> {
  // Skip if already cached and not stale
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
async function getAllChats(): Promise<ChatPreview[]> {
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
  chatListCache = { chats, timestamp: Date.now() }

  return chats
}

// Close chat drawer completely
function closeChatDrawer(): void {
  // Clean up typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    typingTimeout = null
  }

  // Stop typing indicator before closing
  sendStopTyping()

  // Clean up WebSocket connection
  if (wsCleanup) {
    wsCleanup()
    wsCleanup = null
  }
  currentConversationId = null
  currentOtherUser = null
  currentView = "list"

  if (chatDrawer) {
    chatDrawer.classList.remove("open")
  }
  if (chatOverlay) {
    chatOverlay.classList.remove("open")
  }
}

// Go back from conversation to list view
function goBackToList(): void {
  // Clean up typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    typingTimeout = null
  }

  // Stop typing indicator
  sendStopTyping()

  // Clean up WebSocket connection for this conversation
  if (wsCleanup) {
    wsCleanup()
    wsCleanup = null
  }
  currentConversationId = null
  currentOtherUser = null
  currentView = "list"

  // Animate transition: slide conversation out, slide list in
  if (chatDrawer) {
    const currentViewEl = chatDrawer.querySelector(".github-chat-view")
    if (currentViewEl) {
      currentViewEl.classList.add("slide-out-right")
    }

    // Create and render list view with animation
    renderListViewAnimated("slide-in-left")
  }
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return new Date(timestamp).toLocaleDateString()
}

// Open chat list drawer
async function openChatListDrawer(): Promise<void> {
  // Prefetch current user info for instant conversation loading
  if (!currentUserId) {
    getCurrentUserInfo().then((userInfo) => {
      currentUserId = userInfo?.id || null
    })
  }

  // Create overlay if not exists
  if (!chatOverlay) {
    chatOverlay = document.createElement("div")
    chatOverlay.className = "github-chat-overlay"
    chatOverlay.addEventListener("click", closeChatDrawer)
    document.body.appendChild(chatOverlay)
  }

  // Create drawer if not exists
  if (!chatDrawer) {
    chatDrawer = document.createElement("div")
    chatDrawer.className = "github-chat-drawer"
    document.body.appendChild(chatDrawer)
  }

  currentView = "list"
  await renderListView()

  // Open drawer
  requestAnimationFrame(() => {
    chatOverlay?.classList.add("open")
    chatDrawer?.classList.add("open")
  })
}

// Render list view inside the drawer
async function renderListView(): Promise<void> {
  if (!chatDrawer) return

  // Load all chats from API (updates cache)
  const chats = await getAllChats()

  // Render drawer content
  chatDrawer.innerHTML = generateListViewHTML(chats)
  setupListViewEventListeners(chats)
}

// Render list view with animation (uses cache for instant display)
function renderListViewAnimated(animationClass: string): void {
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

// Generate list view inner HTML (content only, no wrapper)
function generateListViewInnerHTML(chats: ChatPreview[]): string {
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
                (chat: any) => `
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

// Generate full list view HTML
function generateListViewHTML(chats: ChatPreview[]): string {
  return generateListViewInnerHTML(chats)
}

// Setup event listeners for list view
function setupListViewEventListeners(
  chats: ChatPreview[],
  container?: Element
): void {
  const root = container || chatDrawer
  if (!root) return

  const closeBtn = root.querySelector(".github-chat-close")
  closeBtn?.addEventListener("click", closeChatDrawer)

  const chatItems = root.querySelectorAll(".github-chat-list-item")
  chatItems.forEach((item) => {
    item.addEventListener("click", async () => {
      const username = item.getAttribute("data-username")
      const conversationId = item.getAttribute("data-conversation-id")
      if (username) {
        const chat = chats.find((c: any) => c.username === username)
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

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// Render conversation view with slide animation
async function renderConversationViewAnimated(
  username: string,
  displayName: string,
  avatar: string,
  existingConversationId?: number
): Promise<void> {
  if (!chatDrawer) return

  // Animate current view out to the left
  const currentViewEl = chatDrawer.querySelector(".github-chat-view")
  if (currentViewEl) {
    currentViewEl.classList.add("slide-out-left")
    currentViewEl.addEventListener(
      "animationend",
      () => {
        currentViewEl.remove()
      },
      { once: true }
    )
  }

  // Create new view with animation
  const viewEl = document.createElement("div")
  viewEl.className = "github-chat-view slide-in-right"
  chatDrawer.appendChild(viewEl)

  // Render conversation into this view
  await renderConversationViewInto(
    viewEl,
    username,
    displayName,
    avatar,
    existingConversationId
  )
}

// Render conversation view into a specific container
async function renderConversationViewInto(
  container: HTMLElement,
  username: string,
  displayName: string,
  avatar: string,
  existingConversationId?: number
): Promise<void> {
  currentView = "conversation"
  currentOtherUser = { username, displayName, avatar }

  // Check if we have cached messages for instant display
  const cached = existingConversationId
    ? messageCache.get(existingConversationId)
    : null
  const hasCachedMessages = cached && cached.messages.length > 0

  // Build initial messages HTML (use currentUserId if already set, otherwise show loading)
  const initialMessagesHtml =
    hasCachedMessages && currentUserId
      ? cached.messages
          .map((msg: ApiMessage) => {
            const isReceived = msg.sender_id !== currentUserId
            const isSent = !isReceived

            let statusIcon = ""
            if (isSent) {
              const statusClass = msg.read_at ? "read" : "sent"
              statusIcon = `<span class="github-chat-status ${statusClass}">${msg.read_at ? STATUS_ICONS.read : STATUS_ICONS.sent}</span>`
            }

            return `
            <div class="github-chat-message ${isReceived ? "received" : "sent"}" data-message-id="${msg.id}">
              <div class="github-chat-bubble">${escapeHtml(msg.content)}</div>
              <div class="github-chat-meta">
                <span class="github-chat-time">${formatTime(new Date(msg.created_at).getTime())}</span>
                ${statusIcon}
              </div>
            </div>
          `
          })
          .join("")
      : '<div class="github-chat-loading">Loading...</div>'

  const canUseInstantly = hasCachedMessages && currentUserId

  container.innerHTML = `
    <div class="github-chat-header">
      <button class="github-chat-back" aria-label="Back">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"></path>
        </svg>
      </button>
      <img src="${avatar}" alt="${displayName}" class="github-chat-avatar" />
      <div class="github-chat-user-info">
        <span class="github-chat-display-name">${escapeHtml(displayName)}</span>
        <span class="github-chat-username">@${escapeHtml(username)}</span>
      </div>
      <button class="github-chat-close" aria-label="Close">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
        </svg>
      </button>
    </div>
    <div class="github-chat-messages" id="github-chat-messages">
      ${initialMessagesHtml}
    </div>
    <div class="github-chat-input-area">
      <textarea class="github-chat-input" placeholder="Type a message..." rows="1" id="github-chat-input" ${canUseInstantly ? "" : "disabled"}></textarea>
      <button class="github-chat-send" id="github-chat-send" aria-label="Send" ${canUseInstantly ? "" : "disabled"}>
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M.989 8 .064 2.68a1.342 1.342 0 0 1 1.85-1.462l13.402 5.744a1.13 1.13 0 0 1 0 2.076L1.913 14.782a1.343 1.343 0 0 1-1.85-1.463L.99 8Zm.603-5.288L2.38 7.25h4.87a.75.75 0 0 1 0 1.5H2.38l-.788 4.538L13.929 8Z"></path>
        </svg>
      </button>
    </div>
  `

  // Scroll to bottom if we have cached messages
  const messagesContainer = container.querySelector("#github-chat-messages")
  if (canUseInstantly && messagesContainer) {
    messagesContainer.scrollTo(0, messagesContainer.scrollHeight)
  }

  // Get current user info if not already set
  if (!currentUserId) {
    const userInfo = await getCurrentUserInfo()
    currentUserId = userInfo?.id || null
  }

  // Add back and close button listeners immediately
  const backBtn = container.querySelector(".github-chat-back")
  backBtn?.addEventListener("click", goBackToList)

  const closeBtn = container.querySelector(".github-chat-close")
  closeBtn?.addEventListener("click", closeChatDrawer)

  // Get or create conversation
  const result = await getOrCreateConversation(username)

  if (!result.conversation) {
    const msgContainer = container.querySelector("#github-chat-messages")
    if (msgContainer) {
      msgContainer.innerHTML = `
        <div class="github-chat-error">
          <p>Failed to start conversation</p>
          <p class="github-chat-empty-hint">${result.error || "Please try again later"}</p>
        </div>
      `
    }
    return
  }

  const conversation = result.conversation
  currentConversationId = conversation.id
  const otherUser = conversation.other_user
  const otherUserId = otherUser.id

  // Update header with "not on platform" indicator if needed
  if (!otherUser.has_account) {
    const headerUserInfo = container.querySelector(".github-chat-user-info")
    if (headerUserInfo) {
      headerUserInfo.innerHTML = `
        <span class="github-chat-display-name">${escapeHtml(otherUser.display_name)}</span>
        <span class="github-chat-username">@${escapeHtml(otherUser.username)}</span>
        <span class="github-chat-not-on-platform">Not on GitHub Chat yet</span>
      `
    }
  }

  // Track unread message IDs (received messages that haven't been read)
  const unreadMessageIds: number[] = []

  // Only fetch and render messages if we didn't show cached ones instantly
  if (!canUseInstantly) {
    const messages = await getMessages(conversation.id)
    messageCache.set(conversation.id, { messages, timestamp: Date.now() })

    const msgContainer = container.querySelector("#github-chat-messages")
    if (msgContainer) {
      if (messages.length === 0) {
        msgContainer.innerHTML = `
          <div class="github-chat-empty">
            <p>No messages yet</p>
            <p class="github-chat-empty-hint">Send a message to start the conversation!</p>
            ${!otherUser.has_account ? '<p class="github-chat-empty-hint" style="margin-top: 8px; color: #f0883e;">@' + escapeHtml(username) + " will see your messages when they join GitHub Chat.</p>" : ""}
          </div>
        `
      } else {
        msgContainer.innerHTML = messages
          .map((msg: ApiMessage) => {
            const isReceived = msg.sender_id === otherUserId
            const isSent = !isReceived

            if (isReceived && !msg.read_at) {
              unreadMessageIds.push(msg.id)
            }

            let statusIcon = ""
            if (isSent) {
              const statusClass = msg.read_at ? "read" : "sent"
              statusIcon = `<span class="github-chat-status ${statusClass}">${msg.read_at ? STATUS_ICONS.read : STATUS_ICONS.sent}</span>`
            }

            return `
              <div class="github-chat-message ${isReceived ? "received" : "sent"}" data-message-id="${msg.id}">
                <div class="github-chat-bubble">${escapeHtml(msg.content)}</div>
                <div class="github-chat-meta">
                  <span class="github-chat-time">${formatTime(new Date(msg.created_at).getTime())}</span>
                  ${statusIcon}
                </div>
              </div>
            `
          })
          .join("")
      }
      msgContainer.scrollTo(0, msgContainer.scrollHeight)
    }
  } else {
    // We used cached messages - collect unread IDs from cache
    cached!.messages.forEach((msg: ApiMessage) => {
      if (msg.sender_id === otherUserId && !msg.read_at) {
        unreadMessageIds.push(msg.id)
      }
    })
    // Refresh cache in background
    getMessages(conversation.id).then((freshMessages) => {
      messageCache.set(conversation.id, {
        messages: freshMessages,
        timestamp: Date.now()
      })
    })
  }

  // Enable input
  const input = container.querySelector(
    "#github-chat-input"
  ) as HTMLTextAreaElement
  const sendBtn = container.querySelector(
    "#github-chat-send"
  ) as HTMLButtonElement

  if (input) input.disabled = false
  if (sendBtn) sendBtn.disabled = false

  // Auto-resize textarea and send typing indicator
  input?.addEventListener("input", () => {
    input.style.height = "auto"
    input.style.height = Math.min(input.scrollHeight, 120) + "px"

    // Send typing indicator
    sendTypingIndicator()

    // Clear existing timeout and set new one
    if (typingTimeout) clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      sendStopTyping()
    }, 2000)
  })

  // Send message on Enter (without Shift)
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  })

  sendBtn?.addEventListener("click", handleSendMessage)

  async function handleSendMessage() {
    const text = input?.value.trim()
    if (!text || !currentConversationId) return

    // Stop typing indicator
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
    sendStopTyping()

    // Generate a temporary ID for the optimistic message
    const tempId = `pending-${++pendingMessageId}`

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
    messageEl.innerHTML = `
      <div class="github-chat-bubble">${escapeHtml(messageText)}</div>
      <div class="github-chat-meta">
        <span class="github-chat-time">${formatTime(Date.now())}</span>
        <span class="github-chat-status pending">${STATUS_ICONS.pending}</span>
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
        const cached = messageCache.get(currentConversationId)
        if (cached) {
          cached.messages.push(sentMessage)
          cached.timestamp = Date.now()
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

  // Helper to show/hide typing indicator
  let typingIndicatorEl: HTMLElement | null = null

  function showTypingIndicator(username: string) {
    if (typingIndicatorEl) return // Already showing

    typingIndicatorEl = document.createElement("div")
    typingIndicatorEl.className = "github-chat-typing-indicator"
    typingIndicatorEl.innerHTML = `
      <div class="github-chat-typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span>${escapeHtml(username)} is typing...</span>
    `
    const msgContainer = container.querySelector("#github-chat-messages")
    msgContainer?.appendChild(typingIndicatorEl)
    msgContainer?.scrollTo(0, msgContainer.scrollHeight)
  }

  function hideTypingIndicator() {
    if (typingIndicatorEl) {
      typingIndicatorEl.remove()
      typingIndicatorEl = null
    }
  }

  // Subscribe to real-time messages via WebSocket
  try {
    wsCleanup = await joinConversation(conversation.id, {
      onMessage: (newMessage: ApiMessage) => {
        if (newMessage.sender_id !== otherUserId) return

        hideTypingIndicator()

        // Update cache with new message
        const cached = messageCache.get(conversation.id)
        if (cached) {
          cached.messages.push(newMessage)
          cached.timestamp = Date.now()
        }

        const msgContainer = container.querySelector("#github-chat-messages")
        const emptyState = msgContainer?.querySelector(".github-chat-empty")
        if (emptyState) emptyState.remove()

        const messageEl = document.createElement("div")
        messageEl.className = "github-chat-message received"
        messageEl.setAttribute("data-message-id", newMessage.id.toString())
        messageEl.innerHTML = `
          <div class="github-chat-bubble">${escapeHtml(newMessage.content)}</div>
          <div class="github-chat-meta">
            <span class="github-chat-time">${formatTime(new Date(newMessage.created_at).getTime())}</span>
          </div>
        `
        msgContainer?.appendChild(messageEl)
        msgContainer?.scrollTo(0, msgContainer.scrollHeight)

        // Mark as read immediately since drawer is open
        markMessagesAsRead([newMessage.id])
      },

      onTyping: (_userId: number, username: string) => {
        showTypingIndicator(username)
      },

      onStopTyping: (_userId: number) => {
        hideTypingIndicator()
      },

      onMessagesRead: (messageIds: number[]) => {
        messageIds.forEach((id) => {
          const msgEl = container?.querySelector(`[data-message-id="${id}"]`)
          if (msgEl && msgEl.classList.contains("sent")) {
            const statusEl = msgEl.querySelector(".github-chat-status")
            if (statusEl) {
              statusEl.className = "github-chat-status read"
              statusEl.innerHTML = STATUS_ICONS.read
            }
          }
        })
      }
    })

    // Now that we're joined, mark any unread messages as read
    if (unreadMessageIds.length > 0) {
      markMessagesAsRead(unreadMessageIds)
    }
  } catch (error) {
    console.error("WebSocket error:", error)
  }

  input?.focus()
}

// Create and open chat drawer (called from profile page)
async function openChatDrawer(
  username: string,
  displayName: string,
  avatar: string
): Promise<void> {
  // Check if authenticated first
  const isAuth = await checkAuth()
  if (!isAuth) {
    openLogin()
    return
  }

  // Create overlay if not exists
  if (!chatOverlay) {
    chatOverlay = document.createElement("div")
    chatOverlay.className = "github-chat-overlay"
    chatOverlay.addEventListener("click", closeChatDrawer)
    document.body.appendChild(chatOverlay)
  }

  // Create drawer if not exists
  if (!chatDrawer) {
    chatDrawer = document.createElement("div")
    chatDrawer.className = "github-chat-drawer"
    document.body.appendChild(chatDrawer)
  }

  // Open drawer first
  requestAnimationFrame(() => {
    chatOverlay?.classList.add("open")
    chatDrawer?.classList.add("open")
  })

  // Create view container and render conversation into it
  const viewEl = document.createElement("div")
  viewEl.className = "github-chat-view"
  chatDrawer.appendChild(viewEl)
  await renderConversationViewInto(viewEl, username, displayName, avatar)
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

// Handle chat button click
async function handleChatClick(): Promise<void> {
  const isAuth = await checkAuth()
  if (!isAuth) {
    openLogin()
    return
  }

  const username = getProfileUsername()
  const displayName = getProfileDisplayName()
  const avatar = getProfileAvatar()

  if (username) {
    openChatDrawer(username, displayName, avatar)
  }
}

// Create the profile chat button
function createChatButton(): HTMLButtonElement {
  const button = document.createElement("button")
  button.className = "github-chat-btn-profile btn btn-block"
  button.type = "button"
  button.innerHTML = `
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" class="octicon">
      <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
    </svg>
    <span>Chat</span>
  `
  button.addEventListener("click", handleChatClick)
  return button
}

// Create header chat button
function createHeaderChatButton(): HTMLButtonElement {
  const button = document.createElement("button")
  button.className =
    "github-chat-header-btn Button Button--iconOnly Button--secondary Button--medium AppHeader-button color-fg-muted"
  button.title = "My Chats"
  button.type = "button"
  button.setAttribute("aria-label", "My Chats")
  button.innerHTML = `
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-comment-discussion">
      <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"></path>
    </svg>
  `
  button.addEventListener("click", async () => {
    const isAuth = await checkAuth()
    if (!isAuth) {
      openLogin()
      return
    }
    openChatListDrawer()
  })
  return button
}

// Inject header chat button
function injectHeaderChatButton(): void {
  if (document.querySelector(".github-chat-header-btn")) return

  const targetContainer = document.querySelector(".AppHeader-actions")
  if (targetContainer) {
    const chatBtn = createHeaderChatButton()
    targetContainer.insertBefore(chatBtn, targetContainer.firstChild)
    return
  }

  const globalBarEnd = document.querySelector(".AppHeader-globalBar-end")
  if (globalBarEnd) {
    const actionsDiv = globalBarEnd.querySelector(".AppHeader-actions")
    if (actionsDiv) {
      const chatBtn = createHeaderChatButton()
      actionsDiv.insertBefore(chatBtn, actionsDiv.firstChild)
    }
  }
}

// Inject profile chat button
function injectChatButton(): void {
  const existingBtn = document.querySelector(".github-chat-btn-profile")
  if (existingBtn) existingBtn.remove()
  const existingWrapper = document.querySelector(".github-chat-btn-wrapper")
  if (existingWrapper) existingWrapper.remove()

  const followForm =
    document.querySelector('form[action*="/follow"]') ||
    document.querySelector('[data-target="follow.form"]')
  const sponsorLink = document.querySelector('a[href*="/sponsors/"]')

  let buttonRow: Element | null = null
  if (followForm) {
    buttonRow =
      followForm.closest(".d-flex") ||
      followForm.closest('[class*="flex"]') ||
      followForm.parentElement
  } else if (sponsorLink) {
    buttonRow = sponsorLink.closest(".d-flex") || sponsorLink.parentElement
  }

  if (buttonRow) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "-4px"
    wrapper.style.marginBottom = "8px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    buttonRow.insertAdjacentElement("afterend", wrapper)
    return
  }

  const vcardNames = document.querySelector(".vcard-names")
  if (vcardNames) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "16px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    vcardNames.insertAdjacentElement("afterend", wrapper)
    return
  }

  const vcard =
    document.querySelector(".h-card") ||
    document.querySelector('[itemtype="http://schema.org/Person"]')
  if (vcard) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "8px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    vcard.appendChild(wrapper)
  }
}

// Initialize for profile pages
function initProfilePage(): void {
  if (!isProfilePage()) return
  currentUsername = getProfileUsername()
  if (!currentUsername) return
  injectChatButton()
}

// Initialize header button
function initHeaderButton(): void {
  injectHeaderChatButton()
}

// Listen for auth success messages from frontend
window.addEventListener("message", (event) => {
  if (event.data?.type === "GITHUB_CHAT_AUTH_SUCCESS" && event.data.token) {
    chrome.runtime.sendMessage({
      type: "AUTH_SUCCESS",
      token: event.data.token
    })
  }
})

// Run on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initHeaderButton()
    initProfilePage()
    // Connect WebSocket early to receive read receipts even when chat is closed
    ensureWebSocketConnected().catch(console.error)
  })
} else {
  initHeaderButton()
  initProfilePage()
  // Connect WebSocket early to receive read receipts even when chat is closed
  ensureWebSocketConnected().catch(console.error)
}

// Re-run on navigation (GitHub uses SPA-style navigation)
let lastUrl = location.href
new MutationObserver(() => {
  const url = location.href
  if (url !== lastUrl) {
    lastUrl = url
    const existingBtn = document.querySelector(".github-chat-btn-profile")
    if (existingBtn) existingBtn.remove()
    const existingWrapper = document.querySelector(".github-chat-btn-wrapper")
    if (existingWrapper) existingWrapper.remove()

    setTimeout(() => {
      initHeaderButton()
      initProfilePage()
    }, 500)
  }
}).observe(document, { subtree: true, childList: true })

console.log("GitHub Chat content script loaded")
