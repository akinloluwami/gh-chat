// Conversation module exports

// Main view
export {
  renderConversationViewAnimated,
  renderConversationViewInto,
  renderConversationView,
  cancelPendingRead
} from "./view"

// Layout HTML generation
export {
  generateConversationHeaderHTML,
  generateConversationLayoutHTML,
  generateNotOnPlatformUserInfoHTML,
  generateEmptyConversationHTML,
  generateConversationErrorHTML,
  generateTypingIndicatorHTML
} from "./layout"

// Message HTML generation
export {
  generateMessageHTML,
  generateReactionsHTML,
  generateQuotedContentHTML,
  groupReactions,
  MESSAGE_ACTION_ICONS
} from "./message-html"

// Message fetching
export {
  buildInitialMessagesHTML,
  fetchAndRenderMessages,
  refreshCacheInBackground
} from "./message-fetcher"

// Navigation
export { setupNavigationButtons } from "./navigation"

// Reactions
export { handleReactionOptimistic, updateReactionInDOM } from "./reactions"

// Read status
export { scheduleMarkAsRead, clearUnreadInCache } from "./read-status"

// Emoji popover
export {
  createEmojiPopover,
  closeEmojiPopover,
  showEmojiPopover,
  QUICK_EMOJIS
} from "./emoji-popover"

// Emoji picker
export {
  showFullEmojiPicker,
  showEmojiPickerForInsert,
  closeEmojiPicker
} from "./emoji-picker"

// Input handling
export {
  setupInputHandlers,
  showQuotePreview,
  hideQuotePreview,
  showEditPreview,
  hideEditPreview
} from "./input-handler"

// WebSocket handling
export { setupWebSocketHandler } from "./websocket-handler"

// Scroll handling
export { setupInfiniteScroll } from "./scroll-handler"

// Action handling
export { setupMessageActionHandlers, closeOptionsMenu } from "./action-handler"
