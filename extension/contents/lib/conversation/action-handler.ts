// Message action handlers (reactions, options menu)

import { currentConversationId, currentUserId, currentUsername } from "../state"
import { showEmojiPopover } from "./emoji-popover"
import { handleReactionOptimistic } from "./reactions"

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
      console.log("Options clicked for message:", messageId)
      // TODO: Show options menu
    }
  })
}
