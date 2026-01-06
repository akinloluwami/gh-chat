import { Hono } from "hono";
import { sql } from "../db/index.js";
import { getUserStatus } from "../redis.js";
import { broadcastStatusHidden, broadcastUserStatus } from "../websocket.js";

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

const users = new Hono<{ Variables: Variables }>();

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
users.use("/*", requireAuth);

// Get user status (online/offline + last seen)
users.get("/:userId/status", async (c) => {
  const userId = c.req.param("userId");
  const currentUser = c.get("user");

  try {
    // Check if current user has hidden their online status
    const currentUserSettings = await sql`
      SELECT hide_online_status FROM users WHERE id = ${currentUser.user_id}::uuid
    `;

    // If current user hides their status, they can't see others' status
    if (
      currentUserSettings.length > 0 &&
      currentUserSettings[0].hide_online_status
    ) {
      return c.json({
        userId,
        username: null,
        online: false,
        lastSeenAt: null,
        hidden: true,
      });
    }

    // Verify the user exists and check their privacy setting
    const userCheck = await sql`
      SELECT id, username, hide_online_status FROM users WHERE id = ${userId}::uuid
    `;

    if (userCheck.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // If target user hides their status, return offline
    if (userCheck[0].hide_online_status) {
      return c.json({
        userId,
        username: userCheck[0].username,
        online: false,
        lastSeenAt: null,
        hidden: true,
      });
    }

    const status = await getUserStatus(userId);

    return c.json({
      userId,
      username: userCheck[0].username,
      online: status.online,
      lastSeenAt: status.lastSeenAt,
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    return c.json({ error: "Failed to get user status" }, 500);
  }
});

// Get status by username
users.get("/username/:username/status", async (c) => {
  const username = c.req.param("username");
  const currentUser = c.get("user");

  try {
    // Check if current user has hidden their online status
    const currentUserSettings = await sql`
      SELECT hide_online_status FROM users WHERE id = ${currentUser.user_id}::uuid
    `;

    // If current user hides their status, they can't see others' status
    if (
      currentUserSettings.length > 0 &&
      currentUserSettings[0].hide_online_status
    ) {
      return c.json({
        userId: null,
        username,
        online: false,
        lastSeenAt: null,
        hidden: true,
      });
    }

    // Get user by username
    const userResult = await sql`
      SELECT id, username, hide_online_status FROM users WHERE username = ${username}
    `;

    if (userResult.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // If target user hides their status, return offline
    if (userResult[0].hide_online_status) {
      return c.json({
        userId: userResult[0].id,
        username: userResult[0].username,
        online: false,
        lastSeenAt: null,
        hidden: true,
      });
    }

    const userId = userResult[0].id;
    const status = await getUserStatus(userId);

    return c.json({
      userId,
      username: userResult[0].username,
      online: status.online,
      lastSeenAt: status.lastSeenAt,
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    return c.json({ error: "Failed to get user status" }, 500);
  }
});

// Get current user's settings
users.get("/settings", async (c) => {
  const currentUser = c.get("user");

  try {
    const result = await sql`
      SELECT hide_online_status FROM users WHERE id = ${currentUser.user_id}::uuid
    `;

    if (result.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({
      hide_online_status: result[0].hide_online_status ?? false,
    });
  } catch (error) {
    console.error("Error getting user settings:", error);
    return c.json({ error: "Failed to get settings" }, 500);
  }
});

// Update current user's settings
users.patch("/settings", async (c) => {
  const currentUser = c.get("user");

  try {
    const body = await c.req.json();
    const { hide_online_status } = body;

    if (!Object.prototype.hasOwnProperty.call(body, "hide_online_status")) {
      return c.json({ error: "hide_online_status is required" }, 400);
    }
    if (typeof hide_online_status !== "boolean") {
      return c.json({ error: "hide_online_status must be a boolean" }, 400);
    }

    await sql`
      UPDATE users 
      SET hide_online_status = ${hide_online_status}
      WHERE id = ${currentUser.user_id}::uuid
    `;

    // Broadcast status change to conversation partners
    if (hide_online_status) {
      // User is hiding their status - broadcast as offline/hidden
      await broadcastStatusHidden(currentUser.user_id, currentUser.username);
    } else {
      // User is showing their status again - broadcast their actual online state
      const userStatus = await getUserStatus(currentUser.user_id);
      const isOnline =
        typeof userStatus === "boolean"
          ? userStatus
          : !!(userStatus && (userStatus as any).online);
      await broadcastUserStatus(
        currentUser.user_id,
        currentUser.username,
        isOnline,
      );
    }

    return c.json({
      hide_online_status,
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return c.json({ error: "Failed to update settings" }, 500);
  }
});

export default users;
