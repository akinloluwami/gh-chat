import { Hono } from "hono";
import { sql } from "../db/index.js";
import { broadcastToConversation, broadcastToUser } from "../websocket.js";
import { isBlocked } from "./users.js";
import {
  trackMessageSent,
  trackConversationStarted,
  trackReactionAdded,
  trackReactionRemoved,
  trackConversationPinned,
  trackConversationUnpinned,
  trackMessageEdited,
  trackMessageDeleted,
} from "../posthog.js";

interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  github_id: number;
}

type Variables = {
  user: AuthUser;
};

const conversations = new Hono<{ Variables: Variables }>();

// Middleware to require authentication
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.split(" ")[1];

  const sessions = await sql`
    SELECT s.*, u.id as user_id, u.username, u.display_name, u.avatar_url, u.github_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND s.expires_at > NOW()
  `;

  if (sessions.length === 0) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("user", sessions[0]);
  await next();
}

// Apply auth middleware to all routes
conversations.use("/*", requireAuth);

// Get all conversations for the current user
conversations.get("/", async (c) => {
  const user = c.get("user");

  const results = await sql`
    SELECT 
      c.id,
      c.created_at,
      c.updated_at,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.id
        ELSE u1.id
      END as other_user_id,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.username
        ELSE u1.username
      END as other_username,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.display_name
        ELSE u1.display_name
      END as other_display_name,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.avatar_url
        ELSE u1.avatar_url
      END as other_avatar_url,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.has_account
        ELSE u1.has_account
      END as other_has_account,
      (
        SELECT content FROM messages 
        WHERE conversation_id = c.id 
        AND deleted_at IS NULL
        ORDER BY created_at DESC 
        LIMIT 1
      ) as last_message,
      (
        SELECT created_at FROM messages 
        WHERE conversation_id = c.id 
        AND deleted_at IS NULL
        ORDER BY created_at DESC 
        LIMIT 1
      ) as last_message_time,
      (
        SELECT COUNT(*)::integer FROM messages m
        WHERE m.conversation_id = c.id 
        AND m.sender_id != ${user.user_id}
        AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(
          (SELECT last_read_at FROM conversation_reads 
           WHERE user_id = ${user.user_id} AND conversation_id = c.id),
          '1970-01-01'::timestamp
        )
      ) as unread_count,
      (
        SELECT CASE 
          WHEN EXISTS (
            SELECT 1 FROM blocks 
            WHERE blocker_id = ${user.user_id} 
            AND blocked_id = CASE WHEN c.user1_id = ${user.user_id} THEN c.user2_id ELSE c.user1_id END
          ) THEN 'blocked_by_me'
          WHEN EXISTS (
            SELECT 1 FROM blocks 
            WHERE blocked_id = ${user.user_id} 
            AND blocker_id = CASE WHEN c.user1_id = ${user.user_id} THEN c.user2_id ELSE c.user1_id END
          ) THEN 'blocked_by_them'
          ELSE 'none'
        END
      ) as block_status,
      pc.pinned_at
    FROM conversations c
    JOIN users u1 ON c.user1_id = u1.id
    JOIN users u2 ON c.user2_id = u2.id
    LEFT JOIN pinned_conversations pc ON pc.user_id = ${user.user_id} AND pc.conversation_id = c.id
    WHERE c.user1_id = ${user.user_id} OR c.user2_id = ${user.user_id}
    ORDER BY 
      pc.pinned_at DESC NULLS LAST,
      c.updated_at DESC
  `;

  return c.json({ conversations: results });
});

// Get total unread count across all conversations
conversations.get("/unread-count", async (c) => {
  const user = c.get("user");

  const result = await sql`
    SELECT COALESCE(SUM(unread)::integer, 0) as total_unread
    FROM (
      SELECT COUNT(*) as unread
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.user1_id = ${user.user_id} OR c.user2_id = ${user.user_id})
        AND m.sender_id != ${user.user_id}
        AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(
          (SELECT last_read_at FROM conversation_reads 
           WHERE user_id = ${user.user_id} AND conversation_id = c.id),
          '1970-01-01'::timestamp
        )
    ) counts
  `;

  return c.json({ unread_count: result[0].total_unread });
});

