// Navigation button handlers for conversation view

import { openExpandedView } from "../expanded-view"
import { getCurrentConversationId, getNavigationCallbacks } from "../state"

// Setup back and close button listeners
export function setupNavigationButtons(container: HTMLElement): void {
  const backBtn = container.querySelector(".github-chat-back")
  backBtn?.addEventListener("click", () => {
    const nav = getNavigationCallbacks()
    nav?.goBackToList()
  })

  const closeBtn = container.querySelector(".github-chat-close")
  closeBtn?.addEventListener("click", () => {
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()
  })

  const expandBtn = container.querySelector(".github-chat-expand")
  expandBtn?.addEventListener("click", () => {
    // Capture the conversation ID BEFORE closing the drawer (which clears it)
    const conversationId = getCurrentConversationId()

    // Close the drawer first
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()

    // Open expanded view with current conversation
    openExpandedView(conversationId || undefined)
  })
}
