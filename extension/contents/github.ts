import type { PlasmoCSConfig } from "plasmo"

import { ensureWebSocketConnected, sendStopTyping } from "~lib/api"

import "./github.css"

// Import from modular files
import { checkAuth, getCurrentUserInfo } from "./lib/auth"
import {
  injectChatButton,
  injectHeaderChatButton,
  updateUnreadBadge
} from "./lib/buttons"
import {
  cancelPendingRead,
  renderConversationViewInto
} from "./lib/conversation"
import { renderListView, renderListViewAnimated, startListMessageListener } from "./lib/list"
import { getProfileUsername, isProfilePage } from "./lib/profile"
import {
  chatDrawer,
  chatOverlay,
  currentUserId,
  setChatDrawer,
  setChatOverlay,
  setCurrentConversationId,
  setCurrentOtherUser,
  setCurrentUserId,
  setCurrentView,
  setNavigationCallbacks,
  setTypingTimeout,
  setWsCleanup,
  typingTimeout,
  wsCleanup
} from "./lib/state"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"]
}

let currentUsername: string | null = null

// ============= Drawer Management =============

// Close chat drawer completely
function closeChatDrawer(): void {
  // Clean up typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    setTypingTimeout(null)
  }

  // Stop typing indicator before closing
  sendStopTyping()

  // Cancel any pending mark-as-read (user left before reading)
  cancelPendingRead()

  // Clean up WebSocket connection
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }
  setCurrentConversationId(null)
  setCurrentOtherUser(null)
  setCurrentView("list")

  const drawer = chatDrawer
  const overlay = chatOverlay

  if (drawer) {
    drawer.classList.remove("open")
  }
  if (overlay) {
    overlay.classList.remove("open")
  }
}

// Go back from conversation to list view
function goBackToList(): void {
  // Clean up typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    setTypingTimeout(null)
  }

  // Stop typing indicator
  sendStopTyping()

  // Cancel any pending mark-as-read (user left before reading)
  cancelPendingRead()

  // Clean up WebSocket connection for this conversation
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }
  setCurrentConversationId(null)
  setCurrentOtherUser(null)

  // Set current view and start listener IMMEDIATELY (synchronously)
  setCurrentView("list")
  startListMessageListener()

  // Animate transition: slide conversation out, slide list in
  const drawer = chatDrawer
  if (drawer) {
    const currentViewEl = drawer.querySelector(".github-chat-view")
    if (currentViewEl) {
      currentViewEl.classList.add("slide-out-right")
    }

    // Render list view with animation
    renderListViewAnimated("slide-in-left")
  }
}

// Open chat list drawer
async function openChatListDrawer(): Promise<void> {
  // Prefetch current user info for instant conversation loading
  if (!currentUserId) {
    getCurrentUserInfo().then((userInfo) => {
      setCurrentUserId(userInfo?.id || null)
    })
  }

  // Ensure WebSocket is connected to receive real-time updates
  ensureWebSocketConnected().catch(console.error)

  // Create overlay if not exists
  let overlay = chatOverlay
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.className = "github-chat-overlay"
    overlay.addEventListener("click", closeChatDrawer)
    document.body.appendChild(overlay)
    setChatOverlay(overlay)
  }

  // Create drawer if not exists
  let drawer = chatDrawer
  if (!drawer) {
    drawer = document.createElement("div")
    drawer.className = "github-chat-drawer"
    document.body.appendChild(drawer)
    setChatDrawer(drawer)
  }

  setCurrentView("list")

  // Open drawer immediately
  requestAnimationFrame(() => {
    overlay?.classList.add("open")
    drawer?.classList.add("open")
  })

  // Render list view (will show loading state or cached data instantly)
  renderListView()
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
    const { openLogin } = await import("./lib/auth")
    openLogin()
    return
  }

  // Create overlay if not exists
  let overlay = chatOverlay
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.className = "github-chat-overlay"
    overlay.addEventListener("click", closeChatDrawer)
    document.body.appendChild(overlay)
    setChatOverlay(overlay)
  }

  // Create drawer if not exists
  let drawer = chatDrawer
  if (!drawer) {
    drawer = document.createElement("div")
    drawer.className = "github-chat-drawer"
    document.body.appendChild(drawer)
    setChatDrawer(drawer)
  }

  // Open drawer first
  requestAnimationFrame(() => {
    overlay?.classList.add("open")
    drawer?.classList.add("open")
  })

  // Create view container and render conversation into it
  const viewEl = document.createElement("div")
  viewEl.className = "github-chat-view"
  drawer.appendChild(viewEl)
  await renderConversationViewInto(viewEl, username, displayName, avatar)
}

// Register navigation callbacks for use by child modules
setNavigationCallbacks({
  closeChatDrawer,
  goBackToList,
  openChatListDrawer,
  openChatDrawer,
  refreshUnreadBadge: updateUnreadBadge
})

// ============= Initialization =============

// Initialize for profile pages
async function initProfilePage(): Promise<void> {
  if (!isProfilePage()) return
  currentUsername = getProfileUsername()
  if (!currentUsername) return
  await injectChatButton()
}

// Initialize header button
function initHeaderButton(): void {
  injectHeaderChatButton()
  // Update unread badge after button is injected
  updateUnreadBadge()
}

// Start polling for unread count updates
let unreadPollInterval: ReturnType<typeof setInterval> | null = null

function startUnreadPolling(): void {
  if (unreadPollInterval) return
  // Poll every 30 seconds for new messages
  unreadPollInterval = setInterval(updateUnreadBadge, 30000)
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

// Check URL for auth token (redirect-based auth flow)
function checkUrlForAuthToken(): void {
  const params = new URLSearchParams(window.location.search)
  const token = params.get("ghchat_token")

  if (token) {
    // Store the token via background script
    chrome.runtime.sendMessage({ type: "AUTH_SUCCESS", token }, (response) => {
      if (response?.success) {
        console.log("GH Chat: Auth token received and stored")
      }
    })

    // Clean up the URL (remove the token param)
    params.delete("ghchat_token")
    const newSearch = params.toString()
    const newUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash
    window.history.replaceState({}, "", newUrl)

    // Reload to apply auth state
    window.location.reload()
  }
}

// Run on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    checkUrlForAuthToken()
    initHeaderButton()
    initProfilePage()
    startUnreadPolling()
    // Connect WebSocket early to receive read receipts even when chat is closed
    ensureWebSocketConnected().catch(console.error)
  })
} else {
  checkUrlForAuthToken()
  initHeaderButton()
  initProfilePage()
  startUnreadPolling()
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

console.log("GH Chat content script loaded")
