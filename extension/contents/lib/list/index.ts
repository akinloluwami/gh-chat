// List module exports

import { getAllChats, prefetchMessages } from "./data"
import {
  initMessageListenerDeps,
  startListMessageListener,
  stopListMessageListener,
  updateConversationInList
} from "./message-listener"
import {
  generateListViewInnerHTML,
  renderListView,
  renderListViewAnimated,
  setupListViewEventListeners
} from "./view"

// Initialize circular dependencies
initMessageListenerDeps(
  generateListViewInnerHTML,
  setupListViewEventListeners,
  getAllChats
)

// Export everything
export {
  renderListView,
  renderListViewAnimated,
  generateListViewInnerHTML,
  setupListViewEventListeners
} from "./view"

export { getAllChats, prefetchMessages } from "./data"

export {
  startListMessageListener,
  stopListMessageListener,
  updateConversationInList
} from "./message-listener"
