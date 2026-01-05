// Navigation button handlers for conversation view

import { getNavigationCallbacks } from "../state"

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
}
