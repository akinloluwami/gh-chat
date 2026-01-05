// Full emoji picker with categories and search

import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  saveRecentEmoji,
  searchEmojis
} from "../emoji-data"
import {
  chatDrawer,
  currentConversationId,
  currentUserId,
  currentUsername
} from "../state"
import { closeEmojiPopover } from "./emoji-popover"
import { handleReactionOptimistic } from "./reactions"

// Full emoji picker state
let currentEmojiPicker: HTMLElement | null = null
let currentPickerMessageId: string | null = null

// Close the full emoji picker
export function closeEmojiPicker(): void {
  if (currentEmojiPicker) {
    currentEmojiPicker.remove()
    currentEmojiPicker = null
    currentPickerMessageId = null
    document.removeEventListener("click", handlePickerOutsideClick)
  }
}

// Handle clicks outside the full picker
function handlePickerOutsideClick(e: MouseEvent): void {
  if (currentEmojiPicker && !currentEmojiPicker.contains(e.target as Node)) {
    closeEmojiPicker()
  }
}

// Render emoji grid for a category or search results
function renderEmojiGrid(emojis: string[], messageId: string): string {
  if (emojis.length === 0) {
    return `<div class="github-chat-emoji-picker-empty">No emojis found</div>`
  }

  const buttons = emojis
    .map(
      (emoji) =>
        `<button class="github-chat-emoji-picker-emoji" data-emoji="${emoji}" data-message-id="${messageId}">${emoji}</button>`
    )
    .join("")

  return `<div class="github-chat-emoji-picker-grid">${buttons}</div>`
}

// Attach click handlers to emoji buttons in a container
function attachEmojiClickHandlers(
  container: HTMLElement,
  messageId: string
): void {
  container
    .querySelectorAll(".github-chat-emoji-picker-emoji")
    .forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation()
        const emoji = (btn as HTMLElement).dataset.emoji
        if (
          !emoji ||
          !currentConversationId ||
          !currentUserId ||
          !currentUsername
        )
          return

        // Save to recent
        saveRecentEmoji(emoji)

        // Close picker
        closeEmojiPicker()

        // Check if user already reacted with this emoji
        const messageEl = document.querySelector(
          `.github-chat-message[data-message-id="${messageId}"]`
        )
        const existingReaction = messageEl?.querySelector(
          `.github-chat-reaction[data-emoji="${emoji}"][data-user-reacted="true"]`
        )

        // Apply reaction
        await handleReactionOptimistic(
          currentConversationId,
          messageId,
          emoji,
          !existingReaction,
          currentUserId,
          currentUsername
        )
      })
    })
}

// Setup all event handlers for the emoji picker
function setupEmojiPickerHandlers(
  picker: HTMLElement,
  messageId: string
): void {
  const searchInput = picker.querySelector(
    ".github-chat-emoji-picker-search"
  ) as HTMLInputElement
  const content = picker.querySelector(
    ".github-chat-emoji-picker-content"
  ) as HTMLElement
  const categoryBtns = picker.querySelectorAll(
    ".github-chat-emoji-category-btn"
  )

  // Close button
  picker
    .querySelector(".github-chat-emoji-picker-close")
    ?.addEventListener("click", (e) => {
      e.stopPropagation()
      closeEmojiPicker()
    })

  // Search handler
  let searchTimeout: ReturnType<typeof setTimeout> | null = null
  searchInput?.addEventListener("input", () => {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      const query = searchInput.value.trim()
      if (query) {
        // Search mode
        const results = searchEmojis(query)
        content.innerHTML = `
          <div class="github-chat-emoji-picker-section">
            <div class="github-chat-emoji-picker-section-title">Search Results</div>
            ${renderEmojiGrid(results, messageId)}
          </div>
        `
        // Remove active state from category buttons
        categoryBtns.forEach((btn) => btn.classList.remove("active"))
      } else {
        // Back to category view - show recent or smileys
        const recentEmojis = getRecentEmojis()
        const showCategory = recentEmojis.length > 0 ? "recent" : "smileys"
        const emojis =
          showCategory === "recent"
            ? recentEmojis
            : EMOJI_CATEGORIES.find((c) => c.id === "smileys")?.emojis || []
        const title =
          showCategory === "recent" ? "Recently Used" : "Smileys & Emotion"

        content.innerHTML = `
          <div class="github-chat-emoji-picker-section">
            <div class="github-chat-emoji-picker-section-title">${title}</div>
            ${renderEmojiGrid(emojis, messageId)}
          </div>
        `

        // Update active category button
        categoryBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            (btn as HTMLElement).dataset.category === showCategory
          )
        })
      }

      // Re-attach click handlers for new emoji buttons
      attachEmojiClickHandlers(content, messageId)
    }, 150)
  })

  // Category button handlers
  categoryBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation()
      const categoryId = (btn as HTMLElement).dataset.category
      if (!categoryId) return

      // Clear search
      searchInput.value = ""

      // Update active state
      categoryBtns.forEach((b) => b.classList.remove("active"))
      btn.classList.add("active")

      // Get emojis for this category
      let emojis: string[] = []
      let title = ""

      if (categoryId === "recent") {
        emojis = getRecentEmojis()
        title = "Recently Used"
      } else {
        const category = EMOJI_CATEGORIES.find((c) => c.id === categoryId)
        if (category) {
          emojis = category.emojis
          title = category.name
        }
      }

      content.innerHTML = `
        <div class="github-chat-emoji-picker-section">
          <div class="github-chat-emoji-picker-section-title">${title}</div>
          ${renderEmojiGrid(emojis, messageId)}
        </div>
      `

      // Re-attach click handlers
      attachEmojiClickHandlers(content, messageId)
    })
  })

  // Initial emoji click handlers
  attachEmojiClickHandlers(content, messageId)
}

