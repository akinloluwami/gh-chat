// Conversation layout HTML generation

import { escapeHtml } from "../utils"

// Icons
const ICONS = {
  back: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"></path></svg>`,
  close: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>`,
  expand: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.75 2h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0v-2.5C2 2.784 2.784 2 3.75 2Zm6.5 0h2.5C13.216 2 14 2.784 14 3.75v2.5a.75.75 0 0 1-1.5 0v-2.5a.25.25 0 0 0-.25-.25h-2.5a.75.75 0 0 1 0-1.5ZM3.5 9.75a.75.75 0 0 0-1.5 0v2.5c0 .966.784 1.75 1.75 1.75h2.5a.75.75 0 0 1 0-1.5h-2.5a.25.25 0 0 1-.25-.25v-2.5Zm10 0a.75.75 0 0 0-1.5 0v2.5a.25.25 0 0 1-.25.25h-2.5a.75.75 0 0 0 0 1.5h2.5c.966 0 1.75-.784 1.75-1.75v-2.5Z"></path></svg>`
}

// Generate conversation view header HTML
export function generateConversationHeaderHTML(
  avatar: string,
  displayName: string,
  username: string,
  isExpandedView: boolean = false
): string {
  // In expanded view, don't show back/close buttons or expand button
  const leftButton = isExpandedView
    ? ""
    : `<button class="github-chat-back" aria-label="Back">${ICONS.back}</button>`

  const rightButtons = isExpandedView
    ? ""
    : `
      <button class="github-chat-expand" aria-label="Expand" title="Open expanded view">
        ${ICONS.expand}
      </button>
      <button class="github-chat-close" aria-label="Close">
        ${ICONS.close}
      </button>
    `

  return `
    <div class="github-chat-header">
      ${leftButton}
      <img src="${avatar}" alt="${displayName}" class="github-chat-avatar" />
      <div class="github-chat-user-info">
        <span class="github-chat-display-name">${escapeHtml(displayName)}</span>
        <span class="github-chat-username">@${escapeHtml(username)}</span>
      </div>
      ${rightButtons}
    </div>
  `
}

// Generate the full conversation layout HTML
export function generateConversationLayoutHTML(
  avatar: string,
  displayName: string,
  username: string,
  messagesHtml: string,
  inputDisabled: boolean,
  isExpandedView: boolean = false
): string {
  return `
    ${generateConversationHeaderHTML(avatar, displayName, username, isExpandedView)}
    <div class="github-chat-messages" id="github-chat-messages">
      ${messagesHtml}
    </div>
    <div class="github-chat-input-area">
      <button class="github-chat-emoji-btn-input" id="github-chat-emoji-btn" aria-label="Insert emoji" title="Insert emoji" ${inputDisabled ? "disabled" : ""}>
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.82 1.636a.75.75 0 0 1 1.038.175l.007.009c.103.118.22.222.35.31.264.178.683.37 1.285.37.602 0 1.02-.192 1.285-.371.13-.088.247-.192.35-.31l.007-.008a.75.75 0 0 1 1.222.87l-.614-.431c.614.43.614.431.613.431v.001l-.001.002-.002.003-.005.007-.014.019a2.066 2.066 0 0 1-.184.213 2.88 2.88 0 0 1-.534.41c-.435.265-1.07.501-1.922.501-.852 0-1.487-.236-1.922-.501a2.867 2.867 0 0 1-.534-.41 2.048 2.048 0 0 1-.184-.213l-.014-.019-.005-.007-.002-.003v-.002h-.001l.613-.432-.614.43a.75.75 0 0 1 .183-1.044ZM6.5 6.5c0 .552-.448 1-1 1s-1-.448-1-1 .448-1 1-1 1 .448 1 1Zm5 0c0 .552-.448 1-1 1s-1-.448-1-1 .448-1 1-1 1 .448 1 1Z"></path>
        </svg>
      </button>
      <textarea class="github-chat-input" placeholder="Type a message..." rows="1" id="github-chat-input" ${inputDisabled ? "disabled" : ""}></textarea>
      <button class="github-chat-send" id="github-chat-send" aria-label="Send" ${inputDisabled ? "disabled" : ""}>
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="M.989 8 .064 2.68a1.342 1.342 0 0 1 1.85-1.462l13.402 5.744a1.13 1.13 0 0 1 0 2.076L1.913 14.782a1.343 1.343 0 0 1-1.85-1.463L.99 8Zm.603-5.288L2.38 7.25h4.87a.75.75 0 0 1 0 1.5H2.38l-.788 4.538L13.929 8Z"></path>
        </svg>
      </button>
    </div>
  `
}

// Generate "not on platform" user info HTML
export function generateNotOnPlatformUserInfoHTML(
  displayName: string,
  username: string
): string {
  return `
    <span class="github-chat-display-name">${escapeHtml(displayName)}</span>
    <span class="github-chat-username">@${escapeHtml(username)}</span>
    <span class="github-chat-not-on-platform">Not on GH Chat yet</span>
  `
}

// Generate empty conversation state HTML
export function generateEmptyConversationHTML(
  username: string,
  hasAccount: boolean
): string {
  return `
    <div class="github-chat-empty">
      <p>No messages yet</p>
      <p class="github-chat-empty-hint">Send a message to start the conversation!</p>
      ${!hasAccount ? '<p class="github-chat-empty-hint" style="margin-top: 8px; color: #f0883e;">@' + escapeHtml(username) + " will see your messages when they join GH Chat.</p>" : ""}
    </div>
  `
}

// Generate error state HTML
export function generateConversationErrorHTML(errorMessage?: string): string {
  return `
    <div class="github-chat-error">
      <p>Failed to start conversation</p>
      <p class="github-chat-empty-hint">${errorMessage || "Please try again later"}</p>
    </div>
  `
}

// Generate typing indicator HTML
export function generateTypingIndicatorHTML(typingUsername: string): string {
  return `
    <div class="github-chat-typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <span>${escapeHtml(typingUsername)} is typing...</span>
  `
}
