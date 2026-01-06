// Conversation view - main orchestration

import {
  getOrCreateConversation,
  setGlobalMessageListener,
  type Message as ApiMessage
} from "~lib/api"

import { getCurrentUserInfo } from "../auth"
import {
  chatDrawer,
  currentUserId,
  currentUsername,
  messageCache,
  setCurrentConversationId,
  setCurrentOtherUser,
  setCurrentUserId,
  setCurrentUsername,
  setCurrentView
} from "../state"
import { setupMessageActionHandlers } from "./action-handler"
import { setupInputHandlers } from "./input-handler"
import {
  generateConversationErrorHTML,
  generateConversationLayoutHTML,
  generateNotOnPlatformUserInfoHTML
} from "./layout"
import {
  buildInitialMessagesHTML,
  fetchAndRenderMessages,
  refreshCacheInBackground
} from "./message-fetcher"
import { setupNavigationButtons } from "./navigation"
import { setupInfiniteScroll } from "./scroll-handler"
import { setupWebSocketHandler } from "./websocket-handler"

// Export read status functions for use by external modules
export { cancelPendingRead } from "./read-status"

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
      () => currentViewEl.remove(),
      { once: true }
    )
  }

  // Create new view with animation
  const viewEl = document.createElement("div")
  viewEl.className = "github-chat-view slide-in-right"
  chatDrawer.appendChild(viewEl)

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
  existingConversationId?: string,
  isExpandedView: boolean = false
): Promise<void> {
  // Initialize view state
  setCurrentView("conversation")
  setCurrentOtherUser({ username, displayName, avatar })
  setGlobalMessageListener(null)

  // Render initial layout with cached messages if available
  const cached = existingConversationId
    ? messageCache.get(existingConversationId)
    : null
  const { html: initialMessagesHtml, canUseInstantly } =
    buildInitialMessagesHTML(cached, currentUserId)
  container.innerHTML = generateConversationLayoutHTML(
    avatar,
    displayName,
    username,
    initialMessagesHtml,
    !canUseInstantly,
    isExpandedView
  )

  // Scroll to bottom if we have cached messages
  const messagesContainer = container.querySelector("#github-chat-messages")
  if (canUseInstantly && messagesContainer) {
    messagesContainer.scrollTo(0, messagesContainer.scrollHeight)
  }

  // Ensure current user info is set
  const userId = await ensureCurrentUserInfo()

  // Setup navigation
  setupNavigationButtons(container)

  // Get or create conversation
  const result = await getOrCreateConversation(username)
  if (!result.conversation) {
    showConversationError(container, result.error)
    return
  }

  const conversation = result.conversation
  setCurrentConversationId(conversation.id)

  // Update header if user not on platform
  updateHeaderForOffPlatformUser(container, conversation.other_user)

  // Load messages
  const { unreadMessageIds, hasMoreMessages } =
    await loadMessagesForConversation(
      container,
      conversation,
      cached,
      canUseInstantly,
      username,
      userId
    )

  // Setup all interaction handlers
  await setupAllHandlers(
    container,
    conversation.id,
    conversation.other_user.id,
    userId,
    hasMoreMessages,
    unreadMessageIds
  )
}

// Ensure current user info is loaded
async function ensureCurrentUserInfo(): Promise<string | null> {
  let userId = currentUserId
  if (!userId || !currentUsername) {
    const userInfo = await getCurrentUserInfo()
    userId = userInfo?.id || null
    setCurrentUserId(userId)
    setCurrentUsername(userInfo?.username || null)
  }
  return userId
}

// Show error message in conversation
function showConversationError(container: HTMLElement, error?: string): void {
  const msgContainer = container.querySelector("#github-chat-messages")
  if (msgContainer) {
    msgContainer.innerHTML = generateConversationErrorHTML(error)
  }
}

// Update header if user is not on platform
function updateHeaderForOffPlatformUser(
  container: HTMLElement,
  otherUser: { has_account: boolean; display_name: string; username: string }
): void {
  if (!otherUser.has_account) {
    const headerUserInfo = container.querySelector(".github-chat-user-info")
    if (headerUserInfo) {
      headerUserInfo.innerHTML = generateNotOnPlatformUserInfoHTML(
        otherUser.display_name,
        otherUser.username
      )
    }
  }
}

