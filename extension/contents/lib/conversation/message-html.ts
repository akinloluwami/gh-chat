// Message HTML generation and icons

import type { Reaction, ReplyTo } from "~lib/api"

import { escapeHtml, formatTime } from "../utils"

// Message action icons
export const MESSAGE_ACTION_ICONS = {
  reaction: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.82 1.636a.75.75 0 0 1 1.038.175l.007.009c.103.118.22.222.35.31.264.178.683.37 1.285.37.602 0 1.02-.192 1.285-.371.13-.088.247-.192.35-.31l.007-.008a.75.75 0 0 1 1.222.87l-.022.03c-.182.248-.422.49-.717.69-.473.322-1.13.57-2.125.57-.995 0-1.652-.248-2.125-.57a3.3 3.3 0 0 1-.717-.69l-.022-.03a.75.75 0 0 1 .184-1.045ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
  options: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path></svg>`
}

// Generate quoted content HTML for a reply
export function generateQuotedContentHTML(
  replyTo: ReplyTo | null | undefined
): string {
  if (!replyTo) return ""

  const truncatedContent =
    replyTo.content.length > 50
      ? replyTo.content.substring(0, 50) + "..."
      : replyTo.content

  return `
    <div class="github-chat-quoted-content" data-quoted-message-id="${replyTo.id}">
      <span class="github-chat-quoted-sender">@${escapeHtml(replyTo.sender_username)}</span>
      <span class="github-chat-quoted-text">${escapeHtml(truncatedContent)}</span>
    </div>
  `
}

// Group reactions by emoji for display
export function groupReactions(
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
export function generateReactionsHTML(
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
export function generateMessageHTML(
  messageId: string,
  content: string,
  timestamp: number | string,
  isSent: boolean,
  statusIcon: string = "",
  reactions: Reaction[] = [],
  currentUserIdVal: string | null = null,
  replyTo?: ReplyTo | null
): string {
  const timeStr =
    typeof timestamp === "string"
      ? formatTime(new Date(timestamp).getTime())
      : formatTime(timestamp)

  const reactionsHTML = generateReactionsHTML(reactions, currentUserIdVal)
  const quotedHTML = generateQuotedContentHTML(replyTo)

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
        <div class="github-chat-bubble">${quotedHTML}${escapeHtml(content)}</div>
      </div>
      ${reactionsHTML}
      <div class="github-chat-meta">
        <span class="github-chat-time">${timeStr}</span>
        ${statusIcon}
      </div>
    </div>
  `
}
