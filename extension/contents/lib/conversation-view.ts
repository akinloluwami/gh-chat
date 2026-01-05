// Conversation view rendering and message handling

import {
  sendMessage as apiSendMessage,
  getMessages,
  getOrCreateConversation,
  joinConversation,
  markConversationAsRead,
  markMessagesAsRead,
  sendStopTyping,
  sendTypingIndicator,
  setGlobalMessageListener,
  type Message as ApiMessage
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

  // Immediately clear unread count in chat list cache for this conversation
  if (existingConversationId) {
    clearUnreadInCache(existingConversationId)
  }

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

            return `
            <div class="github-chat-message ${isReceived ? "received" : "sent"}" data-message-id="${msg.id}">
              <div class="github-chat-bubble">${escapeHtml(msg.content)}</div>
              <div class="github-chat-meta">
                <span class="github-chat-time">${formatTime(new Date(msg.created_at).getTime())}</span>
                ${statusIcon}
              </div>
            </div>
          `
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

            return `
              <div class="github-chat-message ${isReceived ? "received" : "sent"}" data-message-id="${msg.id}">
                <div class="github-chat-bubble">${escapeHtml(msg.content)}</div>
                <div class="github-chat-meta">
                  <span class="github-chat-time">${formatTime(new Date(msg.created_at).getTime())}</span>
                  ${statusIcon}
                </div>
              </div>
            `
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

            return `
              <div class="github-chat-message ${isReceived ? "received" : "sent"}" data-message-id="${msg.id}">
                <div class="github-chat-bubble">${escapeHtml(msg.content)}</div>
                <div class="github-chat-meta">
                  <span class="github-chat-time">${formatTime(new Date(msg.created_at).getTime())}</span>
                  ${statusIcon}
                </div>
              </div>
            `
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
    messageEl.innerHTML = `
      <div class="github-chat-bubble">${escapeHtml(messageText)}</div>
      <div class="github-chat-meta">
        <span class="github-chat-time">${formatTime(Date.now())}</span>
        <span class="github-chat-status pending">${STATUS_ICONS.pending}</span>
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
          <div class="github-chat-bubble">${escapeHtml(newMessage.content)}</div>
          <div class="github-chat-meta">
            <span class="github-chat-time">${formatTime(new Date(newMessage.created_at).getTime())}</span>
          </div>
        `
        msgContainer?.appendChild(messageEl)
        msgContainer?.scrollTo(0, msgContainer.scrollHeight)

        // Mark as read immediately since drawer is open
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
      }
    })

    setWsCleanup(cleanup)

    // Mark the conversation as read (updates the server's last_read_at timestamp)
    markConversationAsRead(conversation.id).then(() => {
      // Invalidate the chat list cache so back navigation shows fresh unread counts
      setChatListCache(null)
      // Refresh the unread badge in the header after marking as read
      const nav = getNavigationCallbacks()
      nav?.refreshUnreadBadge()
    })

    // Now that we're joined, mark any unread messages as read
    if (unreadMessageIds.length > 0) {
      markMessagesAsRead(unreadMessageIds)
    }
  } catch (error) {
    console.error("WebSocket error:", error)
  }

  input?.focus()
}
