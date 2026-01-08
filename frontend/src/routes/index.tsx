import { createFileRoute } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const posthog = usePostHog();

  const handleInstallClick = () => {
    posthog.capture("extension_install_clicked");
  };

  const handleStarClick = () => {
    posthog.capture("landing_star_github_clicked");
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <img src="/logo.png" alt="" className="w-40 mb-5" />

        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
          GH Chat
        </h1>

        <p className="text-lg md:text-xl text-gray-400 text-center max-w-md mb-8">
          Real-time messaging for GitHub users. Chat with anyone, right from
          their profile.
        </p>

        <div className="flex gap-4">
          <a
            href="https://chromewebstore.google.com/detail/lpccimcjmaaenlgckbafegoiekccejnj?utm_source=gh_chat_landing_page"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-sm transition-colors text-lg"
            target="_blank"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 fill-white"
            >
              <title>Google Chrome</title>
              <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
            </svg>
            Chrome Extension
          </a>

          <a
            href="https://github.com/akinloluwami/gh-chat"
            onClick={handleStarClick}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#21262d] hover:bg-[#30363d] text-white font-semibold rounded-sm transition-colors text-lg"
            target="_blank"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Star on GitHub
          </a>

        </div>


        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl">
          <div className="text-center">
            <div className="w-12 h-12 bg-[#161b22] border border-[#3d444d] rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-[#238636]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Real-time</h3>
            <p className="text-sm text-gray-500">
              Instant messaging with typing indicators
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-[#161b22] border border-[#3d444d] rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-[#238636]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Read Receipts</h3>
            <p className="text-sm text-gray-500">
              Know when your messages are seen
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-[#161b22] border border-[#3d444d] rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-[#238636]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Secure</h3>
            <p className="text-sm text-gray-500">
              GitHub OAuth, no extra passwords
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
