import type { PlasmoCSConfig } from "plasmo"
import { ensureWebSocketConnected, sendStopTyping } from "~lib/api"
import "./github.css"

// Import from modular files
import { checkAuth, getCurrentUserInfo, openLogin } from "./lib/auth"
import {
  isProfilePage,
  getProfileUsername,
  getProfileDisplayName,
  getProfileAvatar
} from "./lib/profile"
import { renderListView } from "./lib/list-view"
import { renderConversationViewInto } from "./lib/conversation-view"
import {
  chatDrawer,
  chatOverlay,
  setChatDrawer,
  setChatOverlay,
  currentUserId,
  setCurrentUserId,
  setCurrentConversationId,
  setCurrentOtherUser,
  setCurrentView,
  typingTimeout,
  setTypingTimeout,
  wsCleanup,
  setWsCleanup,
  setNavigationCallbacks
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

  // Clean up WebSocket connection for this conversation
  if (wsCleanup) {
    wsCleanup()
    setWsCleanup(null)
  }
  setCurrentConversationId(null)
  setCurrentOtherUser(null)
  setCurrentView("list")

  // Animate transition: slide conversation out, slide list in
  const drawer = chatDrawer
  if (drawer) {
    const currentViewEl = drawer.querySelector(".github-chat-view")
    if (currentViewEl) {
      currentViewEl.classList.add("slide-out-right")
    }

    // Import dynamically to avoid circular deps
    import("./lib/list-view").then(({ renderListViewAnimated }) => {
      renderListViewAnimated("slide-in-left")
    })
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
  await renderListView()

  // Open drawer
  requestAnimationFrame(() => {
    overlay?.classList.add("open")
    drawer?.classList.add("open")
  })
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
  openChatDrawer
})

// ============= UI Injection =============

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

// ============= Initialization =============

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
