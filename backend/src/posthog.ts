import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY!;
const POSTHOG_HOST = "https://us.i.posthog.com";

// Initialize PostHog client
const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
});

// User properties type
interface UserProperties {
  username?: string;
  display_name?: string;
  github_id?: number;
  email?: string;
  avatar_url?: string;
}

// Track user signup (new user)
export function trackUserSignup(
  userId: string,
  properties: UserProperties & { login_type?: string },
) {
  posthog.capture({
    distinctId: userId,
    event: "user_signed_up",
    properties: {
      login_type: properties.login_type || "github",
      $set: {
        username: properties.username,
        display_name: properties.display_name,
        github_id: properties.github_id,
        email: properties.email,
        avatar_url: properties.avatar_url,
      },
      $set_once: {
        initial_signup_date: new Date().toISOString(),
      },
    },
  });
}

// Track user login (returning user)
export function trackUserLogin(userId: string, properties: UserProperties) {
  posthog.capture({
    distinctId: userId,
    event: "user_login",
    properties: {
      $set: {
        username: properties.username,
        display_name: properties.display_name,
        github_id: properties.github_id,
        email: properties.email,
        avatar_url: properties.avatar_url,
        last_login_at: new Date().toISOString(),
      },
    },
  });
}

// Track message sent
export function trackMessageSent(
  userId: string,
  properties: {
    conversation_id: string;
    has_reply?: boolean;
    message_length?: number;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "message_sent",
    properties: {
      conversation_id: properties.conversation_id,
      has_reply: properties.has_reply || false,
      message_length: properties.message_length,
    },
  });
}

// Track conversation started (new conversation created)
export function trackConversationStarted(
  userId: string,
  properties: {
    conversation_id: string;
    with_user_id: string;
    with_username: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "conversation_started",
    properties: {
      conversation_id: properties.conversation_id,
      with_user_id: properties.with_user_id,
      with_username: properties.with_username,
    },
  });
}

// Track reaction added
export function trackReactionAdded(
  userId: string,
  properties: {
    conversation_id: string;
    message_id: string;
    emoji: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "reaction_added",
    properties: {
      conversation_id: properties.conversation_id,
      message_id: properties.message_id,
      emoji: properties.emoji,
    },
  });
}

// Track reaction removed
export function trackReactionRemoved(
  userId: string,
  properties: {
    conversation_id: string;
    message_id: string;
    emoji: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "reaction_removed",
    properties: {
      conversation_id: properties.conversation_id,
      message_id: properties.message_id,
      emoji: properties.emoji,
    },
  });
}

// Track conversation pinned
export function trackConversationPinned(
  userId: string,
  properties: {
    conversation_id: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "conversation_pinned",
    properties: {
      conversation_id: properties.conversation_id,
    },
  });
}

// Track conversation unpinned
export function trackConversationUnpinned(
  userId: string,
  properties: {
    conversation_id: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "conversation_unpinned",
    properties: {
      conversation_id: properties.conversation_id,
    },
  });
}

// Track user blocked
export function trackUserBlocked(
  userId: string,
  properties: {
    blocked_user_id: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "user_blocked",
    properties: {
      blocked_user_id: properties.blocked_user_id,
    },
  });
}

// Track user unblocked
export function trackUserUnblocked(
  userId: string,
  properties: {
    unblocked_user_id: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "user_unblocked",
    properties: {
      unblocked_user_id: properties.unblocked_user_id,
    },
  });
}

// Track message edited
export function trackMessageEdited(
  userId: string,
  properties: {
    conversation_id: string;
    message_id: string;
    new_message_length?: number;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "message_edited",
    properties: {
      conversation_id: properties.conversation_id,
      message_id: properties.message_id,
      new_message_length: properties.new_message_length,
    },
  });
}

// Track message deleted
export function trackMessageDeleted(
  userId: string,
  properties: {
    conversation_id: string;
    message_id: string;
  },
) {
  posthog.capture({
    distinctId: userId,
    event: "message_deleted",
    properties: {
      conversation_id: properties.conversation_id,
      message_id: properties.message_id,
    },
  });
}

// Shutdown PostHog client (call on process exit)
export async function shutdownPostHog() {
  await posthog.shutdown();
}

export default posthog;
