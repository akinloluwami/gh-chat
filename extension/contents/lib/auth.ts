// Authentication utilities

// Check if user is authenticated
export async function checkAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CHECK_AUTH" }, (response) => {
      resolve(response?.isAuthenticated || false)
    })
  })
}

// Get current user info
export async function getCurrentUserInfo(): Promise<{
  id: number
  username: string
} | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_USER" }, (response) => {
      if (response?.user) {
        resolve({ id: response.user.id, username: response.user.username })
      } else {
        resolve(null)
      }
    })
  })
}

// Open login page
export function openLogin(): void {
  chrome.runtime.sendMessage({ type: "OPEN_LOGIN" })
}
