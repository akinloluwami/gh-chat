import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { sql } from "./db/index.js";
import {
  initRedis,
  registerUserConnection,
  unregisterUserConnection,
  setUserConversation,
  publishToUser,
  publishToConversation,
  subscribeToUser,
  subscribeToConversation,
  SERVER_ID,
} from "./redis.js";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  username?: string;
  conversationId?: string;
  isAlive?: boolean;
  cleanupFns?: (() => void)[];
}

// Local socket tracking (for this server instance only)
const localConversationSockets = new Map<string, Set<AuthenticatedSocket>>();
const localUserSockets = new Map<string, Set<AuthenticatedSocket>>();
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// Get all users who have a conversation with this user (to notify about status changes).
// This should conceptually return all conversation partners; privacy filtering based on
// a user's hidden online status is handled by the calling code.
async function getConversationPartners(userId: string): Promise<string[]> {
  try {
    const results = await sql`
      SELECT DISTINCT 
        CASE WHEN c.user1_id = ${userId}::uuid THEN c.user2_id ELSE c.user1_id END as partner_id
      FROM conversations c
      WHERE c.user1_id = ${userId}::uuid OR c.user2_id = ${userId}::uuid
    `;
    return results.map((r) => r.partner_id);
  } catch {
    return [];
  }
}

