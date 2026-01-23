#!/usr/bin/env node
/**
 * Pre-compact hook for Claude Memory - Automatic Memory Extraction
 *
 * This script runs before context compaction and:
 * 1. Analyzes conversation content for important information
 * 2. Auto-extracts high-salience items (decisions, patterns, errors, etc.)
 * 3. Saves them to the memory database automatically
 * 4. Creates a session marker for continuity
 *
 * The goal: Never lose important context during compaction.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Database path (same as main memory system)
const DB_DIR = join(homedir(), '.claude-memory');
const DB_PATH = join(DB_DIR, 'memories.db');

// Salience threshold for auto-extraction (higher = more selective)
const AUTO_EXTRACT_THRESHOLD = 0.45;

// ==================== PROJECT DETECTION (Mirrors src/context/project-context.ts) ====================

/** Directories to skip when extracting project name from path */
const SKIP_DIRECTORIES = [
  'src', 'lib', 'dist', 'build', 'out',
  'node_modules', '.git', '.next', '.cache',
  'test', 'tests', '__tests__', 'spec',
  'bin', 'scripts', 'config', 'public', 'static',
];

/**
 * Extract project name from a file path.
 * Skips common directory names that don't represent projects.
 */
function extractProjectFromPath(path) {
  if (!path) return null;

  const segments = path.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return null;

  // Start from the end and find first non-skipped segment
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (!SKIP_DIRECTORIES.includes(segment.toLowerCase())) {
      // Skip hidden directories (starting with .)
      if (segment.startsWith('.')) continue;
      return segment;
    }
  }

  return null;
}

// Maximum memories to auto-create per compaction
const MAX_AUTO_MEMORIES = 5;

// ==================== SALIENCE DETECTION (Mirrors src/memory/salience.ts) ====================

const ARCHITECTURE_KEYWORDS = [
  'architecture', 'design', 'pattern', 'structure', 'system',
  'database', 'api', 'schema', 'model', 'framework', 'stack',
  'microservice', 'monolith', 'serverless', 'infrastructure'
];

const ERROR_KEYWORDS = [
  'error', 'bug', 'fix', 'issue', 'problem', 'crash', 'fail',
  'exception', 'debug', 'resolve', 'solution', 'workaround'
];

const PREFERENCE_KEYWORDS = [
  'prefer', 'always', 'never', 'style', 'convention', 'standard',
  'like', 'want', 'should', 'must', 'require'
];

const PATTERN_KEYWORDS = [
  'pattern', 'practice', 'approach', 'method', 'technique',
  'implementation', 'strategy', 'algorithm', 'workflow'
];

const DECISION_KEYWORDS = [
  'decided', 'decision', 'chose', 'chosen', 'selected', 'going with',
  'will use', 'opted for', 'settled on', 'agreed'
];

const LEARNING_KEYWORDS = [
  'learned', 'discovered', 'realized', 'found out', 'turns out',
  'TIL', 'now know', 'understand now', 'figured out'
];

const EMOTIONAL_MARKERS = [
  'important', 'critical', 'crucial', 'essential', 'key',
  'finally', 'breakthrough', 'eureka', 'aha', 'got it',
  'frustrating', 'annoying', 'tricky', 'remember'
];