// Create and show the full emoji picker
export function showFullEmojiPicker(
  anchorEl: HTMLElement,
  messageId: string
): void {
  // Close any existing picker or popover
  closeEmojiPopover()
  closeEmojiPicker()

  currentPickerMessageId = messageId

  const picker = document.createElement("div")
  picker.className = "github-chat-emoji-picker"

  // Build category tabs
  const categoryTabs = EMOJI_CATEGORIES.filter(
    (c) => c.id !== "recent" || getRecentEmojis().length > 0
  )
    .map(
      (cat, idx) =>
        `<button class="github-chat-emoji-category-btn ${idx === 0 ? "active" : ""}" data-category="${cat.id}" title="${cat.name}">${cat.icon}</button>`
    )
    .join("")

  // Build initial content (recent or first category)
  const recentEmojis = getRecentEmojis()
  const initialCategory = recentEmojis.length > 0 ? "recent" : "smileys"
  const initialEmojis =
    initialCategory === "recent"
      ? recentEmojis
      : EMOJI_CATEGORIES.find((c) => c.id === "smileys")?.emojis || []

  picker.innerHTML = `
    <button class="github-chat-emoji-picker-close" title="Close">
      <svg viewBox="0 0 16 16" width="12" height="12">
        <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
      </svg>
    </button>
    <div class="github-chat-emoji-picker-header">
      <input type="text" class="github-chat-emoji-picker-search" placeholder="Search emojis..." />
    </div>
    <div class="github-chat-emoji-picker-categories">
      ${categoryTabs}
    </div>
    <div class="github-chat-emoji-picker-content">
      <div class="github-chat-emoji-picker-section">
        <div class="github-chat-emoji-picker-section-title">${initialCategory === "recent" ? "Recently Used" : "Smileys & Emotion"}</div>
        ${renderEmojiGrid(initialEmojis, messageId)}
      </div>
    </div>
  `

  // Append to chat drawer instead of body, so it stays within the drawer
  if (!chatDrawer) {
    console.error("Chat drawer not found")
    return
  }

  // Position the picker within the chat drawer
  // Use absolute positioning relative to the drawer
  picker.style.position = "absolute"
  picker.style.top = "50px" // Below the header
  picker.style.left = "50%"
  picker.style.transform = "translateX(-50%)"

  chatDrawer.appendChild(picker)
  currentEmojiPicker = picker

  // Focus search input
  const searchInput = picker.querySelector(
    ".github-chat-emoji-picker-search"
  ) as HTMLInputElement
  searchInput?.focus()

  // Setup event handlers
  setupEmojiPickerHandlers(picker, messageId)

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    document.addEventListener("click", handlePickerOutsideClick)
  }, 0)
}
