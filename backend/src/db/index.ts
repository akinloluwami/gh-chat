import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const sql = postgres(connectionString, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Initialize database tables
export async function initDb() {
  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      github_id INTEGER UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      avatar_url TEXT,
      access_token TEXT,
      has_account BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create sessions table
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create conversations table
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
      user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user1_id, user2_id)
    )
  `;

  // Create messages table
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      read_at TIMESTAMP
    )
  `;

  // Add reply_to_id column if it doesn't exist (for existing databases)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'reply_to_id'
      ) THEN 
        ALTER TABLE messages ADD COLUMN reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `;

  // Create conversation_reads table (tracks when user last read each conversation)
  await sql`
    CREATE TABLE IF NOT EXISTS conversation_reads (
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      last_read_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, conversation_id)
    )
  `;

  // Create message_reactions table (stores emoji reactions on messages)
  await sql`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(32) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(message_id, user_id, emoji)
    )
  `;

  // Create indexes for better query performance
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON conversation_reads(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id)`;

  console.log("Database tables initialized with UUID primary keys");
}
