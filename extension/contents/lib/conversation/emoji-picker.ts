// Full emoji picker with categories and search

import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  saveRecentEmoji,
  searchEmojis
} from "../emoji-data"
import {
  getChatContainer,
  getCurrentConversationId,
  getCurrentUserId,
  getCurrentUsername
} from "../state"
import { closeEmojiPopover } from "./emoji-popover"
import { handleReactionOptimistic } from "./reactions"

// Picker mode types
export type EmojiPickerMode = "reaction" | "insert"
export type EmojiSelectCallback = (emoji: string) => void

// Full emoji picker state
let currentEmojiPicker: HTMLElement | null = null
let currentPickerMessageId: string | null = null
let currentPickerMode: EmojiPickerMode = "reaction"
let currentOnSelectCallback: EmojiSelectCallback | null = null

// Close the full emoji picker
export function closeEmojiPicker(): void {
  if (currentEmojiPicker) {
    currentEmojiPicker.remove()
    currentEmojiPicker = null
    currentPickerMessageId = null
    currentPickerMode = "reaction"
    currentOnSelectCallback = null
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
function renderEmojiGrid(emojis: string[]): string {
  if (emojis.length === 0) {
    return `<div class="github-chat-emoji-picker-empty">No emojis found</div>`
  }

  const buttons = emojis
    .map(
      (emoji) =>
        `<button class="github-chat-emoji-picker-emoji" data-emoji="${emoji}">${emoji}</button>`
    )
    .join("")

  return `<div class="github-chat-emoji-picker-grid">${buttons}</div>`
}

// Attach click handlers to emoji buttons in a container
function attachEmojiClickHandlers(container: HTMLElement): void {
  container
    .querySelectorAll(".github-chat-emoji-picker-emoji")
    .forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation()
        const emoji = (btn as HTMLElement).dataset.emoji
        if (!emoji) return

        // Save to recent
        saveRecentEmoji(emoji)

        // Capture state before closing (closeEmojiPicker resets these)
        const mode = currentPickerMode
        const messageId = currentPickerMessageId
        const onSelectCallback = currentOnSelectCallback

        // Close picker
        closeEmojiPicker()

        // Handle based on mode
        if (mode === "insert" && onSelectCallback) {
          // Insert mode - call the callback with the emoji
          onSelectCallback(emoji)
        } else if (mode === "reaction" && messageId) {
          // Reaction mode - apply reaction to message
          const conversationId = getCurrentConversationId()
          const userId = getCurrentUserId()
          const username = getCurrentUsername()

          if (!conversationId || !userId || !username) return

          const messageEl = document.querySelector(
            `.github-chat-message[data-message-id="${messageId}"]`
          )
          const existingReaction = messageEl?.querySelector(
            `.github-chat-reaction[data-emoji="${emoji}"][data-user-reacted="true"]`
          )

          await handleReactionOptimistic(
            conversationId,
            messageId,
            emoji,
            !existingReaction,
            userId,
            username
          )
        }
      })
    })
}

// Setup all event handlers for the emoji picker
function setupEmojiPickerHandlers(picker: HTMLElement): void {
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
            ${renderEmojiGrid(results)}
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
            ${renderEmojiGrid(emojis)}
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
      attachEmojiClickHandlers(content)
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
          ${renderEmojiGrid(emojis)}
        </div>
      `

      // Re-attach click handlers
      attachEmojiClickHandlers(content)
    })
  })

  // Initial emoji click handlers
  attachEmojiClickHandlers(content)
}

// Create the emoji picker HTML element
function createEmojiPickerElement(): HTMLElement {
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
        ${renderEmojiGrid(initialEmojis)}
      </div>
    </div>
  `

  return picker
}

// Show emoji picker for adding reactions to a message
export function showFullEmojiPicker(
  anchorEl: HTMLElement,
  messageId: string
): void {
  // Close any existing picker or popover
  closeEmojiPopover()
  closeEmojiPicker()

  // Set state for reaction mode
  currentPickerMode = "reaction"
  currentPickerMessageId = messageId
  currentOnSelectCallback = null

  const picker = createEmojiPickerElement()

  // Append to chat container (drawer or expanded view)
  const container = getChatContainer()
  if (!container) {
    console.error("Chat container not found")
    return
  }

  // Position the picker within the chat container
  picker.style.position = "absolute"
  picker.style.top = "50px" // Below the header
  picker.style.left = "50%"
  picker.style.transform = "translateX(-50%)"

  container.appendChild(picker)
  currentEmojiPicker = picker

  // Focus search input
  const searchInput = picker.querySelector(
    ".github-chat-emoji-picker-search"
  ) as HTMLInputElement
  searchInput?.focus()

  // Setup event handlers
  setupEmojiPickerHandlers(picker)

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    document.addEventListener("click", handlePickerOutsideClick)
  }, 0)
}

// Show emoji picker for inserting emojis into input
export function showEmojiPickerForInsert(
  anchorEl: HTMLElement,
  onSelect: EmojiSelectCallback
): void {
  // Close any existing picker or popover
  closeEmojiPopover()
  closeEmojiPicker()

  // Set state for insert mode
  currentPickerMode = "insert"
  currentPickerMessageId = null
  currentOnSelectCallback = onSelect

  const picker = createEmojiPickerElement()

  // Append to chat container (drawer or expanded view)
  const container = getChatContainer()
  if (!container) {
    console.error("Chat container not found")
    return
  }

  // Position the picker above the input area (bottom of container)
  picker.style.position = "absolute"
  picker.style.bottom = "70px" // Above the input area
  picker.style.left = "50%"
  picker.style.transform = "translateX(-50%)"

  container.appendChild(picker)
  currentEmojiPicker = picker

  // Focus search input
  const searchInput = picker.querySelector(
    ".github-chat-emoji-picker-search"
  ) as HTMLInputElement
  searchInput?.focus()

  // Setup event handlers
  setupEmojiPickerHandlers(picker)

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    document.addEventListener("click", handlePickerOutsideClick)
  }, 0)
}