// Check if user has hidden their online status
async function isStatusHidden(userId: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT hide_online_status FROM users WHERE id = ${userId}::uuid
    `;
    return result.length > 0 && result[0].hide_online_status === true;
  } catch {
    return false;
  }
}

// Broadcast user status to all their conversation partners
export async function broadcastUserStatus(
  userId: string,
  username: string,
  online: boolean,
  lastSeenAt?: string,
) {
  // Don't broadcast if user has hidden their status
  if (await isStatusHidden(userId)) {
    console.log(`User ${username} has hidden status, not broadcasting`);
    return;
  }

  const partners = await getConversationPartners(userId);
  const statusMessage = {
    type: online ? "user_online" : "user_offline",
    userId,
    username,
    lastSeenAt: online ? null : lastSeenAt || new Date().toISOString(),
  };

  for (const partnerId of partners) {
    await broadcastToUser(partnerId, statusMessage);
  }
}

// Broadcast that user's status is now hidden (appears offline to partners)
export async function broadcastStatusHidden(userId: string, username: string) {
  // Get all conversation partners (not filtered by hide_online_status)
  try {
    const results = await sql`
      SELECT DISTINCT 
        CASE WHEN user1_id = ${userId}::uuid THEN user2_id ELSE user1_id END as partner_id
      FROM conversations
      WHERE user1_id = ${userId}::uuid OR user2_id = ${userId}::uuid
    `;
    const partners = results.map((r) => r.partner_id);

    const statusMessage = {
      type: "user_offline",
      userId,
      username,
      lastSeenAt: null,
      hidden: true,
    };

    for (const partnerId of partners) {
      await broadcastToUser(partnerId, statusMessage);
    }
  } catch (error) {
    console.error("Error broadcasting status hidden:", error);
  }
}

// Add socket to local user tracking
function addLocalUserSocket(socket: AuthenticatedSocket) {
  if (!socket.userId) return;
  if (!localUserSockets.has(socket.userId)) {
    localUserSockets.set(socket.userId, new Set());
  }
  localUserSockets.get(socket.userId)!.add(socket);
  console.log(
    `Added socket for user ${socket.userId}, total sockets: ${
      localUserSockets.get(socket.userId)!.size
    }`,
  );
}

// Remove socket from local user tracking
function removeLocalUserSocket(socket: AuthenticatedSocket) {
  if (!socket.userId) return;
  const sockets = localUserSockets.get(socket.userId);
  if (sockets) {
    sockets.delete(socket);
    console.log(
      `Removed socket for user ${socket.userId}, remaining: ${sockets.size}`,
    );
    if (sockets.size === 0) {
      localUserSockets.delete(socket.userId);
      console.log(
        `No more sockets for user ${socket.userId}, removed from map`,
      );
    }
  }
}

// Add socket to local conversation tracking
function addLocalConversationSocket(
  socket: AuthenticatedSocket,
  conversationId: string,
) {
  if (!localConversationSockets.has(conversationId)) {
    localConversationSockets.set(conversationId, new Set());
  }
  localConversationSockets.get(conversationId)!.add(socket);
}

// Remove socket from local conversation tracking
function removeLocalConversationSocket(socket: AuthenticatedSocket) {
  if (socket.conversationId) {
    const sockets = localConversationSockets.get(socket.conversationId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        localConversationSockets.delete(socket.conversationId);
      }
    }
  }
}

// Send to all local sockets for a user
function sendToLocalUser(userId: string, message: any) {
  const sockets = localUserSockets.get(userId);
  if (!sockets) {
    console.log(`No local sockets found for user ${userId}`);
    return;
  }
  console.log(
    `Sending to ${sockets.size} local sockets for user ${userId}:`,
    message.type,
  );
  const messageStr = JSON.stringify(message);
  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
      console.log(`Sent ${message.type} to socket for user ${userId}`);
    } else {
      console.log(
        `Socket not open for user ${userId}, state: ${socket.readyState}`,
      );
    }
  });
}

// Send to all local sockets in a conversation
function sendToLocalConversation(
  conversationId: string,
  message: any,
  excludeUserId?: string,
) {
  const sockets = localConversationSockets.get(conversationId);
  if (!sockets) return;
  const messageStr = JSON.stringify(message);
  sockets.forEach((socket) => {
    if (
      socket.userId !== excludeUserId &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(messageStr);
    }
  });
}

// Broadcast to user across all servers via Redis
export async function broadcastToUser(userId: string, message: any) {
  // Send to local sockets first
  sendToLocalUser(userId, message);
  // Publish to Redis for other servers
  await publishToUser(userId, { ...message, _sourceServer: SERVER_ID });
}

// Broadcast to conversation across all servers via Redis
export async function broadcastToConversation(
  conversationId: string,
  message: any,
  excludeUserId?: string,
) {
  // Send to local sockets first
  sendToLocalConversation(conversationId, message, excludeUserId);
  // Publish to Redis for other servers
  await publishToConversation(conversationId, {
    ...message,
    _excludeUserId: excludeUserId,
    _sourceServer: SERVER_ID,
  });
}

// Verify token and get user info
async function verifyToken(
  token: string,
): Promise<{ userId: string; username: string } | null> {
  try {
    const sessions = await sql`
      SELECT s.*, u.id as user_id, u.username
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ${token} AND s.expires_at > NOW()
    `;

    if (sessions.length === 0) return null;
    return { userId: sessions[0].user_id, username: sessions[0].username };
  } catch {
    return null;
  }
}

// Allowed origins for WebSocket connections
const ALLOWED_WS_ORIGINS = [
  "https://github.com",
  "http://localhost:5173",
  process.env.FRONTEND_URL || "http://localhost:5173",
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // Allow connections without origin (e.g., from extensions)
  if (origin.startsWith("chrome-extension://")) return true;
  return ALLOWED_WS_ORIGINS.includes(origin);
}

// Create WebSocket server attached to HTTP server
export function createWebSocketServer(server: Server) {
  // Initialize Redis pub/sub
  initRedis();

  const wss = new WebSocketServer({
    server,
    verifyClient: (info, callback) => {
      const origin = info.origin || info.req.headers.origin;
      if (isOriginAllowed(origin)) {
        callback(true);
      } else {
        console.log(`WebSocket connection rejected from origin: ${origin}`);
        callback(false, 403, "Forbidden");
      }
    },
  });

  console.log(`WebSocket server ${SERVER_ID} attached to HTTP server`);

  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.isAlive === false) {
        cleanupSocket(socket);
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: AuthenticatedSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle authentication
        if (message.type === "auth") {
          const user = await verifyToken(message.token);
          if (!user) {
            ws.send(JSON.stringify({ type: "error", error: "Invalid token" }));
            ws.close();
            return;
          }
          ws.userId = user.userId;
          ws.username = user.username;
          ws.cleanupFns = [];

          // Register locally and in Redis
          addLocalUserSocket(ws);
          await registerUserConnection(user.userId);

          // Broadcast online status to conversation partners (only if this is the first socket for this user)
          const userSockets = localUserSockets.get(user.userId);
          if (userSockets && userSockets.size === 1) {
            await broadcastUserStatus(user.userId, user.username, true);
          }

          // Subscribe to user-specific messages from Redis (from other servers)
          const unsubUser = await subscribeToUser(user.userId, (msg) => {
            // Don't echo messages from this server
            if (msg._sourceServer === SERVER_ID) return;
            const { _sourceServer, ...cleanMsg } = msg;
            sendToLocalUser(user.userId, cleanMsg);
          });
          ws.cleanupFns.push(unsubUser);

          ws.send(
            JSON.stringify({ type: "authenticated", userId: user.userId }),
          );
          return;
        }

        // Require authentication for other messages
        if (!ws.userId) {
          ws.send(
            JSON.stringify({ type: "error", error: "Not authenticated" }),
          );
          return;
        }

        // Join a conversation room
        if (message.type === "join") {
          const conversationId = message.conversationId;

          // Verify user is part of this conversation
          const convCheck = await sql`
            SELECT id FROM conversations
            WHERE id = ${conversationId} 
            AND (user1_id = ${ws.userId} OR user2_id = ${ws.userId})
          `;

          if (convCheck.length === 0) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Conversation not found",
              }),
            );
            return;
          }

          // Leave previous conversation if any
          if (ws.conversationId) {
            await leaveConversation(ws);
          }

          // Join new conversation
          ws.conversationId = conversationId;
          addLocalConversationSocket(ws, conversationId);
          await setUserConversation(ws.userId, conversationId);

          // Subscribe to conversation messages from Redis (from other servers)
          const unsubConv = await subscribeToConversation(
            conversationId,
            (msg) => {
              // Don't echo messages from this server
              if (msg._sourceServer === SERVER_ID) return;
              // Don't send to excluded user
              if (msg._excludeUserId === ws.userId) return;
              const { _sourceServer, _excludeUserId, ...cleanMsg } = msg;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(cleanMsg));
              }
            },
          );
          ws.cleanupFns!.push(unsubConv);

          ws.send(JSON.stringify({ type: "joined", conversationId }));
          return;
        }

        // Leave conversation
        if (message.type === "leave") {
          await leaveConversation(ws);
          ws.send(JSON.stringify({ type: "left" }));
          return;
        }

        // Typing indicator
        if (message.type === "typing") {
          if (!ws.conversationId) return;

          const typingKey = `${ws.conversationId}:${ws.userId}`;

          // Clear existing timeout
          if (typingTimeouts.has(typingKey)) {
            clearTimeout(typingTimeouts.get(typingKey)!);
          }

          // Broadcast typing to others in conversation
          broadcastToConversation(
            ws.conversationId,
            {
              type: "typing",
              userId: ws.userId,
              username: ws.username,
            },
            ws.userId,
          );

          // Set timeout to clear typing after 3 seconds
          typingTimeouts.set(
            typingKey,
            setTimeout(() => {
              broadcastToConversation(
                ws.conversationId!,
                {
                  type: "stop_typing",
                  userId: ws.userId,
                },
                ws.userId,
              );
              typingTimeouts.delete(typingKey);
            }, 3000),
          );
          return;
        }

        // Stop typing
        if (message.type === "stop_typing") {
          if (!ws.conversationId) return;

          const typingKey = `${ws.conversationId}:${ws.userId}`;
          if (typingTimeouts.has(typingKey)) {
            clearTimeout(typingTimeouts.get(typingKey)!);
            typingTimeouts.delete(typingKey);
          }

          broadcastToConversation(
            ws.conversationId,
            {
              type: "stop_typing",
              userId: ws.userId,
            },
            ws.userId,
          );
          return;
        }

        // Mark messages as read
        if (message.type === "mark_read") {
          if (!ws.conversationId) return;

          const messageIds = message.messageIds as number[];
          if (!Array.isArray(messageIds) || messageIds.length === 0) return;

          console.log(
            "Marking messages as read:",
            messageIds,
            "in conversation:",
            ws.conversationId,
          );

          // Update messages as read in database and get the sender IDs
          const updatedMessages = await sql`
            UPDATE messages 
            SET read_at = NOW() 
            WHERE id = ANY(${messageIds}) 
            AND conversation_id = ${ws.conversationId}
            AND sender_id != ${ws.userId}
            AND read_at IS NULL
            RETURNING id, sender_id
          `;

          console.log("Updated messages:", updatedMessages);

          if (updatedMessages.length === 0) return;

          // Group message IDs by sender
          const messagesBySender = new Map<string, string[]>();
          for (const msg of updatedMessages) {
            if (!messagesBySender.has(msg.sender_id)) {
              messagesBySender.set(msg.sender_id, []);
            }
            messagesBySender.get(msg.sender_id)!.push(msg.id);
          }

          // Notify each sender about their messages being read (globally, not just in conversation)
          for (const [senderId, msgIds] of messagesBySender) {
            console.log(
              `Sending messages_read to user ${senderId} for messages:`,
              msgIds,
            );
            console.log(
              `Local user sockets for ${senderId}:`,
              localUserSockets.has(senderId),
            );
            await broadcastToUser(senderId, {
              type: "messages_read",
              conversationId: ws.conversationId,
              messageIds: msgIds,
              readBy: ws.userId,
            });
          }
          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", async () => {
      // Clear typing timeout on disconnect
      if (ws.conversationId && ws.userId) {
        const typingKey = `${ws.conversationId}:${ws.userId}`;
        if (typingTimeouts.has(typingKey)) {
          clearTimeout(typingTimeouts.get(typingKey)!);
          typingTimeouts.delete(typingKey);
          // Notify others that user stopped typing
          await broadcastToConversation(
            ws.conversationId,
            { type: "stop_typing", userId: ws.userId },
            ws.userId,
          );
        }
      }
      await cleanupSocket(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      cleanupSocket(ws).catch(console.error);
    });
  });

  return wss;
}

// Leave a conversation and clean up
async function leaveConversation(ws: AuthenticatedSocket) {
  if (!ws.conversationId || !ws.userId) return;

  // Clear typing timeout
  const typingKey = `${ws.conversationId}:${ws.userId}`;
  if (typingTimeouts.has(typingKey)) {
    clearTimeout(typingTimeouts.get(typingKey)!);
    typingTimeouts.delete(typingKey);

    // Notify others
    await broadcastToConversation(
      ws.conversationId,
      { type: "stop_typing", userId: ws.userId },
      ws.userId,
    );
  }

  removeLocalConversationSocket(ws);
  await setUserConversation(ws.userId, null);
  ws.conversationId = undefined;
}

// Full socket cleanup
async function cleanupSocket(ws: AuthenticatedSocket) {
  // Run cleanup functions (Redis subscriptions)
  if (ws.cleanupFns) {
    ws.cleanupFns.forEach((fn) => fn());
  }

  await leaveConversation(ws);

  const userId = ws.userId;
  const username = ws.username;

  removeLocalUserSocket(ws);

  // Unregister from Redis if no more local sockets for this user
  if (userId && !localUserSockets.has(userId)) {
    await unregisterUserConnection(userId);
    // Broadcast offline status to conversation partners
    if (username) {
      await broadcastUserStatus(userId, username, false);
    }
  }
}
