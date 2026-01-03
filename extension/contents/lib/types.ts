// Shared types for the chat extension

export interface ChatPreview {
  username: string
  displayName: string
  avatar: string
  lastMessage: string
  lastMessageTime: number
  unread: boolean
  hasAccount: boolean
  conversationId?: number
}

export interface CurrentOtherUser {
  username: string
  displayName: string
  avatar: string
}

// Status icons for message states
export const STATUS_ICONS = {
  pending: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>`,
  sent: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`,
  read: `<svg viewBox="0 0 24 16" width="18" height="12"><path fill="currentColor" d="M11.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L4 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/><path fill="currentColor" d="M19.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0l-1.5-1.5a.751.751 0 0 1 1.06-1.06l.97.97 6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`,
  failed: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L9.06 8l3.22 3.22a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`
}
