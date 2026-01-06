// Navigation button handlers for conversation view

import { currentConversationId, getNavigationCallbacks } from "../state"

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
  expandBtn?.addEventListener("click", async () => {
    // Close the drawer first
    const nav = getNavigationCallbacks()
    nav?.closeChatDrawer()

    // Open expanded view with current conversation
    const { openExpandedView } = await import("../expanded-view")
    openExpandedView(currentConversationId || undefined)
  })
}
