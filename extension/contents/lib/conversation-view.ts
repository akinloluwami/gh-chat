// Conversation view rendering and message handling

import {
  addReaction,
  sendMessage as apiSendMessage,
  getMessages,
  getOrCreateConversation,
  joinConversation,
  markConversationAsRead,
  markMessagesAsRead,
  removeReaction,
  sendStopTyping,
  sendTypingIndicator,
  setGlobalMessageListener,
  type Message as ApiMessage,
  type Reaction
} from "~lib/api"

import { getCurrentUserInfo } from "./auth"
import {
  chatDrawer,
  chatListCache,
  currentConversationId,
  currentUserId,
  getNavigationCallbacks,
  incrementPendingMessageId,
  messageCache,
  setChatListCache,
  setCurrentConversationId,
  setCurrentOtherUser,
  setCurrentUserId,
  setCurrentView,
  setTypingTimeout,
  setWsCleanup,
  typingTimeout
} from "./state"
import { STATUS_ICONS } from "./types"
import { escapeHtml, formatTime } from "./utils"

// Message action icons
const MESSAGE_ACTION_ICONS = {
  reaction: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.82 1.636a.75.75 0 0 1 1.038.175l.007.009c.103.118.22.222.35.31.264.178.683.37 1.285.37.602 0 1.02-.192 1.285-.371.13-.088.247-.192.35-.31l.007-.008a.75.75 0 0 1 1.222.87l-.022.03c-.182.248-.422.49-.717.69-.473.322-1.13.57-2.125.57-.995 0-1.652-.248-2.125-.57a3.3 3.3 0 0 1-.717-.69l-.022-.03a.75.75 0 0 1 .184-1.045ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
  options: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path></svg>`
}

// Quick reaction emojis (13 total: 7 top row, 6 bottom row + expand button)
const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🎉", // Top row
  "🔥",
  "👀",
  "🚀",
  "💯",
  "✅",
  "👎" // Bottom row
]

// Currently open emoji popover (only one at a time)
let currentEmojiPopover: HTMLElement | null = null

// Create emoji popover HTML
function createEmojiPopover(messageId: string): HTMLElement {
  const popover = document.createElement("div")
  popover.className = "github-chat-emoji-popover"
  popover.dataset.messageId = messageId

  const emojiButtons = QUICK_EMOJIS.map(
    (emoji) =>
      `<button class="github-chat-emoji-btn" data-emoji="${emoji}">${emoji}</button>`
  ).join("")

  popover.innerHTML = `
    <div class="github-chat-emoji-grid">
      ${emojiButtons}
      <button class="github-chat-emoji-expand" title="More emojis">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4Z"></path></svg>
      </button>
    </div>
  `

  return popover
}

// Close any open emoji popover
function closeEmojiPopover(): void {
  if (currentEmojiPopover) {
    currentEmojiPopover.remove()
    currentEmojiPopover = null
  }
}

// Show emoji popover for a message
function showEmojiPopover(reactionBtn: HTMLElement, messageId: string): void {
  // Close any existing popover
  closeEmojiPopover()

  const popover = createEmojiPopover(messageId)

  // Position relative to the bubble for consistent placement
  const bubbleEl = reactionBtn
    .closest(".github-chat-message-wrapper")
    ?.querySelector(".github-chat-bubble")
  if (!bubbleEl) return

  bubbleEl.appendChild(popover)
  currentEmojiPopover = popover

  // Add click handlers for emoji buttons
  popover.querySelectorAll(".github-chat-emoji-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const emoji = (btn as HTMLElement).dataset.emoji
      if (!emoji || !currentConversationId) return

      closeEmojiPopover()

      // Check if user already reacted with this emoji
      const messageEl = document.querySelector(
        `.github-chat-message[data-message-id="${messageId}"]`
      )
      const existingReaction = messageEl?.querySelector(
        `.github-chat-reaction[data-emoji="${emoji}"][data-user-reacted="true"]`
      )

      if (existingReaction) {
        // Remove reaction
        await removeReaction(currentConversationId, messageId, emoji)
      } else {
        // Add reaction
        await addReaction(currentConversationId, messageId, emoji)
      }
    })
  })

  // Add click handler for expand button
  popover
    .querySelector(".github-chat-emoji-expand")
    ?.addEventListener("click", (e) => {
      e.stopPropagation()
      console.log("Show full emoji picker for message:", messageId)
      // TODO: Show full emoji picker
      closeEmojiPopover()
    })

  // Close popover when clicking outside
  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick)
  }, 0)
}

// Handle clicks outside the popover
function handleOutsideClick(e: MouseEvent): void {
  if (currentEmojiPopover && !currentEmojiPopover.contains(e.target as Node)) {
    closeEmojiPopover()
    document.removeEventListener("click", handleOutsideClick)
  }
}

// Group reactions by emoji for display
function groupReactions(
  reactions: Reaction[],
  currentUserId: string | null
): Map<string, { count: number; userReacted: boolean; usernames: string[] }> {
  const grouped = new Map<
    string,
    { count: number; userReacted: boolean; usernames: string[] }
  >()
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) {
      grouped.set(r.emoji, { count: 0, userReacted: false, usernames: [] })
    }
    const group = grouped.get(r.emoji)!
    group.count++
    group.usernames.push(r.username)
    if (r.user_id === currentUserId) {
      group.userReacted = true
    }
  }
  return grouped
}

// Generate reactions HTML
function generateReactionsHTML(
  reactions: Reaction[],
  currentUserIdVal: string | null
): string {
  if (!reactions || reactions.length === 0) return ""

  const grouped = groupReactions(reactions, currentUserIdVal)
  const reactionButtons: string[] = []

  grouped.forEach((data, emoji) => {
    const userReactedClass = data.userReacted ? "user-reacted" : ""
    const title = data.usernames.join(", ")
    reactionButtons.push(
      `<button class="github-chat-reaction ${userReactedClass}" data-emoji="${emoji}" data-user-reacted="${data.userReacted}" title="${escapeHtml(title)}">
        <span class="github-chat-reaction-emoji">${emoji}</span>
        <span class="github-chat-reaction-count">${data.count}</span>
      </button>`
    )
  })

  return `<div class="github-chat-reactions">${reactionButtons.join("")}</div>`
}

// Generate message HTML with actions
function generateMessageHTML(
  messageId: string,
  content: string,
  timestamp: number | string,
  isSent: boolean,
  statusIcon: string = "",
  reactions: Reaction[] = [],
  currentUserIdVal: string | null = null
): string {
  const timeStr =
    typeof timestamp === "string"
      ? formatTime(new Date(timestamp).getTime())
      : formatTime(timestamp)

  const reactionsHTML = generateReactionsHTML(reactions, currentUserIdVal)

  return `
    <div class="github-chat-message ${isSent ? "sent" : "received"}" data-message-id="${messageId}">
      <div class="github-chat-message-wrapper">
        <div class="github-chat-message-actions">
          <button class="github-chat-action-btn" data-action="reaction" title="Add reaction">
            ${MESSAGE_ACTION_ICONS.reaction}
          </button>
          <button class="github-chat-action-btn" data-action="options" title="More options">
            ${MESSAGE_ACTION_ICONS.options}
          </button>
        </div>
        <div class="github-chat-bubble">${escapeHtml(content)}</div>
      </div>
      ${reactionsHTML}
      <div class="github-chat-meta">
        <span class="github-chat-time">${timeStr}</span>
        ${statusIcon}
      </div>
    </div>
  `
}

// Update reaction in DOM for real-time updates
function updateReactionInDOM(
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

// Pending read timeout - cancelled if user leaves conversation quickly
let pendingReadTimeout: ReturnType<typeof setTimeout> | null = null
let pendingReadConversationId: string | null = null
let pendingReadMessageIds: string[] = []

// Cancel any pending mark-as-read operation
export function cancelPendingRead(): void {
  if (pendingReadTimeout) {
    clearTimeout(pendingReadTimeout)
    pendingReadTimeout = null
  }
  pendingReadConversationId = null
  pendingReadMessageIds = []
}

// Schedule marking messages as read after a delay
function scheduleMarkAsRead(
  conversationId: string,
  messageIds: string[]
): void {
  // Cancel any existing pending read
  cancelPendingRead()

  pendingReadConversationId = conversationId
  pendingReadMessageIds = messageIds

  // Wait 1.5 seconds before marking as read - gives user time to actually read
  pendingReadTimeout = setTimeout(() => {
    if (pendingReadConversationId === conversationId) {
      // Mark conversation as read
      markConversationAsRead(conversationId).then(() => {
        setChatListCache(null)
        const nav = getNavigationCallbacks()
        nav?.refreshUnreadBadge()
      })

      // Mark individual messages as read
      if (pendingReadMessageIds.length > 0) {
        markMessagesAsRead(pendingReadMessageIds)
      }
    }
    pendingReadTimeout = null
    pendingReadConversationId = null
    pendingReadMessageIds = []
  }, 1500)
}

// Helper to clear unread count in chat list cache when opening a conversation
function clearUnreadInCache(conversationId: string): void {
  if (!chatListCache) return

  const chat = chatListCache.chats.find(
    (c) => c.conversationId === conversationId
  )
  if (chat) {
    chat.unread = false
    chat.unreadCount = 0
  }
}

// Render conversation view with slide animation
export async function renderConversationViewAnimated(
  username: string,
  displayName: string,
  avatar: string,
  existingConversationId?: string
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
export async function renderConversationViewInto(
  container: HTMLElement,
  username: string,
  displayName: string,
  avatar: string,
  existingConversationId?: string
): Promise<void> {
  setCurrentView("conversation")
  setCurrentOtherUser({ username, displayName, avatar })

  // Stop listening for global messages (list view listener)
  setGlobalMessageListener(null)

  // Note: We no longer clear unread count immediately here.
  // The read status is now delayed (scheduleMarkAsRead) to give the user
  // time to actually read the messages. Cache is cleared when the read is confirmed.

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

            return generateMessageHTML(
              msg.id,
              msg.content,
              msg.created_at,
              isSent,
              statusIcon,
              msg.reactions || [],
              currentUserId
            )
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
  let userId = currentUserId
  if (!userId) {
    const userInfo = await getCurrentUserInfo()
    userId = userInfo?.id || null
    setCurrentUserId(userId)
  }

  // Add back and close button listeners immediately
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
  setCurrentConversationId(conversation.id)
  const otherUser = conversation.other_user
  const otherUserId = otherUser.id

  // Update header with "not on platform" indicator if needed
  if (!otherUser.has_account) {
    const headerUserInfo = container.querySelector(".github-chat-user-info")
    if (headerUserInfo) {
      headerUserInfo.innerHTML = `
        <span class="github-chat-display-name">${escapeHtml(otherUser.display_name)}</span>
        <span class="github-chat-username">@${escapeHtml(otherUser.username)}</span>
        <span class="github-chat-not-on-platform">Not on GH Chat yet</span>
      `
    }
  }

  // Track unread message IDs (received messages that haven't been read)
  const unreadMessageIds: string[] = []

  // Track if there are more messages to load
  let hasMoreMessages = cached?.hasMore ?? false

  // Only fetch and render messages if we didn't show cached ones instantly
  if (!canUseInstantly) {
    const { messages, hasMore } = await getMessages(conversation.id)
    hasMoreMessages = hasMore
    messageCache.set(conversation.id, {
      messages,
      hasMore,
      timestamp: Date.now()
    })

    const msgContainer = container.querySelector("#github-chat-messages")
    if (msgContainer) {
      if (messages.length === 0) {
        msgContainer.innerHTML = `
          <div class="github-chat-empty">
            <p>No messages yet</p>
            <p class="github-chat-empty-hint">Send a message to start the conversation!</p>
            ${!otherUser.has_account ? '<p class="github-chat-empty-hint" style="margin-top: 8px; color: #f0883e;">@' + escapeHtml(username) + " will see your messages when they join GH Chat.</p>" : ""}
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

            return generateMessageHTML(
              msg.id,
              msg.content,
              msg.created_at,
              isSent,
              statusIcon,
              msg.reactions || [],
              userId
            )
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
    getMessages(conversation.id).then(
      ({ messages: freshMessages, hasMore }) => {
        hasMoreMessages = hasMore
        messageCache.set(conversation.id, {
          messages: freshMessages,
          hasMore,
          timestamp: Date.now()
        })
      }
    )
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

  // Infinite scroll - load more messages when scrolling to top
  let isLoadingMore = false
  const msgContainer = container.querySelector(
    "#github-chat-messages"
  ) as HTMLElement

  async function loadMoreMessages() {
    if (isLoadingMore || !hasMoreMessages || !msgContainer) return

    const firstMessage = msgContainer.querySelector(".github-chat-message")
    const oldestMessageId = firstMessage?.getAttribute("data-message-id")
    if (!oldestMessageId) return

    isLoadingMore = true

    // Show loading indicator at top
    const loadingEl = document.createElement("div")
    loadingEl.className = "github-chat-loading-more"
    loadingEl.innerHTML = '<div class="github-chat-loading-spinner"></div>'
    msgContainer.insertBefore(loadingEl, msgContainer.firstChild)

    // Remember scroll position
    const scrollHeightBefore = msgContainer.scrollHeight

    try {
      const { messages: olderMessages, hasMore } = await getMessages(
        conversation.id,
        oldestMessageId
      )
      hasMoreMessages = hasMore

      // Update cache
      const cached = messageCache.get(conversation.id)
      if (cached) {
        cached.messages = [...olderMessages, ...cached.messages]
        cached.hasMore = hasMore
        cached.timestamp = Date.now()
      }

      // Remove loading indicator
      loadingEl.remove()

      if (olderMessages.length > 0) {
        // Prepend older messages
        const messagesHtml = olderMessages
          .map((msg: ApiMessage) => {
            const isReceived = msg.sender_id === otherUserId
            const isSent = !isReceived

            let statusIcon = ""
            if (isSent) {
              const statusClass = msg.read_at ? "read" : "sent"
              statusIcon = `<span class="github-chat-status ${statusClass}">${msg.read_at ? STATUS_ICONS.read : STATUS_ICONS.sent}</span>`
            }

            return generateMessageHTML(
              msg.id,
              msg.content,
              msg.created_at,
              isSent,
              statusIcon,
              msg.reactions || [],
              userId
            )
          })
          .join("")

        // Insert at top - use a wrapper to maintain order
        const tempDiv = document.createElement("div")
        tempDiv.innerHTML = messagesHtml

        // Get the first existing message to insert before
        const firstExistingMessage = msgContainer.firstChild

        // Insert all new messages before the first existing one (maintains order)
        while (tempDiv.firstChild) {
          msgContainer.insertBefore(tempDiv.firstChild, firstExistingMessage)
        }

        // Maintain scroll position
        const scrollHeightAfter = msgContainer.scrollHeight
        msgContainer.scrollTop = scrollHeightAfter - scrollHeightBefore
      }
    } catch (error) {
      console.error("Failed to load more messages:", error)
      loadingEl.remove()
    }

    isLoadingMore = false
  }

  // Add scroll listener for infinite scroll
  msgContainer?.addEventListener("scroll", () => {
    // Load more when near the top (within 100px)
    if (msgContainer.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
      loadMoreMessages()
    }
  })

  // Add click listener for message actions (reaction, options)
  msgContainer?.addEventListener("click", (e) => {
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

      if (!emoji || !messageId || !currentConversationId) return

      if (userReacted) {
        removeReaction(currentConversationId, messageId, emoji)
      } else {
        addReaction(currentConversationId, messageId, emoji)
      }
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

  // Auto-resize textarea and send typing indicator
  input?.addEventListener("input", () => {
    input.style.height = "auto"
    input.style.height = Math.min(input.scrollHeight, 120) + "px"

    // Send typing indicator
    sendTypingIndicator()

    // Clear existing timeout and set new one
    if (typingTimeout) clearTimeout(typingTimeout)
    setTypingTimeout(
      setTimeout(() => {
        sendStopTyping()
      }, 2000)
    )
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
      setTypingTimeout(null)
    }
    sendStopTyping()

    // Generate a temporary ID for the optimistic message
    const tempId = `pending-${incrementPendingMessageId()}`

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
    const pendingStatusIcon = `<span class="github-chat-status pending">${STATUS_ICONS.pending}</span>`
    messageEl.innerHTML = `
      <div class="github-chat-message-wrapper">
        <div class="github-chat-message-actions">
          <button class="github-chat-action-btn" data-action="reaction" title="Add reaction">
            ${MESSAGE_ACTION_ICONS.reaction}
          </button>
          <button class="github-chat-action-btn" data-action="options" title="More options">
            ${MESSAGE_ACTION_ICONS.options}
          </button>
        </div>
        <div class="github-chat-bubble">${escapeHtml(messageText)}</div>
      </div>
      <div class="github-chat-meta">
        <span class="github-chat-time">${formatTime(Date.now())}</span>
        ${pendingStatusIcon}
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
        const cachedData = messageCache.get(currentConversationId)
        if (cachedData) {
          cachedData.messages.push(sentMessage)
          cachedData.timestamp = Date.now()
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

  function showTypingIndicator(typingUsername: string) {
    if (typingIndicatorEl) return // Already showing

    typingIndicatorEl = document.createElement("div")
    typingIndicatorEl.className = "github-chat-typing-indicator"
    typingIndicatorEl.innerHTML = `
      <div class="github-chat-typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span>${escapeHtml(typingUsername)} is typing...</span>
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
    const cleanup = await joinConversation(conversation.id, {
      onMessage: (newMessage: ApiMessage) => {
        if (newMessage.sender_id !== otherUserId) return

        hideTypingIndicator()

        // Update cache with new message (check for duplicates)
        const cachedData = messageCache.get(conversation.id)
        if (cachedData) {
          const exists = cachedData.messages.some((m) => m.id === newMessage.id)
          if (!exists) {
            cachedData.messages.push(newMessage)
            cachedData.timestamp = Date.now()
          }
        }

        // Check if message already displayed in the DOM
        const msgContainer = container.querySelector("#github-chat-messages")
        const existingMsgEl = msgContainer?.querySelector(
          `[data-message-id="${newMessage.id}"]`
        )
        if (existingMsgEl) return // Already displayed, skip

        const emptyState = msgContainer?.querySelector(".github-chat-empty")
        if (emptyState) emptyState.remove()

        const messageEl = document.createElement("div")
        messageEl.className = "github-chat-message received"
        messageEl.setAttribute("data-message-id", newMessage.id.toString())
        messageEl.innerHTML = `
          <div class="github-chat-message-wrapper">
            <div class="github-chat-message-actions">
              <button class="github-chat-action-btn" data-action="reaction" title="Add reaction">
                ${MESSAGE_ACTION_ICONS.reaction}
              </button>
              <button class="github-chat-action-btn" data-action="options" title="More options">
                ${MESSAGE_ACTION_ICONS.options}
              </button>
            </div>
            <div class="github-chat-bubble">${escapeHtml(newMessage.content)}</div>
          </div>
          <div class="github-chat-meta">
            <span class="github-chat-time">${formatTime(new Date(newMessage.created_at).getTime())}</span>
          </div>
        `
        msgContainer?.appendChild(messageEl)
        msgContainer?.scrollTo(0, msgContainer.scrollHeight)

        // Mark as read immediately - user is actively viewing this conversation
        // (The initial mark-as-read is delayed, but subsequent messages can be marked immediately)
        markMessagesAsRead([newMessage.id])
      },

      onTyping: (_typingUserId: string, typingUsername: string) => {
        showTypingIndicator(typingUsername)
      },

      onStopTyping: (_typingUserId: string) => {
        hideTypingIndicator()
      },

      onMessagesRead: (readMessageIds: string[]) => {
        readMessageIds.forEach((id) => {
          const msgEl = container?.querySelector(`[data-message-id="${id}"]`)
          if (msgEl && msgEl.classList.contains("sent")) {
            const statusEl = msgEl.querySelector(".github-chat-status")
            if (statusEl) {
              statusEl.className = "github-chat-status read"
              statusEl.innerHTML = STATUS_ICONS.read
            }
          }
        })
      },

      onReaction: (
        type: "added" | "removed",
        messageId: string,
        emoji: string,
        reactionUserId: string,
        reactionUsername: string
      ) => {
        updateReactionInDOM(
          messageId,
          emoji,
          reactionUserId,
          reactionUsername,
          type === "added",
          userId
        )
      }
    })

    setWsCleanup(cleanup)

    // Schedule marking as read after a delay (gives user time to actually read)
    // This will be cancelled if user leaves the conversation quickly
    scheduleMarkAsRead(conversation.id, unreadMessageIds)
  } catch (error) {
    console.error("WebSocket error:", error)
  }

  input?.focus()
}
