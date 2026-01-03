import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/auth/success")({
  component: AuthSuccessPage,
});

// Extension ID - will need to be updated after loading extension
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || "";

// Chrome extension API types
declare const chrome:
  | {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback: (response: { success?: boolean }) => void,
        ) => void;
        lastError?: { message: string };
      };
    }
  | undefined;

function AuthSuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("No authentication token received");
      return;
    }

    // Store token in localStorage as backup
    localStorage.setItem("github-chat-token", token);

    // Try to send message to extension via chrome.runtime.sendMessage
    const chromeRuntime =
      typeof chrome !== "undefined" ? chrome?.runtime : undefined;
    if (EXTENSION_ID && chromeRuntime?.sendMessage) {
      chromeRuntime.sendMessage(
        EXTENSION_ID,
        { type: "AUTH_SUCCESS", token },
        (response) => {
          if (chromeRuntime.lastError) {
            console.log(
              "Could not send to extension:",
              chromeRuntime.lastError.message,
            );
            setStatus("success");
            setMessage(
              "Signed in! If the extension doesn't detect this, please reload the GitHub page.",
            );
          } else if (response?.success) {
            console.log("Token sent to extension successfully");
            setStatus("success");
            setMessage("You have been signed in successfully!");
          } else {
            setStatus("success");
            setMessage("Signed in! Please reload the GitHub page.");
          }
        },
      );
    } else {
      console.log(
        "Extension messaging not available, Extension ID:",
        EXTENSION_ID,
      );
      setStatus("success");
      setMessage("Signed in! Please reload the GitHub page to start chatting.");
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1117] text-white">
      <div className="max-w-md w-full mx-auto p-8 text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-[#238636] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Completing sign in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-[#238636] rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Signed In!</h1>
            <p className="text-gray-400 mb-4">{message}</p>
            <p className="text-gray-500 text-sm">
              You can close this window and return to GitHub.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-red-600 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Sign In Failed</h1>
            <p className="text-gray-400 mb-4">{message}</p>
            <a
              href="/login"
              className="inline-block px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors"
            >
              Try Again
            </a>
          </>
        )}
      </div>
    </div>
  );
}
