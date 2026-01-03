import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Home
        </a>

        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

        <p className="text-gray-400 mb-8">Last updated: January 4, 2026</p>

        <div className="space-y-8 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Introduction
            </h2>
            <p>
              GH Chat ("we", "our", or "us") is committed to protecting your
              privacy. This Privacy Policy explains how we collect, use, and
              safeguard your information when you use our Chrome extension and
              related services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Information We Collect
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>GitHub Account Information:</strong> When you sign in,
                we receive your GitHub username, display name, and avatar URL
                through GitHub OAuth.
              </li>
              <li>
                <strong>Messages:</strong> We store messages you send and
                receive through the platform to enable the chat functionality.
              </li>
              <li>
                <strong>Usage Data:</strong> We may collect anonymous usage
                statistics to improve our service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To provide and maintain the chat service</li>
              <li>To authenticate your identity via GitHub</li>
              <li>To deliver messages to other users</li>
              <li>To show read receipts and typing indicators</li>
              <li>To improve our service and user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Data Storage & Security
            </h2>
            <p>
              Your data is stored securely on our servers. We use
              industry-standard security measures to protect your information.
              Messages are stored to enable chat history and are not end-to-end
              encrypted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Third-Party Services
            </h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>
                <strong>GitHub OAuth:</strong> For authentication
              </li>
              <li>
                <strong>PostHog:</strong> For anonymous analytics
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Access your personal data</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of analytics tracking</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Data Retention
            </h2>
            <p>
              We retain your data for as long as your account is active. If you
              request account deletion, we will remove your data within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please
              contact us at{" "}
              <a
                href="mailto:privacy@ghchat.social"
                className="text-[#238636] hover:underline"
              >
                privacy@ghchat.social
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
