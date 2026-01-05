// Reaction handling with optimistic UI updates

import { addReaction, removeReaction, type Reaction } from "~lib/api"

import { currentConversationId, messageCache } from "../state"

// Update reaction in DOM for real-time updates
export function updateReactionInDOM(
  messageId: string,
  emoji: string,
  reactionUserId: string,
  reactionUsername: string,
  isAdding: boolean,
  currentUserIdVal: string | null
): void {
  const messageEl = document.querySelector(
    `.github-chat-message[data-message-id="${messageId}"]`
  )
  if (!messageEl) return

  // De-duplicate: Check cache first to see if this reaction already exists
  if (currentConversationId) {
    const cachedData = messageCache.get(currentConversationId)
    if (cachedData) {
      const msg = cachedData.messages.find((m) => m.id === messageId)
      if (msg && msg.reactions) {
        const existingReaction = msg.reactions.find(
          (r) => r.emoji === emoji && r.user_id === reactionUserId
        )
        if (isAdding && existingReaction) {
          // Reaction already exists in cache, skip duplicate event
          return
        }
        if (!isAdding && !existingReaction) {
          // Reaction doesn't exist in cache, skip duplicate removal event
          return
        }
      }
    }
  }

  let reactionsContainer = messageEl.querySelector(".github-chat-reactions")

  if (isAdding) {
    // Adding a reaction
    if (!reactionsContainer) {
      // Create reactions container if it doesn't exist
      reactionsContainer = document.createElement("div")
      reactionsContainer.className = "github-chat-reactions"
      const metaEl = messageEl.querySelector(".github-chat-meta")
      if (metaEl) {
        messageEl.insertBefore(reactionsContainer, metaEl)
      } else {
        messageEl.appendChild(reactionsContainer)
      }
    }

    // Check if this emoji already exists
    let reactionBtn = reactionsContainer.querySelector(
      `.github-chat-reaction[data-emoji="${emoji}"]`
    ) as HTMLElement

    if (reactionBtn) {
      // Update existing reaction count
      const countEl = reactionBtn.querySelector(".github-chat-reaction-count")
      const currentCount = parseInt(countEl?.textContent || "0")
      if (countEl) countEl.textContent = (currentCount + 1).toString()

      // Update title
      const currentTitle = reactionBtn.getAttribute("title") || ""
      reactionBtn.setAttribute(
        "title",
        currentTitle ? `${currentTitle}, ${reactionUsername}` : reactionUsername
      )

      // Mark as user-reacted if this is current user
      if (reactionUserId === currentUserIdVal) {
        reactionBtn.classList.add("user-reacted")
        reactionBtn.setAttribute("data-user-reacted", "true")
      }
    } else {
      // Create new reaction button
      const isUserReacted = reactionUserId === currentUserIdVal
      reactionBtn = document.createElement("button")
      reactionBtn.className = `github-chat-reaction ${isUserReacted ? "user-reacted" : ""}`
      reactionBtn.setAttribute("data-emoji", emoji)
      reactionBtn.setAttribute("data-user-reacted", isUserReacted.toString())
      reactionBtn.setAttribute("title", reactionUsername)
      reactionBtn.innerHTML = `
        <span class="github-chat-reaction-emoji">${emoji}</span>
        <span class="github-chat-reaction-count">1</span>
      `
      reactionsContainer.appendChild(reactionBtn)
    }
  } else {
    // Removing a reaction
    if (!reactionsContainer) return

    const reactionBtn = reactionsContainer.querySelector(
      `.github-chat-reaction[data-emoji="${emoji}"]`
    ) as HTMLElement
    if (!reactionBtn) return

    const countEl = reactionBtn.querySelector(".github-chat-reaction-count")
    const currentCount = parseInt(countEl?.textContent || "0")

    if (currentCount <= 1) {
      // Remove the reaction button entirely
      reactionBtn.remove()
      // Remove container if empty
      if (reactionsContainer.children.length === 0) {
        reactionsContainer.remove()
      }
    } else {
      // Decrement count
      if (countEl) countEl.textContent = (currentCount - 1).toString()

      // Update title - remove username
      const currentTitle = reactionBtn.getAttribute("title") || ""
      const usernames = currentTitle
        .split(", ")
        .filter((u) => u !== reactionUsername)
      reactionBtn.setAttribute("title", usernames.join(", "))

      // Remove user-reacted if this is current user
      if (reactionUserId === currentUserIdVal) {
        reactionBtn.classList.remove("user-reacted")
        reactionBtn.setAttribute("data-user-reacted", "false")
      }
    }
  }

  // Update message cache with reaction change
  if (currentConversationId) {
    const cachedData = messageCache.get(currentConversationId)
    if (cachedData) {
      const msg = cachedData.messages.find((m) => m.id === messageId)
      if (msg) {
        if (!msg.reactions) msg.reactions = []
        if (isAdding) {
          // Add reaction to cache
          const existingReaction = msg.reactions.find(
            (r) => r.emoji === emoji && r.user_id === reactionUserId
          )
          if (!existingReaction) {
            msg.reactions.push({
              emoji,
              user_id: reactionUserId,
              username: reactionUsername
            })
          }
        } else {
          // Remove reaction from cache
          msg.reactions = msg.reactions.filter(
            (r) => !(r.emoji === emoji && r.user_id === reactionUserId)
          )
        }
        cachedData.timestamp = Date.now()
      }
    }
  }
}

// Handle reaction with optimistic UI update
export async function handleReactionOptimistic(
  conversationId: string,
  messageId: string,
  emoji: string,
  isAdding: boolean,
  userId: string | null,
  username: string
): Promise<void> {
  // Optimistically update the UI immediately
  updateReactionInDOM(
    messageId,
    emoji,
    userId || "",
    username,
    isAdding,
    userId
  )

  // Make the API call in the background
  try {
    let success: boolean
    if (isAdding) {
      success = await addReaction(conversationId, messageId, emoji)
    } else {
      success = await removeReaction(conversationId, messageId, emoji)
    }

    // If the API call failed, roll back the optimistic update
    if (!success) {
      updateReactionInDOM(
        messageId,
        emoji,
        userId || "",
        username,
        !isAdding, // Reverse the action
        userId
      )
    }
  } catch (error) {
    // On error, roll back the optimistic update
    updateReactionInDOM(
      messageId,
      emoji,
      userId || "",
      username,
      !isAdding, // Reverse the action
      userId
    )
  }
}
