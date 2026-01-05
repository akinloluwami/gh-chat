// Conversation layout HTML generation

import { escapeHtml } from "../utils"

// Generate conversation view header HTML
export function generateConversationHeaderHTML(
  avatar: string,
  displayName: string,
  username: string
): string {
  return `
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
  `
}

// Generate the full conversation layout HTML
export function generateConversationLayoutHTML(
  avatar: string,
  displayName: string,
  username: string,
  messagesHtml: string,
  inputDisabled: boolean
): string {
  return `
    ${generateConversationHeaderHTML(avatar, displayName, username)}
    <div class="github-chat-messages" id="github-chat-messages">
      ${messagesHtml}
    </div>
    <div class="github-chat-input-area">
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
