// Message listener for real-time list updates

import { setGlobalMessageListener, type Message } from "~lib/api"

import {
  chatListCache,
  getChatDrawer,
  getCurrentUserId,
  getCurrentView,
  getNavigationCallbacks,
  messageCache
} from "../state"
import { formatRelativeTime } from "../utils"

// Forward declarations to avoid circular imports
let _generateListViewInnerHTML: ((chats: any[]) => string) | null = null
let _setupListViewEventListeners:
  | ((chats: any[], container?: Element) => void)
  | null = null
let _getAllChats: (() => Promise<any[]>) | null = null

// Initialize dependencies (called from index.ts after all modules are loaded)
export function initMessageListenerDeps(
  generateFn: (chats: any[]) => string,
  setupFn: (chats: any[], container?: Element) => void,
  getChats: () => Promise<any[]>
): void {
  _generateListViewInnerHTML = generateFn
  _setupListViewEventListeners = setupFn
  _getAllChats = getChats
}

// Update a single conversation in the list when a new message arrives
export function updateConversationInList(
  conversationId: string,
  message: Message
): void {
  try {
    const currentView = getCurrentView()
    const chatDrawer = getChatDrawer()
    const currentUserId = getCurrentUserId()

    console.log(
      "updateConversationInList called:",
      conversationId,
      message.content
    )
    console.log(
      "currentView:",
      currentView,
      "chatDrawer:",
      !!chatDrawer,
      "currentUserId:",
      currentUserId
    )

    // Only update if we're on the list view
    if (currentView !== "list" || !chatDrawer) {
      console.log("Skipping list update - not on list view or no drawer")
      return
    }

    // Update the message cache so the conversation shows the new message when opened
    const cached = messageCache.get(conversationId)
    if (cached) {
      // Check if message already exists to avoid duplicates
      const exists = cached.messages.some((m) => m.id === message.id)
      if (!exists) {
        cached.messages.push(message)
        cached.timestamp = Date.now()
      }
    }

    // Check if this is our own message (don't show unread for sent messages)
    const isOwnMessage = message.sender_id === currentUserId

    // Update the chat list cache as well
    if (chatListCache && !isOwnMessage) {
      const cachedChat = chatListCache.chats.find(
        (c) => c.conversationId === conversationId
      )
      if (cachedChat) {
        cachedChat.lastMessage = message.content
        cachedChat.lastMessageTime = Date.now()
        cachedChat.unread = true
        cachedChat.unreadCount = (cachedChat.unreadCount || 0) + 1
      }
    }

    // Find the active view element (last one if multiple during animation)
    const views = chatDrawer.querySelectorAll(".github-chat-view")
    const activeView = views.length > 0 ? views[views.length - 1] : chatDrawer

    const listItem = activeView.querySelector(
      `.github-chat-list-item[data-conversation-id="${conversationId}"]`
    )

    console.log("Looking for list item with conversationId:", conversationId)
    console.log("Found listItem:", !!listItem)
    console.log("Number of views:", views.length)

    if (listItem) {
      // Update the preview text
      const preview = listItem.querySelector(".github-chat-list-preview")
      if (preview) {
        preview.textContent = message.content
      }

      // Update the time
      const time = listItem.querySelector(".github-chat-list-time")
      if (time) {
        time.textContent = formatRelativeTime(Date.now())
      }

      // Only show unread badge for messages from others
      if (!isOwnMessage) {
        // Increment unread count badge
        const messageRow = listItem.querySelector(
          ".github-chat-list-message-row"
        )
        let badge = listItem.querySelector(".github-chat-list-unread-badge")
        if (badge) {
          const currentCount = parseInt(badge.textContent || "0") || 0
          const newCount = currentCount + 1
          badge.textContent = newCount > 99 ? "99+" : String(newCount)
        } else if (messageRow) {
          // Create new badge
          badge = document.createElement("span")
          badge.className = "github-chat-list-unread-badge"
          badge.textContent = "1"
          messageRow.appendChild(badge)
        }

        // Add unread class
        listItem.classList.add("unread")

        // Also update the header unread badge
        const nav = getNavigationCallbacks()
        nav?.refreshUnreadBadge()
      }

      // Move to top of list
      const chatList = activeView.querySelector(".github-chat-list")
      if (chatList && listItem.parentElement === chatList) {
        chatList.insertBefore(listItem, chatList.firstChild)
      }
    } else {
      console.log("List item not found, refreshing whole list")
      // Conversation not in list - refresh the whole list
      if (_getAllChats) {
        _getAllChats().then((freshChats) => {
          // Get fresh reference to active view
          const views = getChatDrawer()?.querySelectorAll(".github-chat-view")
          const viewEl =
            views && views.length > 0
              ? views[views.length - 1]
              : getChatDrawer()
          if (
            viewEl &&
            _generateListViewInnerHTML &&
            _setupListViewEventListeners
          ) {
            viewEl.innerHTML = _generateListViewInnerHTML(freshChats)
            _setupListViewEventListeners(freshChats, viewEl as Element)
          }
          // Update header badge
          const nav = getNavigationCallbacks()
          nav?.refreshUnreadBadge()
        })
      }
    }
  } catch (error) {
    console.error("Error in updateConversationInList:", error)
  }
}

// Start listening for new messages to update the list
export function startListMessageListener(): void {
  console.log(
    "startListMessageListener called - setting global message listener"
  )
  setGlobalMessageListener((conversationId, message) => {
    console.log(
      "Global message listener triggered:",
      conversationId,
      message.content
    )
    updateConversationInList(conversationId, message)
  })
}

// Stop listening for new messages
export function stopListMessageListener(): void {
  setGlobalMessageListener(null)
}
