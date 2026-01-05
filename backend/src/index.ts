import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDb } from "./db/index.js";
import auth from "./routes/auth.js";
import conversations from "./routes/conversations.js";
import { createWebSocketServer } from "./websocket.js";
import "dotenv/config";
import type { Server } from "http";

const app = new Hono();

// Enable CORS for frontend and extension
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return "*";

      // Allow chrome extensions
      if (origin.startsWith("chrome-extension://")) return origin;

      // Allow specific origins
      const allowedOrigins = [
        "http://localhost:5173",
        "https://github.com",
        "https://ghchat.social",
        process.env.FRONTEND_URL || "http://localhost:5173",
      ];

      if (allowedOrigins.includes(origin)) return origin;

      // For development, allow all origins
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  }),
);

// Routes
app.route("/auth", auth);
app.route("/conversations", conversations);

app.get("/", (c) => {
  return c.json({ message: "GH Chat API", version: "1.0.0" });
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Initialize database and start server
async function main() {
  try {
    await initDb();
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || "8585", 10);

  // Start HTTP server
  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  ) as Server;

  // Attach WebSocket server to the same HTTP server
  createWebSocketServer(server);
}

main();