// Load messages for conversation (from cache or API)
async function loadMessagesForConversation(
  container: HTMLElement,
  conversation: {
    id: string
    other_user: { id: string; has_account: boolean }
  },
  cached: { messages: ApiMessage[]; hasMore: boolean } | null,
  canUseInstantly: boolean,
  username: string,
  userId: string | null
): Promise<{ unreadMessageIds: string[]; hasMoreMessages: boolean }> {
  const unreadMessageIds: string[] = []
  let hasMoreMessages = cached?.hasMore ?? false

  if (!canUseInstantly) {
    const result = await fetchAndRenderMessages(
      container,
      conversation.id,
      conversation.other_user.id,
      conversation.other_user.has_account,
      username,
      userId
    )
    hasMoreMessages = result.hasMore
    result.unreadIds.forEach((id) => unreadMessageIds.push(id))
  } else {
    // Collect unread IDs from cache
    cached!.messages.forEach((msg: ApiMessage) => {
      if (msg.sender_id === conversation.other_user.id && !msg.read_at) {
        unreadMessageIds.push(msg.id)
      }
    })
    refreshCacheInBackground(conversation.id)
  }

  return { unreadMessageIds, hasMoreMessages }
}

// Setup all interaction handlers
async function setupAllHandlers(
  container: HTMLElement,
  conversationId: string,
  otherUserId: string,
  userId: string | null,
  hasMoreMessages: boolean,
  unreadMessageIds: string[]
): Promise<void> {
  const input = container.querySelector(
    "#github-chat-input"
  ) as HTMLTextAreaElement
  const sendBtn = container.querySelector(
    "#github-chat-send"
  ) as HTMLButtonElement
  const emojiBtn = container.querySelector(
    "#github-chat-emoji-btn"
  ) as HTMLButtonElement
  const msgContainer = container.querySelector(
    "#github-chat-messages"
  ) as HTMLElement

  // Enable all input controls
  if (input) input.disabled = false
  if (sendBtn) sendBtn.disabled = false
  if (emojiBtn) emojiBtn.disabled = false

  setupInputHandlers(container, input, sendBtn)
  setupMessageActionHandlers(msgContainer)
  setupInfiniteScroll(
    msgContainer,
    conversationId,
    otherUserId,
    userId,
    hasMoreMessages
  )
  await setupWebSocketHandler(
    container,
    conversationId,
    otherUserId,
    userId,
    unreadMessageIds
  )

  input?.focus()
}

// Render conversation view for expanded view (WhatsApp-style)
export async function renderConversationView(
  container: HTMLElement,
  conversationId: string,
  otherUserId: string,
  otherUsername: string,
  otherDisplayName: string,
  otherAvatar: string,
  otherHasAccount: boolean,
  isExpandedView: boolean = false
): Promise<void> {
  // Initialize view state
  setCurrentView("conversation")
  setCurrentOtherUser({
    username: otherUsername,
    displayName: otherDisplayName,
    avatar: otherAvatar
  })
  setCurrentConversationId(conversationId)
  setGlobalMessageListener(null)

  // Ensure current user info is set
  const userId = await ensureCurrentUserInfo()

  // Render initial layout with cached messages if available
  const cached = messageCache.get(conversationId) || null
  const { html: initialMessagesHtml, canUseInstantly } =
    buildInitialMessagesHTML(cached, currentUserId)
  container.innerHTML = generateConversationLayoutHTML(
    otherAvatar,
    otherDisplayName,
    otherUsername,
    initialMessagesHtml,
    !canUseInstantly,
    isExpandedView
  )

  // Scroll to bottom if we have cached messages
  const messagesContainer = container.querySelector("#github-chat-messages")
  if (canUseInstantly && messagesContainer) {
    messagesContainer.scrollTo(0, messagesContainer.scrollHeight)
  }

  // Update header if user not on platform
  if (!otherHasAccount) {
    updateHeaderForOffPlatformUser(container, {
      has_account: otherHasAccount,
      display_name: otherDisplayName,
      username: otherUsername
    })
  }

  // Load messages
  const { unreadMessageIds, hasMoreMessages } =
    await loadMessagesForConversation(
      container,
      {
        id: conversationId,
        other_user: {
          id: otherUserId,
          has_account: otherHasAccount
        }
      },
      cached,
      canUseInstantly,
      otherUsername,
      userId
    )

  // Setup all interaction handlers
  await setupAllHandlers(
    container,
    conversationId,
    otherUserId,
    userId,
    hasMoreMessages,
    unreadMessageIds
  )
}
