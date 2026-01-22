#!/usr/bin/env node
/**
 * Pre-compact hook for Claude Memory
 *
 * This script runs before context compaction and:
 * 1. Creates a session marker in the memory database
 * 2. Outputs a reminder message for Claude
 *
 * The session marker ensures continuity across compaction events.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Database path (same as main memory system)
const DB_DIR = join(homedir(), '.claude-memory');
const DB_PATH = join(DB_DIR, 'memories.db');

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    input += chunk;
  }
});

process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input || '{}');
    const trigger = hookData.trigger || 'unknown';
    const timestamp = new Date().toISOString();

    // Ensure database directory exists
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }

    // Check if database exists
    if (!existsSync(DB_PATH)) {
      console.error('[pre-compact] Memory database not found, skipping marker');
      process.exit(0);
    }

    // Connect to database
    const db = new Database(DB_PATH);

    // Create a session marker memory
    const title = `Session compaction (${trigger})`;
    const content = `Context compaction triggered at ${timestamp}. Type: ${trigger}. Any important context from before this point should be in stored memories.`;

    // Insert the marker as an episodic memory
    // FTS index is updated automatically via trigger
    const stmt = db.prepare(`
      INSERT INTO memories (title, content, type, category, salience, tags, project, created_at, last_accessed)
      VALUES (?, ?, 'episodic', 'context', 0.3, '["session", "compaction"]', ?, ?, ?)
    `);

    stmt.run(title, content, hookData.cwd || null, timestamp, timestamp);

    db.close();

    // Output reminder to stderr (shown to Claude with exit 2, but we use 0 to not block)
    console.error(`[claude-memory] Session marker created: ${title}`);

    // Output context reminder to stdout
    console.log(`
🧠 PRE-COMPACT REMINDER: Before compaction completes, save important context using 'remember'.
After compaction, use 'get_context' to retrieve your memories.
`);

    process.exit(0);
  } catch (error) {
    console.error(`[pre-compact] Error: ${error.message}`);
    process.exit(0); // Don't block compaction on errors
  }
});
