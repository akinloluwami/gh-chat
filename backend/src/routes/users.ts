import { Hono } from "hono";
import { sql } from "../db/index.js";
import { getUserStatus } from "../redis.js";

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

  try {
    // Verify the user exists
    const userCheck = await sql`
      SELECT id, username FROM users WHERE id = ${userId}::uuid
    `;

    if (userCheck.length === 0) {
      return c.json({ error: "User not found" }, 404);
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

  try {
    // Get user by username
    const userResult = await sql`
      SELECT id, username FROM users WHERE username = ${username}
    `;

    if (userResult.length === 0) {
      return c.json({ error: "User not found" }, 404);
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

export default users;
