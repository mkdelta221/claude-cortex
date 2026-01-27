#!/usr/bin/env node
/**
 * Session Start Hook for Claude Memory - Auto-Recall Context
 *
 * This script runs when Claude Code starts a new session and:
 * 1. Detects the current project from the working directory
 * 2. Retrieves relevant context from memory
 * 3. Outputs it so Claude has immediate access to project knowledge
 *
 * The goal: Claude always starts with relevant project context.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Database paths (with legacy fallback)
const NEW_DB_DIR = join(homedir(), '.claude-cortex');
const LEGACY_DB_DIR = join(homedir(), '.claude-memory');

// Auto-detect: use new path if it exists, or if legacy doesn't exist (new install)
function getDbPath() {
  const newPath = join(NEW_DB_DIR, 'memories.db');
  const legacyPath = join(LEGACY_DB_DIR, 'memories.db');
  if (existsSync(newPath) || !existsSync(legacyPath)) {
    return { dir: NEW_DB_DIR, path: newPath };
  }
  return { dir: LEGACY_DB_DIR, path: legacyPath };
}

const { dir: DB_DIR, path: DB_PATH } = getDbPath();

// Configuration
const MAX_CONTEXT_MEMORIES = 15;
const MIN_SALIENCE_THRESHOLD = 0.3;

// ==================== PROJECT DETECTION (Mirrors src/context/project-context.ts) ====================

const SKIP_DIRECTORIES = [
  'src', 'lib', 'dist', 'build', 'out',
  'node_modules', '.git', '.next', '.cache',
  'test', 'tests', '__tests__', 'spec',
  'bin', 'scripts', 'config', 'public', 'static',
];

function extractProjectFromPath(path) {
  if (!path) return null;

  const segments = path.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return null;

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (!SKIP_DIRECTORIES.includes(segment.toLowerCase())) {
      if (segment.startsWith('.')) continue;
      return segment;
    }
  }

  return null;
}

// ==================== CONTEXT RETRIEVAL ====================

function getProjectContext(db, project) {
  const memories = [];

  // Get high-priority memories for this project
  const highPriority = db.prepare(`
    SELECT id, title, content, category, type, salience, tags, created_at
    FROM memories
    WHERE (project = ? OR project IS NULL)
      AND salience >= ?
      AND type IN ('long_term', 'episodic')
    ORDER BY salience DESC, last_accessed DESC
    LIMIT ?
  `).all(project, MIN_SALIENCE_THRESHOLD, MAX_CONTEXT_MEMORIES);

  memories.push(...highPriority);

  // If we don't have enough, get recent memories too
  if (memories.length < 5) {
    const recent = db.prepare(`
      SELECT id, title, content, category, type, salience, tags, created_at
      FROM memories
      WHERE (project = ? OR project IS NULL)
        AND id NOT IN (${memories.map(m => m.id).join(',') || '0'})
      ORDER BY created_at DESC
      LIMIT ?
    `).all(project, 5 - memories.length);

    memories.push(...recent);
  }

  return memories;
}

function formatContext(memories, project) {
  if (memories.length === 0) {
    return null;
  }

  const lines = [
    `# Project Context: ${project}`,
    '',
  ];

  // Group by category
  const byCategory = {};
  for (const mem of memories) {
    const cat = mem.category || 'note';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(mem);
  }

  // Priority order for categories
  const categoryOrder = ['architecture', 'pattern', 'preference', 'error', 'context', 'learning', 'note', 'todo'];

  for (const cat of categoryOrder) {
    if (!byCategory[cat] || byCategory[cat].length === 0) continue;

    const categoryTitle = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`## ${categoryTitle}`);

    for (const mem of byCategory[cat]) {
      const salience = Math.round(mem.salience * 100);
      lines.push(`- **${mem.title}** (${salience}% salience)`);
      // Truncate long content
      const content = mem.content.length > 200
        ? mem.content.slice(0, 200) + '...'
        : mem.content;
      lines.push(`  ${content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ==================== MAIN HOOK LOGIC ====================

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
    const project = extractProjectFromPath(hookData.cwd || process.cwd());

    if (!project) {
      // No project detected, skip context retrieval
      process.exit(0);
    }

    // Check if database exists
    if (!existsSync(DB_PATH)) {
      console.error('[session-start] Memory database not found, skipping context retrieval');
      process.exit(0);
    }

    // Connect to database (read-only to avoid contention)
    // timeout: 5000ms to handle busy database during concurrent access
    const db = new Database(DB_PATH, { readonly: true, timeout: 5000 });

    // Get project context
    const memories = getProjectContext(db, project);
    const context = formatContext(memories, project);

    db.close();

    if (context) {
      // Output context to stdout - this will be shown to Claude
      console.log(`
🧠 CLAUDE MEMORY - Auto-loaded context for project "${project}"

${context}

---
Use \`recall\` to search for specific memories, or \`remember\` to save new ones.
`);
      console.error(`[claude-cortex] Session start: loaded ${memories.length} memories for "${project}"`);
    } else {
      console.log(`
🧠 CLAUDE MEMORY - No stored context for project "${project}"

This appears to be a new project. Use \`remember\` to save important information.
`);
      console.error(`[claude-cortex] Session start: no memories found for "${project}"`);
    }

    process.exit(0);
  } catch (error) {
    console.error(`[session-start] Error: ${error.message}`);
    process.exit(0); // Don't block session start on errors
  }
});
