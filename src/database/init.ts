/**
 * Database initialization and connection management
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;
let currentDbPath: string | null = null;
let lockFilePath: string | null = null;

// Anti-bloat: Database size limits
const MAX_DB_SIZE = 100 * 1024 * 1024; // 100MB hard limit
const WARN_DB_SIZE = 50 * 1024 * 1024; // 50MB warning threshold

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Get the database path with legacy fallback
 * - New installs use ~/.claude-cortex/
 * - Existing users with ~/.claude-memory/ continue to work
 */
function getDefaultDbPath(): string {
  const newPath = join(homedir(), '.claude-cortex', 'memories.db');
  const legacyPath = join(homedir(), '.claude-memory', 'memories.db');

  // Prefer new path if it exists, or if neither exists (new install)
  if (existsSync(newPath) || !existsSync(legacyPath)) {
    return newPath;
  }
  // Fall back to legacy path for existing users
  return legacyPath;
}

/**
 * Initialize the database connection
 */
export function initDatabase(dbPath?: string): Database.Database {
  // Use auto-detected path if not specified
  const resolvedPath = dbPath || getDefaultDbPath();
  if (db) {
    return db;
  }

  const expandedPath = expandPath(resolvedPath);
  const dir = dirname(expandedPath);

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Store path for size monitoring
  currentDbPath = expandedPath;

  // Create database connection
  db = new Database(expandedPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  // Race condition mitigation: wait up to 10 seconds for locks
  db.pragma('busy_timeout = 10000');
  // Auto-checkpoint every 100 pages (~400KB) to prevent WAL bloat
  db.pragma('wal_autocheckpoint = 100');

  // Create lock file to help detect concurrent instances
  lockFilePath = expandedPath + '.lock';
  const pid = process.pid;
  try {
    writeFileSync(lockFilePath, `${pid}\n${new Date().toISOString()}`);
  } catch {
    // Non-fatal - lock file is advisory
  }

  // Register cleanup handlers for graceful shutdown
  registerShutdownHandlers();

  // Run migrations FIRST for existing databases
  // This ensures columns exist before schema tries to create indexes on them
  runMigrations(db);

  // Run schema (uses IF NOT EXISTS, safe for existing tables and indexes)
  const schemaPath = join(__dirname, 'schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  } else {
    // Inline schema if file not found (for bundled deployment)
    db.exec(getInlineSchema());
  }

  return db;
}

/**
 * Run database migrations for existing databases
 */
function runMigrations(database: Database.Database): void {
  // Check if memories table exists (skip migrations on fresh database)
  const tableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'"
  ).get();

  if (!tableExists) {
    // Fresh database - schema will create everything
    return;
  }

  // Check existing columns
  const tableInfo = database.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
  const columnNames = new Set(tableInfo.map(col => col.name));

  // Migration: decayed_score column
  if (!columnNames.has('decayed_score')) {
    database.exec('ALTER TABLE memories ADD COLUMN decayed_score REAL');
    database.exec('CREATE INDEX IF NOT EXISTS idx_memories_decayed_score ON memories(decayed_score DESC)');
  }

  // Migration: embedding column for semantic search
  if (!columnNames.has('embedding')) {
    database.exec('ALTER TABLE memories ADD COLUMN embedding BLOB');
  }

  // Migration: scope column for cross-project knowledge
  if (!columnNames.has('scope')) {
    database.exec("ALTER TABLE memories ADD COLUMN scope TEXT DEFAULT 'project'");
  }

  // Migration: transferable column for cross-project sharing
  if (!columnNames.has('transferable')) {
    database.exec('ALTER TABLE memories ADD COLUMN transferable INTEGER DEFAULT 0');
  }
}

/**
 * Get the current database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection with proper cleanup
 */