const CODE_REFERENCE_PATTERNS = [
  /\b[A-Z][a-zA-Z]*\.[a-zA-Z]+\b/,
  /\b[a-z_][a-zA-Z0-9_]*\.(ts|js|py|go|rs)\b/,
  /`[^`]+`/,
  /\b(function|class|interface|type|const|let|var)\s+\w+/i,
  /\bline\s*\d+\b/i,
  /\b(src|lib|app|components?)\/\S+/,
];

function detectKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
}

function detectCodeReferences(content) {
  return CODE_REFERENCE_PATTERNS.some(pattern => pattern.test(content));
}

function detectExplicitRequest(text) {
  const patterns = [
    /\bremember\s+(this|that)\b/i,
    /\bdon'?t\s+forget\b/i,
    /\bkeep\s+(in\s+)?mind\b/i,
    /\bnote\s+(this|that)\b/i,
    /\bsave\s+(this|that)\b/i,
    /\bimportant[:\s]/i,
    /\bfor\s+future\s+reference\b/i,
  ];
  return patterns.some(pattern => pattern.test(text));
}

function calculateSalience(text) {
  let score = 0.25; // Base score

  if (detectExplicitRequest(text)) score += 0.5;
  if (detectKeywords(text, ARCHITECTURE_KEYWORDS)) score += 0.4;
  if (detectKeywords(text, ERROR_KEYWORDS)) score += 0.35;
  if (detectKeywords(text, DECISION_KEYWORDS)) score += 0.35;
  if (detectKeywords(text, LEARNING_KEYWORDS)) score += 0.3;
  if (detectKeywords(text, PATTERN_KEYWORDS)) score += 0.25;
  if (detectKeywords(text, PREFERENCE_KEYWORDS)) score += 0.25;
  if (detectCodeReferences(text)) score += 0.15;
  if (detectKeywords(text, EMOTIONAL_MARKERS)) score += 0.2;

  return Math.min(1.0, score);
}

function suggestCategory(text) {
  const lower = text.toLowerCase();

  if (detectKeywords(lower, ARCHITECTURE_KEYWORDS)) return 'architecture';
  if (detectKeywords(lower, ERROR_KEYWORDS)) return 'error';
  if (detectKeywords(lower, DECISION_KEYWORDS)) return 'context';
  if (detectKeywords(lower, LEARNING_KEYWORDS)) return 'learning';
  if (detectKeywords(lower, PREFERENCE_KEYWORDS)) return 'preference';
  if (detectKeywords(lower, PATTERN_KEYWORDS)) return 'pattern';
  if (/\b(todo|fixme|hack|xxx)\b/i.test(lower)) return 'todo';

  return 'note';
}

function extractTags(text) {
  const tags = new Set();

  // Extract hashtags
  const hashtagMatches = text.match(/#[a-zA-Z][a-zA-Z0-9_-]*/g);
  if (hashtagMatches) {
    hashtagMatches.forEach(tag => tags.add(tag.slice(1).toLowerCase()));
  }

  // Extract common tech terms
  const techTerms = [
    'react', 'vue', 'angular', 'node', 'python', 'typescript', 'javascript',
    'api', 'database', 'sql', 'mongodb', 'postgresql', 'mysql',
    'docker', 'kubernetes', 'aws', 'git', 'testing', 'auth', 'security'
  ];

  const lowerText = text.toLowerCase();
  techTerms.forEach(term => {
    if (lowerText.includes(term)) tags.add(term);
  });

  // Add auto-extracted tag
  tags.add('auto-extracted');

  return Array.from(tags).slice(0, 10);
}

// ==================== CONTENT EXTRACTION ====================

/**
 * Extract meaningful segments from conversation text
 * Looks for decisions, learnings, fixes, patterns, etc.
 */
function extractMemorableSegments(conversationText) {
  const segments = [];

  // Pattern matchers for different types of important content
  const extractors = [
    {
      name: 'decision',
      patterns: [
        /(?:we\s+)?decided\s+(?:to\s+)?(.{20,200})/gi,
        /(?:going|went)\s+with\s+(.{20,150})/gi,
        /(?:chose|chosen|selected)\s+(.{20,150})/gi,
        /the\s+(?:approach|solution|fix)\s+(?:is|was)\s+(.{20,200})/gi,
      ],
      titlePrefix: 'Decision: ',
    },
    {
      name: 'error-fix',
      patterns: [
        /(?:fixed|solved|resolved)\s+(?:by\s+)?(.{20,200})/gi,
        /the\s+(?:fix|solution|workaround)\s+(?:is|was)\s+(.{20,200})/gi,
        /(?:root\s+cause|issue)\s+(?:is|was)\s+(.{20,200})/gi,
        /(?:error|bug)\s+(?:was\s+)?caused\s+by\s+(.{20,200})/gi,
      ],
      titlePrefix: 'Fix: ',
    },
    {
      name: 'learning',
      patterns: [
        /(?:learned|discovered|realized|found\s+out)\s+(?:that\s+)?(.{20,200})/gi,
        /turns\s+out\s+(?:that\s+)?(.{20,200})/gi,
        /(?:TIL|today\s+I\s+learned)[:\s]+(.{20,200})/gi,
      ],
      titlePrefix: 'Learned: ',
    },
    {
      name: 'architecture',
      patterns: [
        /the\s+architecture\s+(?:is|uses|consists\s+of)\s+(.{20,200})/gi,
        /(?:design|pattern)\s+(?:is|uses)\s+(.{20,200})/gi,
        /(?:system|api|database)\s+(?:structure|design)\s+(?:is|uses)\s+(.{20,200})/gi,
      ],
      titlePrefix: 'Architecture: ',
    },
    {
      name: 'preference',
      patterns: [
        /(?:always|never)\s+(.{15,150})/gi,
        /(?:prefer|want)\s+to\s+(.{15,150})/gi,
        /(?:should|must)\s+(?:always\s+)?(.{15,150})/gi,
      ],
      titlePrefix: 'Preference: ',
    },
    {
      name: 'important-note',
      patterns: [
        /important[:\s]+(.{20,200})/gi,
        /(?:note|remember)[:\s]+(.{20,200})/gi,
        /(?:key|critical)\s+(?:point|thing)[:\s]+(.{20,200})/gi,
      ],
      titlePrefix: 'Note: ',
    },
  ];

  for (const extractor of extractors) {
    for (const pattern of extractor.patterns) {
      let match;
      while ((match = pattern.exec(conversationText)) !== null) {
        const content = match[1].trim();
        if (content.length >= 20) {
          // Generate a title from first ~50 chars
          const titleContent = content.slice(0, 50).replace(/\s+/g, ' ').trim();
          const title = extractor.titlePrefix + (titleContent.length < 50 ? titleContent : titleContent + '...');

          segments.push({
            title,
            content: content.slice(0, 500), // Cap content length
            extractorType: extractor.name,
          });
        }
      }
    }
  }

  return segments;
}

/**
 * Deduplicate and score segments
 */
function processSegments(segments) {
  // Remove near-duplicates (segments with >80% overlap)
  const unique = [];
  for (const seg of segments) {
    const isDupe = unique.some(existing => {
      const overlap = calculateOverlap(existing.content, seg.content);
      return overlap > 0.8;
    });
    if (!isDupe) {
      unique.push({
        ...seg,
        salience: calculateSalience(seg.title + ' ' + seg.content),
        category: suggestCategory(seg.title + ' ' + seg.content),
        tags: extractTags(seg.title + ' ' + seg.content),
      });
    }
  }

  // Sort by salience (highest first)
  unique.sort((a, b) => b.salience - a.salience);

  // Filter by threshold and limit
  return unique
    .filter(seg => seg.salience >= AUTO_EXTRACT_THRESHOLD)
    .slice(0, MAX_AUTO_MEMORIES);
}

/**
 * Simple overlap calculation (Jaccard similarity on words)
 */
function calculateOverlap(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ==================== DATABASE OPERATIONS ====================

function saveMemory(db, memory, project) {
  const timestamp = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO memories (title, content, type, category, salience, tags, project, created_at, last_accessed)
    VALUES (?, ?, 'short_term', ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    memory.title,
    memory.content,
    memory.category,
    memory.salience,
    JSON.stringify(memory.tags),
    project || null,
    timestamp,
    timestamp
  );
}

function createSessionMarker(db, trigger, project, autoExtractedCount) {
  const timestamp = new Date().toISOString();
  const title = `Session compaction (${trigger})`;
  const content = autoExtractedCount > 0
    ? `Context compaction at ${timestamp}. Auto-extracted ${autoExtractedCount} memories. Type: ${trigger}.`
    : `Context compaction at ${timestamp}. Type: ${trigger}. No auto-extractable content found.`;

  const stmt = db.prepare(`
    INSERT INTO memories (title, content, type, category, salience, tags, project, created_at, last_accessed)
    VALUES (?, ?, 'episodic', 'context', 0.3, ?, ?, ?, ?)
  `);

  stmt.run(title, content, JSON.stringify(['session', 'compaction', 'auto-extracted']), project || null, timestamp, timestamp);
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
    const trigger = hookData.trigger || 'unknown';
    const project = extractProjectFromPath(hookData.cwd);

    // Extract conversation text from hook data
    // Claude Code passes conversation in various formats
    const conversationText = extractConversationText(hookData);

    // Ensure database directory exists
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }

    // Check if database exists
    if (!existsSync(DB_PATH)) {
      console.error('[pre-compact] Memory database not found, skipping auto-extraction');
      outputReminder(0);
      process.exit(0);
    }

    // Connect to database
    const db = new Database(DB_PATH);

    let autoExtractedCount = 0;

    // Only attempt extraction if we have conversation content
    if (conversationText && conversationText.length > 100) {
      // Extract memorable segments
      const segments = extractMemorableSegments(conversationText);
      const processedSegments = processSegments(segments);

      // Save auto-extracted memories
      for (const memory of processedSegments) {
        try {
          saveMemory(db, memory, project);
          autoExtractedCount++;
          console.error(`[auto-extract] Saved: ${memory.title} (salience: ${memory.salience.toFixed(2)})`);
        } catch (err) {
          console.error(`[auto-extract] Failed to save "${memory.title}": ${err.message}`);
        }
      }
    }

    // Create session marker
    createSessionMarker(db, trigger, project, autoExtractedCount);

    db.close();

    console.error(`[claude-memory] Pre-compact complete: ${autoExtractedCount} memories auto-extracted`);

    outputReminder(autoExtractedCount);

    process.exit(0);
  } catch (error) {
    console.error(`[pre-compact] Error: ${error.message}`);
    outputReminder(0);
    process.exit(0); // Don't block compaction on errors
  }
});

/**
 * Extract conversation text from various hook data formats
 */
function extractConversationText(hookData) {
  // Try different possible locations for conversation content
  const sources = [
    hookData.conversation,
    hookData.messages,
    hookData.transcript,
    hookData.content,
    hookData.context,
    hookData.text,
  ];

  for (const source of sources) {
    if (typeof source === 'string' && source.length > 0) {
      return source;
    }
    if (Array.isArray(source)) {
      // If it's an array of messages, concatenate them
      return source
        .map(msg => {
          if (typeof msg === 'string') return msg;
          if (msg.content) return msg.content;
          if (msg.text) return msg.text;
          return '';
        })
        .join('\n');
    }
  }

  // If no specific field, try to stringify the whole object
  // (but exclude large binary/irrelevant fields)
  const { stdin, stdout, stderr, ...relevantData } = hookData;
  const fullText = JSON.stringify(relevantData);

  // Only return if it looks like it has useful content
  if (fullText.length > 200) {
    return fullText;
  }

  return '';
}

/**
 * Output reminder message to stdout
 */
function outputReminder(autoExtractedCount) {
  if (autoExtractedCount > 0) {
    console.log(`
🧠 AUTO-MEMORY: ${autoExtractedCount} important items were automatically saved before compaction.
After compaction, use 'get_context' to retrieve your memories.
`);
  } else {
    console.log(`
🧠 PRE-COMPACT: No auto-extractable content found with high enough salience.
If there's something important, use 'remember' to save it explicitly.
After compaction, use 'get_context' to retrieve your memories.
`);
  }
}