// Get or create a conversation with a specific user by username
conversations.post("/with/:username", async (c) => {
  try {
    const user = c.get("user");
    const targetUsername = c.req.param("username");

    console.log(
      `[CONV] Starting conversation request for: ${targetUsername} by user: ${user.username}`,
    );

    if (targetUsername.toLowerCase() === user.username.toLowerCase()) {
      console.log(`[CONV] User tried to chat with themselves`);
      return c.json({ error: "Cannot start conversation with yourself" }, 400);
    }

    // Find the target user (case-insensitive)
    console.log(`[CONV] Looking up user in database: ${targetUsername}`);
    let targetUsers = await sql`
      SELECT id, username, display_name, avatar_url, has_account
      FROM users WHERE LOWER(username) = LOWER(${targetUsername})
    `;
    console.log(
      `[CONV] Database lookup result: ${targetUsers.length} users found`,
    );

    let targetUser = targetUsers[0];
    let userCreated = false;

    // If user doesn't exist, create a placeholder by fetching from GitHub API
    if (!targetUser) {
      console.log(
        `[CONV] User not in DB, fetching from GitHub API: ${targetUsername}`,
      );
      try {
        const headers: Record<string, string> = {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "GitHub-Chat-App",
        };

        // Use GitHub token if available for higher rate limits
        if (process.env.GITHUB_TOKEN) {
          headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const githubResponse = await fetch(
          `https://api.github.com/users/${targetUsername}`,
          { headers },
        );

        console.log(
          `[CONV] GitHub API response status: ${githubResponse.status}`,
        );

        if (!githubResponse.ok) {
          const errorText = await githubResponse.text();
          console.log(`[CONV] GitHub API error: ${errorText}`);

          if (githubResponse.status === 404) {
            return c.json({ error: "GitHub user not found" }, 404);
          } else if (githubResponse.status === 403) {
            return c.json(
              {
                error:
                  "GitHub API rate limit exceeded. Please try again later.",
              },
              429,
            );
          }
          return c.json({ error: "Failed to fetch GitHub user" }, 500);
        }

        const githubUser = (await githubResponse.json()) as {
          id: number;
          login: string;
          name: string | null;
          avatar_url: string;
        };

        // Check if user already exists by github_id (in case username changed)
        console.log(
          `[CONV] Checking if github_id ${githubUser.id} exists in DB`,
        );
        const existingByGithubId = await sql`
        SELECT id, username, display_name, avatar_url, has_account
        FROM users WHERE github_id = ${githubUser.id}
      `;
        console.log(
          `[CONV] Found ${existingByGithubId.length} users by github_id`,
        );

        if (existingByGithubId.length > 0) {
          console.log(`[CONV] User exists by github_id, updating if needed`);
          // Update username if it changed
          if (existingByGithubId[0].username !== githubUser.login) {
            await sql`
            UPDATE users SET username = ${githubUser.login}, display_name = ${
              githubUser.name || githubUser.login
            }, avatar_url = ${githubUser.avatar_url}
            WHERE github_id = ${githubUser.id}
          `;
            existingByGithubId[0].username = githubUser.login;
            existingByGithubId[0].display_name =
              githubUser.name || githubUser.login;
            existingByGithubId[0].avatar_url = githubUser.avatar_url;
          }
          targetUser = existingByGithubId[0];
        } else {
          // Create placeholder user with conflict handling
          console.log(`[CONV] Creating new user: ${githubUser.login}`);
          const newUsers = await sql`
          INSERT INTO users (github_id, username, display_name, avatar_url, has_account)
          VALUES (${githubUser.id}, ${githubUser.login}, ${
            githubUser.name || githubUser.login
          }, ${githubUser.avatar_url}, FALSE)
          ON CONFLICT (github_id) DO UPDATE SET
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url
          RETURNING id, username, display_name, avatar_url, has_account
        `;
          console.log(`[CONV] User created/updated: ${newUsers[0]?.id}`);
          targetUser = newUsers[0];
          userCreated = true;
        }
      } catch (error) {
        console.error("[CONV] Error fetching/creating GitHub user:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          { error: `Failed to start conversation: ${errorMessage}` },
          500,
        );
      }
    }

    console.log(
      `[CONV] Target user resolved: ${targetUser.id} (${targetUser.username})`,
    );

    // Check if either user has blocked the other
    const blockStatus = await isBlocked(user.user_id, targetUser.id);
    if (blockStatus.blocked) {
      console.log(`[CONV] Block detected between users`);
      return c.json({ error: "Cannot start conversation with this user" }, 403);
    }

    // Ensure consistent ordering (alphabetically lower UUID first)
    const user1Id = user.user_id < targetUser.id ? user.user_id : targetUser.id;
    const user2Id = user.user_id < targetUser.id ? targetUser.id : user.user_id;

    console.log(
      `[CONV] Looking for existing conversation between ${user1Id} and ${user2Id}`,
    );
    // Try to find existing conversation
    let convResults = await sql`
    SELECT id, created_at, updated_at
    FROM conversations
    WHERE user1_id = ${user1Id} AND user2_id = ${user2Id}
  `;
    console.log(`[CONV] Found ${convResults.length} existing conversations`);

    let conversation = convResults[0];
    let conversationCreated = false;

    // Create if doesn't exist
    if (!conversation) {
      console.log(`[CONV] Creating new conversation`);
      const newConvs = await sql`
      INSERT INTO conversations (user1_id, user2_id)
      VALUES (${user1Id}, ${user2Id})
      RETURNING id, created_at, updated_at
    `;
      conversation = newConvs[0];
      conversationCreated = true;
      console.log(`[CONV] New conversation created: ${conversation.id}`);

      // Track conversation started
      trackConversationStarted(user.user_id, {
        conversation_id: conversation.id,
        with_user_id: targetUser.id,
        with_username: targetUser.username,
      });
    }

    console.log(`[CONV] Success! Returning conversation ${conversation.id}`);
    return c.json({
      conversation: {
        id: conversation.id,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        other_user: {
          id: targetUser.id,
          username: targetUser.username,
          display_name: targetUser.display_name,
          avatar_url: targetUser.avatar_url,
          has_account: targetUser.has_account,
        },
      },
      created: conversationCreated,
      user_created: userCreated,
    });
  } catch (error) {
    console.error("[CONV] Unhandled error in POST /with/:username:", error);
    return c.json(
      { error: "Failed to start conversation. Please try again." },
      500,
    );
  }
});

// Get messages in a conversation
conversations.get("/:id/messages", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const limit = parseInt(c.req.query("limit") || "50");
  const before = c.req.query("before"); // message id for pagination

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id FROM conversations
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  let messages;
  if (before) {
    // Verify the "before" message exists
    const beforeMsg = await sql`
      SELECT id FROM messages WHERE id = ${before}::uuid
    `;
    if (beforeMsg.length === 0) {
      return c.json({ error: "Invalid before message ID" }, 400);
    }

    // Use subquery to avoid timezone issues when passing Date objects back to PostgreSQL
    // This handles messages with the same timestamp correctly using (created_at, id) tuple comparison
    messages = await sql`
      SELECT m.id, m.content, m.created_at, m.read_at, m.sender_id, m.reply_to_id, m.edited_at,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ${conversationId}::uuid 
        AND m.deleted_at IS NULL
        AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = ${before}::uuid)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${limit}
    `;
  } else {
    messages = await sql`
      SELECT m.id, m.content, m.created_at, m.read_at, m.sender_id, m.reply_to_id, m.edited_at,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ${conversationId}::uuid
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${limit}
    `;
  }

  // Fetch reactions for all messages
  const messageIds = messages.map((m: any) => m.id);
  let reactions: any[] = [];
  if (messageIds.length > 0) {
    reactions = await sql`
      SELECT mr.message_id, mr.emoji, mr.user_id, u.username
      FROM message_reactions mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = ANY(${messageIds}::uuid[])
      ORDER BY mr.created_at ASC
    `;
  }

  // Fetch reply_to data for messages that are replies
  const replyToIds = messages
    .filter((m: any) => m.reply_to_id)
    .map((m: any) => m.reply_to_id);
  let replyToMessages: any[] = [];
  if (replyToIds.length > 0) {
    replyToMessages = await sql`
      SELECT m.id, m.content, m.sender_id, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ANY(${replyToIds}::uuid[])
    `;
  }

  // Create lookup map for reply_to messages
  const replyToMap = new Map<string, any>();
  for (const r of replyToMessages) {
    replyToMap.set(r.id, {
      id: r.id,
      content: r.content,
      sender_id: r.sender_id,
      sender_username: r.sender_username,
    });
  }

  // Group reactions by message_id
  const reactionsByMessage = new Map<string, any[]>();
  for (const r of reactions) {
    const msgId = r.message_id;
    if (!reactionsByMessage.has(msgId)) {
      reactionsByMessage.set(msgId, []);
    }
    reactionsByMessage.get(msgId)!.push({
      emoji: r.emoji,
      user_id: r.user_id,
      username: r.username,
    });
  }

  // Attach reactions and reply_to to messages
  const messagesWithData = messages.map((m: any) => ({
    ...m,
    reactions: reactionsByMessage.get(m.id) || [],
    reply_to: m.reply_to_id ? replyToMap.get(m.reply_to_id) || null : null,
    edited_at: m.edited_at || null,
  }));

  // Check if there are more messages before the oldest one we fetched
  const hasMore = messages.length === limit;

  // Reverse to get chronological order
  return c.json({ messages: messagesWithData.reverse(), hasMore });
});

