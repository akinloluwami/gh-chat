// Message action handlers (reactions, options menu)

import {
  currentConversationId,
  currentUserId,
  currentUsername,
  setQuotedMessage
} from "../state"
import { showEmojiPopover } from "./emoji-popover"
import { showQuotePreview } from "./input-handler"
import { handleReactionOptimistic } from "./reactions"

let activeOptionsMenu: HTMLElement | null = null

// Close any open options menu
export function closeOptionsMenu(): void {
  if (activeOptionsMenu) {
    activeOptionsMenu.remove()
    activeOptionsMenu = null
  }
}

// Show options menu for a message
function showOptionsMenu(anchorBtn: HTMLElement, messageId: string): void {
  // Close any existing menu
  closeOptionsMenu()

  // Get message content for reply
  const messageEl = anchorBtn.closest(".github-chat-message") as HTMLElement
  const bubbleEl = messageEl?.querySelector(".github-chat-bubble")
  const quotedContent = bubbleEl?.querySelector(".github-chat-quoted-content")
  // Get content after the quoted message if present, otherwise get full bubble text
  let messageContent = ""
  if (quotedContent) {
    // Get text nodes after the quoted content
    const bubble = bubbleEl as HTMLElement
    const childNodes = Array.from(bubble.childNodes)
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        messageContent += node.textContent || ""
      }
    }
    messageContent = messageContent.trim()
  } else {
    messageContent = bubbleEl?.textContent?.trim() || ""
  }

  // Determine if message is sent or received to get sender info
  const isSent = messageEl?.classList.contains("sent")
  const senderUsername = isSent ? currentUsername : null // We'll get the other user's name from the header

  // Create options menu
  const menu = document.createElement("div")
  menu.className = "github-chat-options-menu"
  menu.innerHTML = `
    <button class="github-chat-options-item" data-action="reply">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path fill="currentColor" d="M6.78 1.97a.75.75 0 0 1 0 1.06L3.81 6h6.44A4.75 4.75 0 0 1 15 10.75v2.5a.75.75 0 0 1-1.5 0v-2.5a3.25 3.25 0 0 0-3.25-3.25H3.81l2.97 2.97a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L1.47 7.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"></path>
      </svg>
      Reply
    </button>
  `

  // Position menu near the anchor button
  const rect = anchorBtn.getBoundingClientRect()
  const drawer = document.querySelector(".github-chat-drawer") as HTMLElement
  if (!drawer) return

  const drawerRect = drawer.getBoundingClientRect()
  menu.style.position = "absolute"
  menu.style.top = `${rect.bottom - drawerRect.top + 4}px`
  menu.style.right = `${drawerRect.right - rect.right}px`
  menu.style.zIndex = "10002"

  drawer.appendChild(menu)
  activeOptionsMenu = menu

  // Handle menu item clicks
  menu.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest(
      ".github-chat-options-item"
    ) as HTMLElement
    if (!item) return

    const action = item.dataset.action
    if (action === "reply") {
      // Get the sender's username for quote
      let quoteSenderUsername = ""
      if (isSent) {
        quoteSenderUsername = currentUsername || "You"
      } else {
        // Get from header
        const headerUsername = document.querySelector(
          ".github-chat-header .github-chat-username"
        )
        quoteSenderUsername =
          headerUsername?.textContent?.replace("@", "") || "User"
      }

      // Set quote state and show preview
      setQuotedMessage({
        id: messageId,
        content: messageContent,
        senderUsername: quoteSenderUsername
      })
      showQuotePreview(messageContent, quoteSenderUsername)

      // Focus input
      const input = document.getElementById(
        "github-chat-input"
      ) as HTMLTextAreaElement
      input?.focus()
    }

    closeOptionsMenu()
  })

  // Close menu when clicking outside
  const closeOnOutsideClick = (e: MouseEvent) => {
    if (
      !menu.contains(e.target as Node) &&
      !anchorBtn.contains(e.target as Node)
    ) {
      closeOptionsMenu()
      document.removeEventListener("click", closeOnOutsideClick)
    }
  }
  setTimeout(() => document.addEventListener("click", closeOnOutsideClick), 0)
}

// Setup click handlers for message actions
export function setupMessageActionHandlers(msgContainer: HTMLElement): void {
  msgContainer.addEventListener("click", (e) => {
    const target = e.target as HTMLElement

    // Handle reaction badge clicks (toggle reaction)
    const reactionBtn = target.closest(".github-chat-reaction") as HTMLElement
    if (reactionBtn) {
      e.stopPropagation()
      const emoji = reactionBtn.dataset.emoji
      const messageEl = reactionBtn.closest(
        ".github-chat-message"
      ) as HTMLElement
      const messageId = messageEl?.dataset.messageId
      const userReacted = reactionBtn.dataset.userReacted === "true"

      if (
        !emoji ||
        !messageId ||
        !currentConversationId ||
        !currentUserId ||
        !currentUsername
      )
        return

      // Use optimistic update
      handleReactionOptimistic(
        currentConversationId,
        messageId,
        emoji,
        !userReacted,
        currentUserId,
        currentUsername
      )
      return
    }

    // Handle action button clicks
    const actionBtn = target.closest(".github-chat-action-btn") as HTMLElement
    if (!actionBtn) return

    const action = actionBtn.dataset.action
    const messageEl = actionBtn.closest(".github-chat-message") as HTMLElement
    const messageId = messageEl?.dataset.messageId

    if (!messageId) return

    if (action === "reaction") {
      e.stopPropagation()
      showEmojiPopover(actionBtn, messageId)
    } else if (action === "options") {
      e.stopPropagation()
      showOptionsMenu(actionBtn, messageId)
    }
  })
}
