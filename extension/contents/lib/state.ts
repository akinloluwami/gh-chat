// Shared chat state module

import type { Message as ApiMessage } from "~lib/api"

import type { ChatPreview, CurrentOtherUser } from "./types"

// Navigation callbacks (to avoid circular imports)
export type NavigationCallbacks = {
  closeChatDrawer: () => void
  goBackToList: () => void
  openChatListDrawer: () => Promise<void>
  openChatDrawer: (
    username: string,
    displayName: string,
    avatar: string
  ) => Promise<void>
}

let navigationCallbacks: NavigationCallbacks | null = null

export function setNavigationCallbacks(callbacks: NavigationCallbacks): void {
  navigationCallbacks = callbacks
}

export function getNavigationCallbacks(): NavigationCallbacks | null {
  return navigationCallbacks
}

// Global state
export let chatDrawer: HTMLElement | null = null
export let chatOverlay: HTMLElement | null = null
export let currentConversationId: number | null = null
export let currentUserId: number | null = null
export let wsCleanup: (() => void) | null = null
export let pendingMessageId = 0
export let typingTimeout: ReturnType<typeof setTimeout> | null = null
export let currentView: "list" | "conversation" = "list"
export let currentOtherUser: CurrentOtherUser | null = null

// Message cache for instant loading
export const messageCache: Map<
  number,
  { messages: ApiMessage[]; timestamp: number }
> = new Map()
export const CACHE_TTL = 30000 // 30 seconds

// Chat list cache for instant back navigation
export let chatListCache: { chats: ChatPreview[]; timestamp: number } | null =
  null
export const CHAT_LIST_CACHE_TTL = 10000 // 10 seconds

// State setters
export function setChatDrawer(el: HTMLElement | null) {
  chatDrawer = el
}

export function setChatOverlay(el: HTMLElement | null) {
  chatOverlay = el
}

export function setCurrentConversationId(id: number | null) {
  currentConversationId = id
}

export function setCurrentUserId(id: number | null) {
  currentUserId = id
}

export function setWsCleanup(cleanup: (() => void) | null) {
  wsCleanup = cleanup
}

export function incrementPendingMessageId(): number {
  return ++pendingMessageId
}

export function setTypingTimeout(
  timeout: ReturnType<typeof setTimeout> | null
) {
  typingTimeout = timeout
}

export function setCurrentView(view: "list" | "conversation") {
  currentView = view
}

export function setCurrentOtherUser(user: CurrentOtherUser | null) {
  currentOtherUser = user
}

export function setChatListCache(
  cache: { chats: ChatPreview[]; timestamp: number } | null
) {
  chatListCache = cache
}
