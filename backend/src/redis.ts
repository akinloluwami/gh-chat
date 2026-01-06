import { Redis } from "ioredis";
import "dotenv/config";
import { sql } from "./db/index.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Generate unique server ID for this instance
export const SERVER_ID = `server-${process.pid}-${Date.now()}`;

// Redis clients
let redis: Redis | null = null;
let redisSub: Redis | null = null;
let redisPub: Redis | null = null;

// Local event emitter for pub/sub messages
type MessageHandler = (message: any) => void;
const userHandlers = new Map<string, Set<MessageHandler>>();
const conversationHandlers = new Map<string, Set<MessageHandler>>();

// Initialize Redis connections
export function initRedis() {
  if (redis) return;

  redis = new Redis(REDIS_URL);
  redisSub = new Redis(REDIS_URL);
  redisPub = new Redis(REDIS_URL);

  redis.on("connect", () => console.log("Redis connected"));
  redis.on("error", (err: Error) => console.error("Redis error:", err));

  // Handle incoming pub/sub messages
  redisSub.on("message", (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);

      // User channel: user:{userId}
      if (channel.startsWith("user:")) {
        const userId = channel.split(":")[1];
        const handlers = userHandlers.get(userId);
        if (handlers) {
          handlers.forEach((handler) => handler(data));
        }
      }

      // Conversation channel: conv:{conversationId}
      if (channel.startsWith("conv:")) {
        const convId = channel.split(":")[1];
        const handlers = conversationHandlers.get(convId);
        if (handlers) {
          handlers.forEach((handler) => handler(data));
        }
      }
    } catch (err) {
      console.error("Redis message parse error:", err);
    }
  });

  console.log(`Redis initialized for server ${SERVER_ID}`);
}

// Get Redis client (for direct operations)
export function getRedis(): Redis {
  if (!redis) {
    initRedis();
  }
  return redis!;
}

// User presence tracking
const USER_PRESENCE_KEY = "user:presence";
const USER_CONVERSATION_KEY = "user:conversation";
const PRESENCE_TTL = 60; // seconds

export async function registerUserConnection(userId: string): Promise<void> {
  const r = getRedis();
  await r.zadd(USER_PRESENCE_KEY, Date.now(), userId);
}

export async function unregisterUserConnection(userId: string): Promise<void> {
  const r = getRedis();
  await r.zrem(USER_PRESENCE_KEY, userId);
  await r.hdel(USER_CONVERSATION_KEY, userId);

  // Update last_seen_at in database
  try {
    await sql`UPDATE users SET last_seen_at = NOW() WHERE id = ${userId}::uuid`;
  } catch (err) {
    console.error("Failed to update last_seen_at:", err);
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const r = getRedis();
  const score = await r.zscore(USER_PRESENCE_KEY, userId);
  return score !== null;
}

// Get user status (online + last_seen)
export async function getUserStatus(
  userId: string,
): Promise<{ online: boolean; lastSeenAt: string | null }> {
  const online = await isUserOnline(userId);
  if (online) {
    return { online: true, lastSeenAt: null };
  }

  // Get last_seen_at from database
  try {
    const result =
      await sql`SELECT last_seen_at FROM users WHERE id = ${userId}::uuid`;
    return {
      online: false,
      lastSeenAt: result[0]?.last_seen_at?.toISOString() || null,
    };
  } catch {
    return { online: false, lastSeenAt: null };
  }
}

export async function setUserConversation(
  userId: string,
  conversationId: string | null,
): Promise<void> {
  const r = getRedis();
  if (conversationId) {
    await r.hset(USER_CONVERSATION_KEY, userId, conversationId);
  } else {
    await r.hdel(USER_CONVERSATION_KEY, userId);
  }
}

export async function getUserConversation(
  userId: string,
): Promise<string | null> {
  const r = getRedis();
  const convId = await r.hget(USER_CONVERSATION_KEY, userId);
  return convId || null;
}

// Pub/Sub for user messages (read receipts, etc.)
export async function publishToUser(
  userId: string,
  message: any,
): Promise<void> {
  if (!redisPub) return;
  await redisPub.publish(`user:${userId}`, JSON.stringify(message));
}

export async function subscribeToUser(
  userId: string,
  handler: MessageHandler,
): Promise<() => void> {
  if (!redisSub) {
    initRedis();
  }

  const channel = `user:${userId}`;

  // Add handler
  if (!userHandlers.has(userId)) {
    userHandlers.set(userId, new Set());
    await redisSub!.subscribe(channel);
  }
  userHandlers.get(userId)!.add(handler);

  // Return unsubscribe function
  return () => {
    const handlers = userHandlers.get(userId);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        userHandlers.delete(userId);
        redisSub?.unsubscribe(channel);
      }
    }
  };
}

// Pub/Sub for conversation messages (typing, new messages, etc.)
export async function publishToConversation(
  conversationId: string,
  message: any,
): Promise<void> {
  if (!redisPub) return;
  await redisPub.publish(`conv:${conversationId}`, JSON.stringify(message));
}

export async function subscribeToConversation(
  conversationId: string,
  handler: MessageHandler,
): Promise<() => void> {
  if (!redisSub) {
    initRedis();
  }

  const channel = `conv:${conversationId}`;

  // Add handler
  if (!conversationHandlers.has(conversationId)) {
    conversationHandlers.set(conversationId, new Set());
    await redisSub!.subscribe(channel);
  }
  conversationHandlers.get(conversationId)!.add(handler);

  // Return unsubscribe function
  return () => {
    const handlers = conversationHandlers.get(conversationId);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        conversationHandlers.delete(conversationId);
        redisSub?.unsubscribe(channel);
      }
    }
  };
}

// Cleanup old presence entries (call periodically)
export async function cleanupStalePresence(): Promise<void> {
  const r = getRedis();
  const staleTime = Date.now() - PRESENCE_TTL * 1000;
  await r.zremrangebyscore(USER_PRESENCE_KEY, 0, staleTime);
}
