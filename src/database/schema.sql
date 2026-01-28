-- Claude Memory Database Schema
-- Brain-like memory storage with full-text search

-- Main memories table
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('short_term', 'long_term', 'episodic')),
  category TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  project TEXT,
  tags TEXT DEFAULT '[]',  -- JSON array
  salience REAL DEFAULT 0.5 CHECK(salience >= 0 AND salience <= 1),
  decayed_score REAL,  -- Cached decay calculation for efficient sorting
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT DEFAULT '{}',  -- JSON object
  embedding BLOB,  -- Vector embedding for semantic search
  scope TEXT DEFAULT 'project',  -- Scope: project or global
  transferable INTEGER DEFAULT 0,  -- Cross-project sharing flag

  -- Index for common queries
  CONSTRAINT valid_category CHECK(category IN (
    'architecture', 'pattern', 'preference', 'error',
    'context', 'learning', 'todo', 'note', 'relationship', 'custom'
  ))
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title,
  content,
  tags,
  content='memories',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO memories_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_salience ON memories(salience DESC);
CREATE INDEX IF NOT EXISTS idx_memories_decayed_score ON memories(decayed_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- Session tracking for consolidation
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  summary TEXT,
  memories_created INTEGER DEFAULT 0,
  memories_accessed INTEGER DEFAULT 0
);

-- Memory relationships (for linked memories)
CREATE TABLE IF NOT EXISTS memory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relationship TEXT NOT NULL, -- 'related', 'supersedes', 'conflicts', 'supports'
  strength REAL DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
  UNIQUE(source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON memory_links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_id);

-- Events table for cross-process IPC (MCP → Dashboard)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data TEXT,  -- JSON stringified event payload
  timestamp TEXT NOT NULL,
  processed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed, id);
