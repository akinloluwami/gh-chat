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
    avatar: string,
    existingConversationId?: string
  ) => Promise<void>
  refreshUnreadBadge: () => void
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
export let currentConversationId: string | null = null
export let currentUserId: string | null = null
export let currentUsername: string | null = null
export let wsCleanup: (() => void) | null = null
export let pendingMessageId = 0
export let typingTimeout: ReturnType<typeof setTimeout> | null = null
export let currentView: "list" | "conversation" = "list"
export let currentOtherUser: CurrentOtherUser | null = null
export let isExpandedViewMode: boolean = false

// Message cache for instant loading
export const messageCache: Map<
  string,
  { messages: ApiMessage[]; hasMore: boolean; timestamp: number }
> = new Map()
export const CACHE_TTL = 30000 // 30 seconds

// Chat list cache for instant back navigation
export let chatListCache: { chats: ChatPreview[]; timestamp: number } | null =
  null
export const CHAT_LIST_CACHE_TTL = 10000 // 10 seconds

// Draft messages storage (per conversation)
const draftMessages: Map<string, string> = new Map()

export function setDraftMessage(conversationId: string, text: string): void {
  if (text.trim()) {
    draftMessages.set(conversationId, text)
  } else {
    draftMessages.delete(conversationId)
  }
}

export function getDraftMessage(conversationId: string): string {
  return draftMessages.get(conversationId) || ""
}

export function clearDraftMessage(conversationId: string): void {
  draftMessages.delete(conversationId)
}

// Quote reply state
export type QuotedMessage = {
  id: string
  content: string
  senderUsername: string
} | null

export let quotedMessage: QuotedMessage = null

// Edit message state
export type EditingMessage = {
  id: string
  content: string
  createdAt: string
} | null

export let editingMessage: EditingMessage = null

// State setters
export function setChatDrawer(el: HTMLElement | null) {
  chatDrawer = el
}

export function getChatDrawer(): HTMLElement | null {
  return chatDrawer
}

export function setChatOverlay(el: HTMLElement | null) {
  chatOverlay = el
}

export function setCurrentConversationId(id: string | null) {
  currentConversationId = id
}

export function getCurrentConversationId(): string | null {
  return currentConversationId
}

export function setCurrentUserId(id: string | null) {
  currentUserId = id
}

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function setCurrentUsername(username: string | null) {
  currentUsername = username
}

export function getCurrentUsername(): string | null {
  return currentUsername
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

export function getCurrentView(): "list" | "conversation" {
  return currentView
}

export function setCurrentOtherUser(user: CurrentOtherUser | null) {
  currentOtherUser = user
}

export function setExpandedViewMode(isExpanded: boolean) {
  isExpandedViewMode = isExpanded
}

export function getExpandedViewMode(): boolean {
  return isExpandedViewMode
}

// Helper to get the correct chat container (drawer or expanded view)
export function getChatContainer(): HTMLElement | null {
  if (isExpandedViewMode) {
    return document.querySelector(".github-chat-expanded-main")
  }
  return chatDrawer
}

export function setChatListCache(
  cache: { chats: ChatPreview[]; timestamp: number } | null
) {
  chatListCache = cache
}

// Quote reply state management
export function setQuotedMessage(message: QuotedMessage) {
  quotedMessage = message
}

export function getQuotedMessage(): QuotedMessage {
  return quotedMessage
}

export function clearQuotedMessage() {
  quotedMessage = null
}

// Edit message state management
export function setEditingMessage(message: EditingMessage) {
  editingMessage = message
}

export function getEditingMessage(): EditingMessage {
  return editingMessage
}

export function clearEditingMessage() {
  editingMessage = null
}

// Preferred view mode persistence (drawer vs expanded)
const VIEW_MODE_KEY = "github-chat-preferred-view-mode"

export type ViewMode = "drawer" | "expanded"

export function getPreferredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === "expanded") return "expanded"
  } catch {
    // localStorage not available
  }
  return "drawer"
}

export function setPreferredViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    // localStorage not available
  }
}
