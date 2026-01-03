import { useEffect, useState } from "react"

interface User {
  id: number
  github_id: number
  username: string
  display_name: string
  avatar_url: string
}

const styles = {
  container: {
    width: 320,
    padding: 16,
    background: "#0d1117",
    color: "#f0f6fc",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    margin: -8,
    marginRight: -9
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: "1px solid #3d444d"
  },
  logo: {
    width: 32,
    height: 32,
    fill: "#238636"
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0
  },
  loading: {
    textAlign: "center" as const,
    padding: 32,
    color: "#9198a1"
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    background: "#161b22",
    borderRadius: 8,
    marginBottom: 16
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: "50%"
  },
  userDetails: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 2
  },
  displayName: {
    fontWeight: 600,
    fontSize: 14
  },
  username: {
    fontSize: 12,
    color: "#9198a1"
  },
  loginPrompt: {
    textAlign: "center" as const,
    padding: "16px 0"
  },
  promptText: {
    fontSize: 14,
    color: "#9198a1",
    marginBottom: 16,
    lineHeight: 1.5
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 6,
    border: "none",
    cursor: "pointer"
  },
  btnPrimary: {
    background: "#238636",
    color: "#fff"
  },
  btnSecondary: {
    background: "transparent",
    color: "#f0f6fc",
    border: "1px solid #3d444d",
    padding: "6px 12px",
    fontSize: 12
  },
  githubIcon: {
    width: 18,
    height: 18
  },
  footer: {
    textAlign: "center" as const,
    paddingTop: 16,
    borderTop: "1px solid #3d444d"
  },
  footerText: {
    fontSize: 12,
    color: "#6e7681"
  }
}

