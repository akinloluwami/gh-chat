import { getCurrentUser } from "~lib/api"
import { getToken, removeToken, setToken } from "~lib/auth"

export {}

const FRONTEND_URL =
  process.env.PLASMO_PUBLIC_FRONTEND_URL || "http://localhost:5173"
const LOGIN_PATH = "/extension/login"

// Open login page on extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: `${FRONTEND_URL}${LOGIN_PATH}` })
  }
})

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "AUTH_SUCCESS" && message.token) {
    setToken(message.token).then(() => {
      console.log("Auth token stored successfully")
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "CHECK_AUTH") {
    getToken().then((token) => {
      sendResponse({ isAuthenticated: !!token })
    })
    return true
  }

  if (message.type === "GET_USER") {
    getCurrentUser().then((user) => {
      sendResponse({ user })
    })
    return true
  }

  if (message.type === "LOGOUT") {
    removeToken().then(() => {
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "OPEN_LOGIN") {
    chrome.tabs.create({ url: `${FRONTEND_URL}${LOGIN_PATH}` })
    sendResponse({ success: true })
    return true
  }
})

// Listen for external messages (from the frontend)
chrome.runtime.onMessageExternal?.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === "AUTH_SUCCESS" && message.token) {
      setToken(message.token).then(() => {
        console.log("Auth token stored from external source")
        sendResponse({ success: true })
      })
      return true
    }
  }
)

console.log("GH Chat background script loaded")
