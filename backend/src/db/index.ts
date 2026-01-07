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

  // Add edited_at column if it doesn't exist (for message editing)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'edited_at'
      ) THEN 
        ALTER TABLE messages ADD COLUMN edited_at TIMESTAMP;
      END IF;
    END $$;
  `;

  // Add deleted_at column if it doesn't exist (for soft delete)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'deleted_at'
      ) THEN 
        ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP;
      END IF;
    END $$;
  `;

  // Add last_seen_at column to users table (for online status tracking)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_seen_at'
      ) THEN 
        ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
      END IF;
    END $$;
  `;

  // Ensure last_seen_at is TIMESTAMPTZ (fix existing columns)
  await sql`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'last_seen_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE users ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;
      END IF;
    END $$;
  `;

  // Add hide_online_status column to users table (for privacy)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'hide_online_status'
      ) THEN 
        ALTER TABLE users ADD COLUMN hide_online_status BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `;

  // Migrate messages table timestamps to TIMESTAMPTZ
  await sql`
    DO $$ 
    BEGIN 
      -- messages.created_at
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'created_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE messages ALTER COLUMN created_at TYPE TIMESTAMPTZ;
      END IF;
      -- messages.read_at
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'read_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE messages ALTER COLUMN read_at TYPE TIMESTAMPTZ;
      END IF;
      -- messages.edited_at
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'edited_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE messages ALTER COLUMN edited_at TYPE TIMESTAMPTZ;
      END IF;
      -- messages.deleted_at
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'deleted_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE messages ALTER COLUMN deleted_at TYPE TIMESTAMPTZ;
      END IF;
    END $$;
  `;

  // Migrate sessions.expires_at to TIMESTAMPTZ (important for session validation)
  await sql`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' 
        AND column_name = 'expires_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE sessions ALTER COLUMN expires_at TYPE TIMESTAMPTZ;
      END IF;
    END $$;
  `;

  // Migrate conversation_reads.last_read_at to TIMESTAMPTZ (for unread indicators)
  await sql`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_reads' 
        AND column_name = 'last_read_at' 
        AND data_type = 'timestamp without time zone'
      ) THEN 
        ALTER TABLE conversation_reads ALTER COLUMN last_read_at TYPE TIMESTAMPTZ;
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

  // Create blocks table (stores user blocks)
  await sql`
    CREATE TABLE IF NOT EXISTS blocks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)`;

  // Create pinned_conversations table (stores user's pinned conversations)
  await sql`
    CREATE TABLE IF NOT EXISTS pinned_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      pinned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, conversation_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pinned_conversations_user ON pinned_conversations(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pinned_conversations_conversation ON pinned_conversations(conversation_id)`;

  console.log("Database tables initialized with UUID primary keys");
}