function IndexPopup() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasToken, setHasToken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // First check if we have a token at all
    chrome.runtime.sendMessage({ type: "CHECK_AUTH" }, (authResponse) => {
      if (chrome.runtime.lastError) {
        console.error("CHECK_AUTH error:", chrome.runtime.lastError)
        setError("Failed to check auth: " + chrome.runtime.lastError.message)
        setLoading(false)
        return
      }

      console.log("CHECK_AUTH response:", authResponse)
      const isAuthenticated = authResponse?.isAuthenticated || false
      setHasToken(isAuthenticated)

      if (isAuthenticated) {
        // If we have a token, try to get user details
        chrome.runtime.sendMessage({ type: "GET_USER" }, (userResponse) => {
          if (chrome.runtime.lastError) {
            console.error("GET_USER error:", chrome.runtime.lastError)
          }
          console.log("GET_USER response:", userResponse)
          setUser(userResponse?.user || null)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })
  }, [])

  const handleLogin = () => {
    chrome.runtime.sendMessage({ type: "OPEN_LOGIN" })
    window.close()
  }

  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: "LOGOUT" }, () => {
      setUser(null)
      setHasToken(false)
    })
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <svg
            viewBox="0 0 16 16"
            style={styles.logo}
            xmlns="http://www.w3.org/2000/svg">
            <path
              fillRule="evenodd"
              d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"
            />
          </svg>
          <h1 style={styles.title}>GH Chat</h1>
        </div>
        <div style={{ ...styles.loginPrompt, color: "#f85149" }}>
          <p style={{ fontSize: 12, marginBottom: 8 }}>Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ ...styles.btn, ...styles.btnSecondary }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20 40C31.046 40 40 31.046 40 20C40 8.954 31.046 0 20 0C8.954 0 0 8.954 0 20C0 23.2 0.752 26.224 2.086 28.906C2.442 29.618 2.56 30.432 2.354 31.202L1.164 35.654C1.04614 36.0946 1.04625 36.5584 1.16431 36.9989C1.28237 37.4395 1.51424 37.8412 1.83663 38.1638C2.15902 38.4864 2.5606 38.7185 3.00105 38.8368C3.44151 38.9552 3.90534 38.9556 4.346 38.838L8.798 37.646C9.57076 37.4507 10.3883 37.5454 11.096 37.912C13.8619 39.2891 16.9102 40.0039 20 40Z"
            fill="#238636"
          />
          <path
            d="M19.9797 5.60406C11.7679 5.60406 5.11675 12.2042 5.11675 20.3447C5.11675 26.8588 9.37498 32.3829 15.2793 34.3298C16.0224 34.4686 16.2949 34.0129 16.2949 33.6211C16.2949 33.271 16.2825 32.3435 16.2763 31.1152C12.142 32.0045 11.27 29.1375 11.27 29.1375C10.5937 27.4361 9.61651 26.9816 9.61651 26.9816C8.27017 26.0677 9.72055 26.0862 9.72055 26.0862C11.213 26.1893 11.9971 27.6044 11.9971 27.6044C13.3223 29.8585 15.4762 29.2075 16.3259 28.8304C16.4597 27.8771 16.8424 27.2273 17.2672 26.8588C13.9664 26.4903 10.4971 25.2226 10.4971 19.5745C10.4971 17.9653 11.0731 16.6509 12.0268 15.6191C11.8596 15.2469 11.3579 13.7483 12.1568 11.7177C12.1568 11.7177 13.4016 11.3222 16.2441 13.2286C17.4332 12.9007 18.6965 12.7385 19.9599 12.7311C21.2232 12.7385 22.4866 12.9007 23.6756 13.2286C26.4996 11.3222 27.7443 11.7177 27.7443 11.7177C28.5432 13.7483 28.0416 15.2469 27.893 15.6191C28.8405 16.6509 29.4164 17.9653 29.4164 19.5745C29.4164 25.2373 25.9422 26.4841 22.6352 26.8465C23.1554 27.2887 23.6385 28.1928 23.6385 29.5735C23.6385 31.5463 23.6199 33.1309 23.6199 33.61C23.6199 33.9969 23.88 34.4576 24.6417 34.3102C30.5881 32.3767 34.8426 26.849 34.8426 20.3447C34.8426 12.2042 28.1878 5.60406 19.9797 5.60406Z"
            fill="#FFFEFE"
          />
        </svg>

        <h1 style={styles.title}>GH Chat</h1>
      </div>

      {user ? (
        <div style={styles.userInfo}>
          <img
            src={user.avatar_url}
            alt={user.display_name}
            style={styles.avatar}
          />
          <div style={styles.userDetails}>
            <span style={styles.displayName}>{user.display_name}</span>
            <span style={styles.username}>@{user.username}</span>
          </div>
          <button
            onClick={handleLogout}
            style={{ ...styles.btn, ...styles.btnSecondary }}>
            Sign Out
          </button>
        </div>
      ) : hasToken ? (
        <div style={styles.userInfo}>
          <div
            style={{
              ...styles.avatar,
              background: "#238636",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
            <svg
              viewBox="0 0 16 16"
              style={{ width: 20, height: 20, fill: "#fff" }}>
              <path
                fillRule="evenodd"
                d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"
              />
            </svg>
          </div>
          <div style={styles.userDetails}>
            <span style={styles.displayName}>Signed In</span>
            <span style={styles.username}>Ready to chat</span>
          </div>
          <button
            onClick={handleLogout}
            style={{ ...styles.btn, ...styles.btnSecondary }}>
            Sign Out
          </button>
        </div>
      ) : (
        <div style={styles.loginPrompt}>
          <p style={styles.promptText}>
            Sign in with your GitHub account to start chatting with developers.
          </p>
          <button
            onClick={handleLogin}
            style={{ ...styles.btn, ...styles.btnPrimary }}>
            <svg
              style={styles.githubIcon}
              fill="currentColor"
              viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </div>
      )}

      <div style={styles.footer}>
        <span style={styles.footerText}>
          Visit a GitHub profile to start chatting
        </span>
      </div>
    </div>
  )
}

export default IndexPopup