// Send a message
conversations.post("/:id/messages", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const body = await c.req.json();
  const content = body.content?.trim();
  const replyToId = body.reply_to_id || null;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (content.length > 5000) {
    return c.json({ error: "Message too long (max 5000 characters)" }, 400);
  }

  // Verify user is part of this conversation and get the other user
  const convCheck = await sql`
    SELECT id, user1_id, user2_id FROM conversations
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // If reply_to_id is provided, verify it exists in this conversation
  if (replyToId) {
    const replyCheck = await sql`
      SELECT id FROM messages 
      WHERE id = ${replyToId}::uuid AND conversation_id = ${conversationId}::uuid
    `;
    if (replyCheck.length === 0) {
      return c.json({ error: "Reply message not found" }, 400);
    }
  }

  const conversation = convCheck[0];
  const otherUserId =
    conversation.user1_id === user.user_id
      ? conversation.user2_id
      : conversation.user1_id;

  // Check if either user has blocked the other
  const blockStatus = await isBlocked(user.user_id, otherUserId);
  if (blockStatus.blocked) {
    return c.json({ error: "Cannot send message to this user" }, 403);
  }

  // Insert message with optional reply_to_id
  const newMessages = await sql`
    INSERT INTO messages (conversation_id, sender_id, content, reply_to_id)
    VALUES (${conversationId}::uuid, ${user.user_id}, ${content}, ${replyToId}::uuid)
    RETURNING id, content, created_at, sender_id, reply_to_id
  `;

  // Track message sent
  trackMessageSent(user.user_id, {
    conversation_id: conversationId,
    has_reply: !!replyToId,
    message_length: content.length,
  });

  // Update conversation updated_at
  await sql`
    UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}::uuid
  `;

  const message = newMessages[0];

  // If this is a reply, fetch the replied-to message content
  let replyTo = null;
  if (message.reply_to_id) {
    const replyToMsg = await sql`
      SELECT m.id, m.content, m.sender_id, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ${message.reply_to_id}::uuid
    `;
    if (replyToMsg.length > 0) {
      replyTo = {
        id: replyToMsg[0].id,
        content: replyToMsg[0].content,
        sender_id: replyToMsg[0].sender_id,
        sender_username: replyToMsg[0].sender_username,
      };
    }
  }

  const messageData = {
    id: message.id,
    content: message.content,
    created_at: message.created_at,
    sender_id: message.sender_id,
    sender_username: user.username,
    sender_display_name: user.display_name,
    sender_avatar: user.avatar_url,
    reply_to_id: message.reply_to_id,
    reply_to: replyTo,
  };

  // Broadcast to all WebSocket connections for this conversation
  broadcastToConversation(conversationId, {
    type: "new_message",
    conversationId: conversationId,
    message: messageData,
  });

  // Also send directly to the other user (in case they're on the list view, not in this conversation)
  if (otherUserId) {
    broadcastToUser(otherUserId, {
      type: "new_message",
      conversationId: conversationId,
      message: messageData,
    });
  }

  return c.json({ message: messageData });
});

// Edit a message (only within 1 hour of sending)
conversations.patch("/:id/messages/:messageId", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const body = await c.req.json();
  const content = body.content?.trim();

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (content.length > 5000) {
    return c.json({ error: "Message too long (max 5000 characters)" }, 400);
  }

  // Verify the message exists, belongs to this user, is in this conversation, and is within 1 hour
  const msgCheck = await sql`
    SELECT id, sender_id, created_at, deleted_at FROM messages
    WHERE id = ${messageId}::uuid 
    AND conversation_id = ${conversationId}::uuid
  `;

  if (msgCheck.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }

  const message = msgCheck[0];

  if (message.deleted_at) {
    return c.json({ error: "Message has been deleted" }, 400);
  }

  if (message.sender_id !== user.user_id) {
    return c.json({ error: "You can only edit your own messages" }, 403);
  }

  // Check if message is within 24 hours of creation
  const createdAt = new Date(message.created_at);
  const now = new Date();
  const hourInMs = 60 * 60 * 1000;
  const windowMs = 24 * hourInMs; // 24 hours
  if (now.getTime() - createdAt.getTime() > windowMs) {
    return c.json(
      { error: "Messages can only be edited within 24 hours of sending" },
      400,
    );
  }

  // Update the message
  const updated = await sql`
    UPDATE messages 
    SET content = ${content}, edited_at = NOW()
    WHERE id = ${messageId}::uuid
    RETURNING id, content, created_at, edited_at, sender_id
  `;

  const updatedMessage = updated[0];

  // Track message edited
  trackMessageEdited(user.user_id, {
    conversation_id: conversationId,
    message_id: messageId,
    new_message_length: content.length,
  });

  // Broadcast the edit to all users in the conversation
  broadcastToConversation(conversationId, {
    type: "message_edited",
    conversationId: conversationId,
    messageId: messageId,
    content: updatedMessage.content,
    edited_at: updatedMessage.edited_at,
  });

  return c.json({
    message: {
      id: updatedMessage.id,
      content: updatedMessage.content,
      created_at: updatedMessage.created_at,
      edited_at: updatedMessage.edited_at,
    },
  });
});

// Delete a message (soft delete)
conversations.delete("/:id/messages/:messageId", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const messageId = c.req.param("messageId");

  // Verify the message exists, belongs to this user, and is in this conversation
  const msgCheck = await sql`
    SELECT id, sender_id, deleted_at FROM messages
    WHERE id = ${messageId}::uuid 
    AND conversation_id = ${conversationId}::uuid
  `;

  if (msgCheck.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }

  const message = msgCheck[0];

  if (message.deleted_at) {
    return c.json({ error: "Message already deleted" }, 400);
  }

  if (message.sender_id !== user.user_id) {
    return c.json({ error: "You can only delete your own messages" }, 403);
  }

  // Soft delete the message
  await sql`
    UPDATE messages 
    SET deleted_at = NOW()
    WHERE id = ${messageId}::uuid
  `;

  // Track message deleted
  trackMessageDeleted(user.user_id, {
    conversation_id: conversationId,
    message_id: messageId,
  });

  // Broadcast the deletion to all users in the conversation
  broadcastToConversation(conversationId, {
    type: "message_deleted",
    conversationId: conversationId,
    messageId: messageId,
  });

  return c.json({ success: true });
});

// Mark conversation as read (update last_read_at timestamp)
conversations.post("/:id/read", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id FROM conversations
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Upsert the conversation_reads entry
  await sql`
    INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
    VALUES (${user.user_id}, ${conversationId}::uuid, NOW())
    ON CONFLICT (user_id, conversation_id) 
    DO UPDATE SET last_read_at = NOW()
  `;

  return c.json({ success: true });
});

// Add a reaction to a message
conversations.post("/:id/messages/:messageId/reactions", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const body = await c.req.json();
  const emoji = body.emoji?.trim();

  if (!emoji || typeof emoji !== "string") {
    return c.json({ error: "Emoji is required" }, 400);
  }

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id, user1_id, user2_id FROM conversations
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Verify message exists in this conversation
  const msgCheck = await sql`
    SELECT id FROM messages
    WHERE id = ${messageId}::uuid AND conversation_id = ${conversationId}::uuid
  `;

  if (msgCheck.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Insert reaction (upsert - ignore if already exists)
  try {
    await sql`
      INSERT INTO message_reactions (message_id, user_id, emoji)
      VALUES (${messageId}::uuid, ${user.user_id}, ${emoji})
      ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    `;

    // Track reaction added
    trackReactionAdded(user.user_id, {
      conversation_id: conversationId,
      message_id: messageId,
      emoji,
    });
  } catch (error) {
    console.error("Failed to add reaction:", error);
    return c.json({ error: "Failed to add reaction" }, 500);
  }

  const conversation = convCheck[0];
  const otherUserId =
    conversation.user1_id === user.user_id
      ? conversation.user2_id
      : conversation.user1_id;

  // Broadcast reaction to conversation participants
  const reactionData = {
    type: "reaction_added",
    conversationId,
    messageId,
    emoji,
    user_id: user.user_id,
    username: user.username,
  };

  // Send to conversation (for users actively viewing this conversation)
  broadcastToConversation(conversationId, reactionData);

  // Also send to both users directly (in case they're on the list view, not in this conversation)
  // Use the user's ID to ensure they get the update even if not in the conversation view
  broadcastToUser(user.user_id, reactionData);
  if (otherUserId && otherUserId !== user.user_id) {
    broadcastToUser(otherUserId, reactionData);
  }

  return c.json({ success: true, emoji, messageId });
});

// Remove a reaction from a message
conversations.delete("/:id/messages/:messageId/reactions/:emoji", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const emoji = decodeURIComponent(c.req.param("emoji"));

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id, user1_id, user2_id FROM conversations
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Delete the reaction
  const deleted = await sql`
    DELETE FROM message_reactions
    WHERE message_id = ${messageId}::uuid 
      AND user_id = ${user.user_id} 
      AND emoji = ${emoji}
    RETURNING id
  `;

  if (deleted.length === 0) {
    return c.json({ error: "Reaction not found" }, 404);
  }

  // Track reaction removed
  trackReactionRemoved(user.user_id, {
    conversation_id: conversationId,
    message_id: messageId,
    emoji,
  });

  const conversation = convCheck[0];
  const otherUserId =
    conversation.user1_id === user.user_id
      ? conversation.user2_id
      : conversation.user1_id;

  // Broadcast reaction removal to conversation participants
  const reactionData = {
    type: "reaction_removed",
    conversationId,
    messageId,
    emoji,
    user_id: user.user_id,
    username: user.username,
  };

  // Send to conversation (for users actively viewing this conversation)
  broadcastToConversation(conversationId, reactionData);

  // Also send to both users directly (in case they're on the list view, not in this conversation)
  broadcastToUser(user.user_id, reactionData);
  if (otherUserId && otherUserId !== user.user_id) {
    broadcastToUser(otherUserId, reactionData);
  }

  return c.json({ success: true, emoji, messageId });
});

// Maximum number of pinned conversations per user
const MAX_PINNED_CONVERSATIONS = 5;

// Pin a conversation
conversations.post("/:conversationId/pin", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");

  // Verify conversation exists and user is a participant
  const convCheck = await sql`
    SELECT id FROM conversations 
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Check if already pinned (don't count against limit)
  const alreadyPinned = await sql`
    SELECT 1 FROM pinned_conversations 
    WHERE user_id = ${user.user_id} AND conversation_id = ${conversationId}::uuid
  `;

  if (alreadyPinned.length > 0) {
    return c.json({ success: true, pinned: true });
  }

  // Check pin limit
  const pinnedCount = await sql`
    SELECT COUNT(*)::int as count FROM pinned_conversations 
    WHERE user_id = ${user.user_id}
  `;

  if (pinnedCount[0].count >= MAX_PINNED_CONVERSATIONS) {
    return c.json(
      {
        error: `You can only pin up to ${MAX_PINNED_CONVERSATIONS} conversations`,
      },
      400,
    );
  }

  // Insert the pin
  await sql`
    INSERT INTO pinned_conversations (user_id, conversation_id)
    VALUES (${user.user_id}, ${conversationId}::uuid)
  `;

  // Track conversation pinned
  trackConversationPinned(user.user_id, {
    conversation_id: conversationId,
  });

  return c.json({ success: true, pinned: true });
});

// Unpin a conversation
conversations.delete("/:conversationId/pin", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");

  // Verify conversation exists and user is a participant
  const convCheck = await sql`
    SELECT id FROM conversations 
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Delete the pin
  const deleted = await sql`
    DELETE FROM pinned_conversations 
    WHERE user_id = ${user.user_id} AND conversation_id = ${conversationId}::uuid
    RETURNING id
  `;

  // Track conversation unpinned (only if it was actually pinned)
  if (deleted.length > 0) {
    trackConversationUnpinned(user.user_id, {
      conversation_id: conversationId,
    });
  }

  return c.json({ success: true, pinned: false });
});

// Get pin status for a conversation
conversations.get("/:conversationId/pin", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");

  // Verify conversation exists and user is a participant
  const convCheck = await sql`
    SELECT id FROM conversations 
    WHERE id = ${conversationId}::uuid 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const pinned = await sql`
    SELECT pinned_at FROM pinned_conversations 
    WHERE user_id = ${user.user_id} AND conversation_id = ${conversationId}::uuid
  `;

  return c.json({
    pinned: pinned.length > 0,
    pinned_at: pinned.length > 0 ? pinned[0].pinned_at : null,
  });
});

export default conversations;
