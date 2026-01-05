// Header chat button for message list access

import { getTotalUnreadCount } from "~lib/api"

import { checkAuth, openLogin } from "../auth"
import { getNavigationCallbacks } from "../state"

// Create header chat button
export function createHeaderChatButton(): HTMLButtonElement {
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
    <span class="github-chat-unread-badge" style="display: none;"></span>
  `
  button.addEventListener("click", async () => {
    const isAuth = await checkAuth()
    if (!isAuth) {
      openLogin()
      return
    }
    const nav = getNavigationCallbacks()
    nav?.openChatListDrawer()
  })
  return button
}

// Inject header chat button
export function injectHeaderChatButton(): void {
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

// Update unread badge on header button
export async function updateUnreadBadge(): Promise<void> {
  const badge = document.querySelector(".github-chat-unread-badge")
  if (!badge) return

  // Only fetch if authenticated
  const isAuth = await checkAuth()
  if (!isAuth) {
    ;(badge as HTMLElement).style.display = "none"
    return
  }

  try {
    const unreadCount = await getTotalUnreadCount()
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount)
      ;(badge as HTMLElement).style.display = "flex"
    } else {
      ;(badge as HTMLElement).style.display = "none"
    }
  } catch {
    ;(badge as HTMLElement).style.display = "none"
  }
}