export function closeDatabase(): void {
  if (db) {
    try {
      // Checkpoint WAL before closing to flush all changes
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore checkpoint errors on close
    }
    db.close();
    db = null;
    currentDbPath = null;

    // Remove lock file
    if (lockFilePath && existsSync(lockFilePath)) {
      try {
        unlinkSync(lockFilePath);
      } catch {
        // Non-fatal
      }
      lockFilePath = null;
    }
  }
}

/**
 * Register handlers for graceful shutdown
 */
let shutdownRegistered = false;
function registerShutdownHandlers(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const cleanup = () => {
    closeDatabase();
  };

  // Handle various termination signals
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup();
    process.exit(1);
  });
}

/**
 * Manually checkpoint the WAL file (call periodically for long-running processes)
 */
export function checkpointWal(): { walPages: number; checkpointed: number } {
  const database = getDatabase();
  const result = database.pragma('wal_checkpoint(PASSIVE)') as { busy: number; log: number; checkpointed: number }[];
  return {
    walPages: result[0]?.log || 0,
    checkpointed: result[0]?.checkpointed || 0,
  };
}

/**
 * Check database file size for bloat prevention
 */
export interface DatabaseSizeInfo {
  size: number;
  sizeFormatted: string;
  warning: boolean;
  blocked: boolean;
  message: string;
}

export function checkDatabaseSize(): DatabaseSizeInfo {
  if (!currentDbPath || !existsSync(currentDbPath)) {
    return {
      size: 0,
      sizeFormatted: '0 KB',
      warning: false,
      blocked: false,
      message: 'Database not initialized',
    };
  }

  const stats = statSync(currentDbPath);
  const size = stats.size;
  const sizeKB = size / 1024;
  const sizeMB = sizeKB / 1024;

  let sizeFormatted: string;
  if (sizeMB >= 1) {
    sizeFormatted = `${sizeMB.toFixed(2)} MB`;
  } else {
    sizeFormatted = `${sizeKB.toFixed(2)} KB`;
  }

  const warning = size > WARN_DB_SIZE;
  const blocked = size > MAX_DB_SIZE;

  let message = `Database size: ${sizeFormatted}`;
  if (blocked) {
    message = `DATABASE BLOCKED: ${sizeFormatted} exceeds 100MB limit. Run consolidation and vacuum.`;
  } else if (warning) {
    message = `WARNING: ${sizeFormatted} approaching 100MB limit. Consider running consolidation.`;
  }

  return { size, sizeFormatted, warning, blocked, message };
}

/**
 * Check if database operations should be blocked due to size
 */
export function isDatabaseBlocked(): boolean {
  return checkDatabaseSize().blocked;
}

/**
 * Inline schema for bundled deployment
 */
function getInlineSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('short_term', 'long_term', 'episodic')),
      category TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      project TEXT,
      tags TEXT DEFAULT '[]',
      salience REAL DEFAULT 0.5 CHECK(salience >= 0 AND salience <= 1),
      decayed_score REAL,
      access_count INTEGER DEFAULT 0,
      last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT DEFAULT '{}',
      embedding BLOB,
      scope TEXT DEFAULT 'project',
      transferable INTEGER DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      title,
      content,
      tags,
      content='memories',
      content_rowid='id',
      tokenize='porter unicode61'
    );

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

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_salience ON memories(salience DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_decayed_score ON memories(decayed_score DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP,
      summary TEXT,
      memories_created INTEGER DEFAULT 0,
      memories_accessed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memory_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      strength REAL DEFAULT 0.5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    );
  `;
}

/**
 * Execute a function within a transaction (auto-commits on success, rollback on error)
 * Use this for batch operations that need atomicity
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase();
  return database.transaction(fn)();
}

/**
 * Execute a function within an IMMEDIATE transaction (acquires write lock immediately)
 * Use this for critical operations that must not conflict with concurrent writes
 */
export function withImmediateTransaction<T>(fn: () => T): T {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (e) {
    database.exec('ROLLBACK');
    throw e;
  }
}
