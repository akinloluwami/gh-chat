import { Hono } from "hono";
import { sql } from "../db/index.js";
import * as jose from "jose";
import "dotenv/config";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8585";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "github-chat-secret-key-change-in-production",
);

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
}

const auth = new Hono();

// Generate a random state for CSRF protection
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a session token
async function generateSessionToken(userId: number): Promise<string> {
  const token = await new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
  return token;
}

// Verify session token
export async function verifySessionToken(
  token: string,
): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as number };
  } catch {
    return null;
  }
}

// Store for OAuth states (in production, use Redis or database)
const oauthStates = new Map<string, { createdAt: number }>();

// Cleanup old states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

// GET /auth/github - Initiate GitHub OAuth
auth.get("/github", (c) => {
  const state = generateState();
  oauthStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${BACKEND_URL}/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /auth/github/callback - Handle OAuth callback
auth.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  // Verify state
  if (!state || !oauthStates.has(state)) {
    return c.redirect(`${FRONTEND_URL}/auth/error?message=Invalid state`);
  }
  oauthStates.delete(state);

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/auth/error?message=No code provided`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      return c.redirect(
        `${FRONTEND_URL}/auth/error?message=Failed to get access token`,
      );
    }

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const userData = (await userResponse.json()) as {
      id: number;
      login: string;
      name?: string;
      avatar_url?: string;
      email?: string;
    };

    // Get user's primary email from GitHub (if not available in user data)
    let userEmail: string | null = userData.email || null;
    if (!userEmail) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (emailResponse.ok) {
        const emails = (await emailResponse.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        // Find the primary verified email, or fall back to any verified email
        const primaryEmail = emails.find((e) => e.primary && e.verified);
        const verifiedEmail = emails.find((e) => e.verified);
        userEmail = primaryEmail?.email || verifiedEmail?.email || null;
      }
    }

    // Upsert user in database
    const [user] = await sql`
      INSERT INTO users (github_id, username, display_name, email, avatar_url, access_token, has_account, updated_at)
      VALUES (${userData.id}, ${userData.login}, ${
      userData.name || userData.login
    }, ${userEmail || null}, ${userData.avatar_url || ""}, ${
      tokenData.access_token
    }, TRUE, NOW())
      ON CONFLICT (github_id) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        email = COALESCE(EXCLUDED.email, users.email),
        avatar_url = EXCLUDED.avatar_url,
        access_token = EXCLUDED.access_token,
        has_account = TRUE,
        updated_at = NOW()
      RETURNING id, username, display_name, avatar_url
    `;

    // Generate session token
    const sessionToken = await generateSessionToken(user.id);

    // Store session in database
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await sql`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${user.id}, ${sessionToken}, ${expiresAt})
    `;

    // Redirect to frontend with token
    return c.redirect(`${FRONTEND_URL}/auth/success?token=${sessionToken}`);
  } catch (error) {
    console.error("OAuth error:", error);
    return c.redirect(
      `${FRONTEND_URL}/auth/error?message=Authentication failed`,
    );
  }
});

// GET /auth/me - Get current user
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifySessionToken(token);

  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check if session exists and is not expired
  const [session] = await sql`
    SELECT * FROM sessions 
    WHERE token = ${token} AND expires_at > NOW()
  `;

  if (!session) {
    return c.json({ error: "Session expired" }, 401);
  }

  // Get user
  const [user] = await sql`
    SELECT id, github_id, username, display_name, avatar_url, created_at
    FROM users WHERE id = ${payload.userId}
  `;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user });
});

// POST /auth/logout - Invalidate session
auth.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  await sql`DELETE FROM sessions WHERE token = ${token}`;

  return c.json({ success: true });
});

// Backfill emails for existing users who don't have one
// This is idempotent - it only processes users without an email
export async function backfillUserEmails(): Promise<void> {
  console.log("[Backfill] Starting email backfill for existing users...");

  // Get users without email who have an access token
  const usersWithoutEmail = await sql`
    SELECT id, username, access_token 
    FROM users 
    WHERE email IS NULL AND access_token IS NOT NULL
  `;

  if (usersWithoutEmail.length === 0) {
    console.log("[Backfill] No users need email backfill");
    return;
  }

  console.log(
    `[Backfill] Found ${usersWithoutEmail.length} users without email`,
  );

  let successCount = 0;
  let failCount = 0;

  for (const user of usersWithoutEmail) {
    try {
      // Try to get email from GitHub API
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${user.access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!emailResponse.ok) {
        // Token might be expired or revoked
        console.log(
          `[Backfill] Failed to fetch email for ${user.username}: ${emailResponse.status}`,
        );
        failCount++;
        continue;
      }

      const emails = (await emailResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;

      // Find the primary verified email, or fall back to any verified email
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      const verifiedEmail = emails.find((e) => e.verified);
      const userEmail = primaryEmail?.email || verifiedEmail?.email || null;

      if (userEmail) {
        await sql`
          UPDATE users SET email = ${userEmail}, updated_at = NOW()
          WHERE id = ${user.id} AND email IS NULL
        `;
        console.log(`[Backfill] Updated email for ${user.username}`);
        successCount++;
      } else {
        console.log(`[Backfill] No verified email found for ${user.username}`);
        failCount++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[Backfill] Error processing ${user.username}:`, error);
      failCount++;
    }
  }

  console.log(
    `[Backfill] Complete. Success: ${successCount}, Failed: ${failCount}`,
  );
}

export default auth;
