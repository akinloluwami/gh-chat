// Profile page chat button

import { checkAuth, getCurrentUserInfo, openLogin } from "../auth"
import {
  getProfileAvatar,
  getProfileDisplayName,
  getProfileUsername
} from "../profile"
import { getNavigationCallbacks } from "../state"

// Handle chat button click
export async function handleChatClick(): Promise<void> {
  const isAuth = await checkAuth()
  if (!isAuth) {
    openLogin()
    return
  }

  const username = getProfileUsername()
  const displayName = getProfileDisplayName()
  const avatar = getProfileAvatar()

  if (username) {
    const nav = getNavigationCallbacks()
    nav?.openChatDrawer(username, displayName, avatar)
  }
}

// Create the profile chat button
export function createChatButton(): HTMLButtonElement {
  const button = document.createElement("button")
  button.className = "github-chat-btn-profile btn btn-block"
  button.type = "button"
  button.innerHTML = `
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" class="octicon">
      <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
    </svg>
    <span>Chat</span>
  `
  button.addEventListener("click", handleChatClick)
  return button
}

// Inject profile chat button
export async function injectChatButton(): Promise<void> {
  const existingBtn = document.querySelector(".github-chat-btn-profile")
  if (existingBtn) existingBtn.remove()
  const existingWrapper = document.querySelector(".github-chat-btn-wrapper")
  if (existingWrapper) existingWrapper.remove()

  // Don't show chat button on own profile
  const profileUsername = getProfileUsername()
  const currentUser = await getCurrentUserInfo()
  if (
    profileUsername &&
    currentUser &&
    profileUsername.toLowerCase() === currentUser.username.toLowerCase()
  ) {
    return
  }

  const followForm =
    document.querySelector('form[action*="/follow"]') ||
    document.querySelector('[data-target="follow.form"]')
  const sponsorLink = document.querySelector('a[href*="/sponsors/"]')

  let buttonRow: Element | null = null
  if (followForm) {
    buttonRow =
      followForm.closest(".d-flex") ||
      followForm.closest('[class*="flex"]') ||
      followForm.parentElement
  } else if (sponsorLink) {
    buttonRow = sponsorLink.closest(".d-flex") || sponsorLink.parentElement
  }

  if (buttonRow) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "-4px"
    wrapper.style.marginBottom = "8px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    buttonRow.insertAdjacentElement("afterend", wrapper)
    return
  }

  const vcardNames = document.querySelector(".vcard-names")
  if (vcardNames) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "16px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    vcardNames.insertAdjacentElement("afterend", wrapper)
    return
  }

  const vcard =
    document.querySelector(".h-card") ||
    document.querySelector('[itemtype="http://schema.org/Person"]')
  if (vcard) {
    const wrapper = document.createElement("div")
    wrapper.className = "github-chat-btn-wrapper"
    wrapper.style.width = "100%"
    wrapper.style.marginTop = "8px"

    const chatBtn = createChatButton()
    wrapper.appendChild(chatBtn)
    vcard.appendChild(wrapper)
  }
}
