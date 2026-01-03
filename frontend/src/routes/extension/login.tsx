import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/extension/login")({
  component: ExtensionLoginPage,
});

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8585";

function ExtensionLoginPage() {
  const handleGitHubLogin = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${BACKEND_URL}/auth/github`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1117] text-white">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-6 bg-[#238636] rounded-full flex items-center justify-center">
            <svg
              viewBox="0 0 16 16"
              className="w-10 h-10 fill-white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-3">Welcome to GH Chat</h1>
          <p className="text-gray-400 text-lg">
            Chat with developers directly from their GitHub profiles
          </p>
        </div>

        <div className="bg-[#161b22] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Get started in seconds</h2>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 bg-[#238636] rounded-full flex items-center justify-center text-sm font-medium">
                1
              </span>
              <span>Sign in with your GitHub account</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 bg-[#238636] rounded-full flex items-center justify-center text-sm font-medium">
                2
              </span>
              <span>Visit any GitHub profile</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 bg-[#238636] rounded-full flex items-center justify-center text-sm font-medium">
                3
              </span>
              <span>Click the Chat button to start a conversation</span>
            </li>
          </ul>
        </div>

        <button
          onClick={handleGitHubLogin}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors text-lg"
        >
          <svg
            className="w-6 h-6"
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
