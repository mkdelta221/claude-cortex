/**
 * Memory Store
 *
 * Core CRUD operations for the memory database.
 * Handles storage, retrieval, and management of memories.
 */

import { getDatabase } from '../database/init.js';
import {
  Memory,
  MemoryInput,
  MemoryType,
  MemoryCategory,
  SearchOptions,
  SearchResult,
  MemoryConfig,
  DEFAULT_CONFIG,
} from './types.js';
import {
  calculateSalience,
  suggestCategory,
  extractTags,
  analyzeSalienceFactors,
} from './salience.js';
import {
  calculateDecayedScore,
  calculateReinforcementBoost,
  calculatePriority,
} from './decay.js';
import {
  activateMemory as spreadActivation,
  getActivationBoost,
} from './activation.js';
import { jaccardSimilarity } from './similarity.js';
import {
  emitMemoryCreated,
  emitMemoryAccessed,
  emitMemoryDeleted,
  emitMemoryUpdated,
  persistEvent,
} from '../api/events.js';
import { generateEmbedding, cosineSimilarity } from '../embeddings/index.js';
import { isPaused } from '../api/control.js';

// Anti-bloat: Maximum content size per memory (10KB)
const MAX_CONTENT_SIZE = 10 * 1024;

// Track truncation info globally for the last addMemory call
let lastTruncationInfo: { wasTruncated: boolean; originalLength: number; truncatedLength: number } | null = null;

/**
 * Truncate content if it exceeds max size
 * Returns both the content and truncation info
 */
function truncateContent(content: string): { content: string; wasTruncated: boolean; originalLength: number } {
  const originalLength = content.length;
  if (originalLength > MAX_CONTENT_SIZE) {
    return {
      content: content.slice(0, MAX_CONTENT_SIZE) + '\n\n[Content truncated - exceeded 10KB limit]',
      wasTruncated: true,
      originalLength,
    };
  }
  return { content, wasTruncated: false, originalLength };
}

/**
 * Get truncation info from the last addMemory call
 */
export function getLastTruncationInfo() {
  return lastTruncationInfo;
}

/**
 * Escape FTS5 query to prevent syntax errors
 * FTS5 interprets:
 * - "word-word" as "column:value" syntax
 * - AND, OR, NOT as boolean operators
 * - &, | as boolean operators
 * We quote individual terms to search them literally
 */
function escapeFts5Query(query: string): string {
  // Split on whitespace, process each term, filter empty, rejoin
  return query
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => {
      // FTS5 boolean operators - quote them to search literally
      const upperTerm = term.toUpperCase();
      if (upperTerm === 'AND' || upperTerm === 'OR' || upperTerm === 'NOT') {
        return `"${term}"`;
      }
      // If term contains special FTS5 characters, quote it
      // Including: - : * ^ ( ) & | . and quotes
      if (/[-:*^()&|.]/.test(term) || term.includes('"')) {
        // Escape existing quotes and wrap in quotes
        return `"${term.replace(/"/g, '""')}"`;
      }
      return term;
    })
    .join(' ');
}

/**
 * Convert database row to Memory object
 */
export function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as number,
    type: row.type as MemoryType,
    category: row.category as MemoryCategory,
    title: row.title as string,
    content: row.content as string,
    project: row.project as string | undefined,
    tags: JSON.parse((row.tags as string) || '[]'),
    salience: row.salience as number,
    accessCount: row.access_count as number,
    lastAccessed: new Date(row.last_accessed as string),
    createdAt: new Date(row.created_at as string),
    decayedScore: (row.decayed_score as number) ?? (row.salience as number),
    metadata: JSON.parse((row.metadata as string) || '{}'),
    embedding: row.embedding as Buffer | undefined,
    scope: (row.scope as 'project' | 'global') ?? 'project',
    transferable: Boolean(row.transferable),
  };
}

/**
 * Detect if memory content suggests global applicability
 * Used to auto-set scope to 'global' for transferable knowledge
 */
function detectGlobalPattern(content: string, category: MemoryCategory, tags: string[]): boolean {
  const globalCategories: MemoryCategory[] = ['pattern', 'preference', 'learning'];
  const globalKeywords = ['always', 'never', 'best practice', 'general rule', 'universal'];
  const globalTags = ['universal', 'global', 'general', 'cross-project'];

  if (globalCategories.includes(category)) return true;
  if (globalKeywords.some(k => content.toLowerCase().includes(k))) return true;
  if (tags.some(t => globalTags.includes(t.toLowerCase()))) return true;

  return false;
}

/**
 * Error thrown when memory creation is paused
 */
export class MemoryPausedError extends Error {
  constructor() {
    super('Memory creation is currently paused. Use the dashboard to resume.');
    this.name = 'MemoryPausedError';
  }
}

/**
 * Add a new memory
 */
export function addMemory(
  input: MemoryInput,
  config: MemoryConfig = DEFAULT_CONFIG
): Memory {
  // Check if memory creation is paused
  if (isPaused()) {
    throw new MemoryPausedError();
  }

  const db = getDatabase();

  // Calculate salience if not provided
  const salience = input.salience ?? calculateSalience(input);

  // Suggest category if not provided
  const category = input.category ?? suggestCategory(input);

  // Extract tags
  const tags = extractTags(input);

  // Determine type
  const type = input.type ?? (salience >= config.consolidationThreshold ? 'long_term' : 'short_term');

  // Determine scope and transferable flag for cross-project knowledge
  const scope = input.scope ??
    (detectGlobalPattern(input.content, category, tags) ? 'global' : 'project');
  const transferable = input.transferable ?? (scope === 'global' ? 1 : 0);

  const stmt = db.prepare(`
    INSERT INTO memories (type, category, title, content, project, tags, salience, metadata, scope, transferable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Anti-bloat: Truncate content if too large
  const truncationResult = truncateContent(input.content);

  // Store truncation info for the remember tool to access
  lastTruncationInfo = {
    wasTruncated: truncationResult.wasTruncated,
    originalLength: truncationResult.originalLength,
    truncatedLength: truncationResult.content.length,
  };

  const result = stmt.run(
    type,
    category,
    input.title,
    truncationResult.content,
    input.project || null,
    JSON.stringify(tags),
    salience,
    JSON.stringify(input.metadata || {}),
    scope,
    transferable
  );

  const memory = getMemoryById(result.lastInsertRowid as number)!;

  // Emit event for real-time dashboard (in-process)
  emitMemoryCreated(memory);
  // Persist event for cross-process IPC (MCP → Dashboard)
  persistEvent('memory_created', { memory });

  // ORGANIC FEATURE: Auto-link to related memories
  // This builds the knowledge graph automatically as memories are created
  try {
    const relationships = detectRelationships(memory);
    for (const rel of relationships.slice(0, 3)) { // Top 3 most relevant
      createMemoryLink(memory.id, rel.targetId, rel.relationship, rel.strength);
    }
  } catch (e) {
    // Don't fail memory creation if linking fails
    console.error('[claude-cortex] Auto-link failed:', e);
  }

  // SEMANTIC SEARCH: Generate embedding asynchronously (don't block INSERT)
  const memoryId = memory.id;
  generateEmbedding(input.title + ' ' + truncationResult.content)
    .then(embedding => {
      try {
        db.prepare('UPDATE memories SET embedding = ? WHERE id = ?')
          .run(Buffer.from(embedding.buffer), memoryId);
      } catch (e) {
        console.error('[claude-cortex] Failed to store embedding:', e);
      }
    })
    .catch(e => {
      console.error('[claude-cortex] Failed to generate embedding:', e);
    });

  // Anti-bloat: Check if limits exceeded and trigger async cleanup
  // We use setImmediate to not block the insert response
  setImmediate(() => {
    try {
      const stats = getMemoryStats();
      if (
        stats.shortTerm > config.maxShortTermMemories ||
        stats.longTerm > config.maxLongTermMemories
      ) {
        // Import dynamically to avoid circular dependency
        import('./consolidate.js').then(({ enforceMemoryLimits }) => {
          enforceMemoryLimits(config);
        }).catch(() => {
          // Silently ignore - consolidation will happen on next scheduled run
        });
      }
    } catch {
      // Silently ignore errors in async cleanup
    }
  });

  return memory;
}

/**
 * Get a memory by ID
 */
export function getMemoryById(id: number): Memory | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToMemory(row);
}

/**
 * Update a memory
 */
export function updateMemory(
  id: number,
  updates: Partial<MemoryInput>
): Memory | null {
  const db = getDatabase();
  const existing = getMemoryById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.project !== undefined) {
    fields.push('project = ?');
    values.push(updates.project);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.salience !== undefined) {
    fields.push('salience = ?');
    values.push(updates.salience);
  }
  if (updates.metadata !== undefined) {
    fields.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updatedMemory = getMemoryById(id)!;

  // Emit event for real-time dashboard (in-process)
  emitMemoryUpdated(updatedMemory);
  // Persist event for cross-process IPC (MCP → Dashboard)
  persistEvent('memory_updated', { memory: updatedMemory });

  return updatedMemory;
}

/**
 * Delete a memory
 */
export function deleteMemory(id: number): boolean {
  const db = getDatabase();

  // Get memory before deletion for event
  const memory = getMemoryById(id);

  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);

  // Emit event for real-time dashboard (in-process)
  if (result.changes > 0 && memory) {
    emitMemoryDeleted(id, memory.title);
    // Persist event for cross-process IPC (MCP → Dashboard)
    persistEvent('memory_deleted', { memoryId: id, title: memory.title });
  }

  return result.changes > 0;
}

/**
 * Access a memory (updates access count and timestamp, returns reinforced memory)
 */
export function accessMemory(
  id: number,
  config: MemoryConfig = DEFAULT_CONFIG
): Memory | null {
  const db = getDatabase();
  const memory = getMemoryById(id);
  if (!memory) return null;

  // Calculate new salience with reinforcement
  const newSalience = calculateReinforcementBoost(memory, config);

  db.prepare(`
    UPDATE memories
    SET access_count = access_count + 1,
        last_accessed = CURRENT_TIMESTAMP,
        salience = ?
    WHERE id = ?
  `).run(newSalience, id);

  const updatedMemory = getMemoryById(id)!;

  // Emit event for real-time dashboard (in-process)
  emitMemoryAccessed(updatedMemory, newSalience);
  // Persist event for cross-process IPC (MCP → Dashboard)
  persistEvent('memory_accessed', { memoryId: id, memory: updatedMemory, newSalience });

  // ORGANIC FEATURE: Link strengthening on co-access
  // If memory A and B are both accessed within 5 minutes, strengthen their link
  // This mimics Hebbian learning: "neurons that fire together, wire together"
  try {
    const recentlyAccessed = db.prepare(`
      SELECT id FROM memories
      WHERE last_accessed > datetime('now', '-5 minutes')
        AND id != ?
      LIMIT 10
    `).all(id) as { id: number }[];

    for (const recent of recentlyAccessed) {
      // Check if link exists in either direction
      const existingLink = db.prepare(`
        SELECT id, strength FROM memory_links
        WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
      `).get(id, recent.id, recent.id, id) as { id: number; strength: number } | undefined;

      if (existingLink) {
        // Strengthen existing link (cap at 1.0)
        const newStrength = Math.min(1.0, existingLink.strength + 0.05);
        db.prepare('UPDATE memory_links SET strength = ? WHERE id = ?')
          .run(newStrength, existingLink.id);
      } else {
        // Create new weak link for co-accessed memories
        createMemoryLink(id, recent.id, 'related', 0.2);
      }
    }
  } catch (e) {
    // Don't fail memory access if link strengthening fails
    console.error('[claude-cortex] Link strengthening failed:', e);
  }

  // ORGANIC FEATURE: Spreading Activation (Phase 2)
  // Activate this memory and spread activation to linked memories
  // This makes related memories easier to recall in subsequent searches
  spreadActivation(id);

  return updatedMemory;
}

/**
 * Soft access - updates last_accessed without boosting salience
 * Used for search results to close the reinforcement loop
 * ORGANIC FEATURE: This allows searched memories to stay fresh without
 * artificially inflating their salience scores
 */
export function softAccessMemory(id: number): void {
  const db = getDatabase();
  db.prepare('UPDATE memories SET last_accessed = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

// ============================================
// ORGANIC FEATURE: Memory Enrichment (Phase 3)
// ============================================

// Enrichment configuration
const ENRICHMENT_SIMILARITY_THRESHOLD = 0.3; // Min similarity to trigger enrichment
const ENRICHMENT_COOLDOWN_HOURS = 1; // Don't enrich same memory within 1 hour
const MAX_ENRICHMENT_SIZE = 2000; // Max chars to add per enrichment

// Track last enrichment times (in-memory, ephemeral like activation cache)
const enrichmentTimestamps = new Map<number, number>();

/**
 * Enrichment result indicating what happened
 */
export interface EnrichmentResult {
  enriched: boolean;
  reason: string;
}

/**
 * Enrich a memory with additional context
 *
 * This adds timestamped context to a memory when:
 * 1. The new context is sufficiently related but different (new information)
 * 2. The memory hasn't been enriched recently (cooldown)
 * 3. The content won't exceed the size limit
 *
 * ORGANIC FEATURE: Memories grow with new context over time,
 * mimicking how human memories are reconsolidated with new information
 *
 * @param memoryId - ID of the memory to enrich
 * @param newContext - New context to add
 * @param contextType - Type of context ('search' | 'access' | 'related')
 * @returns EnrichmentResult indicating success or failure with reason
 */
export function enrichMemory(
  memoryId: number,
  newContext: string,
  contextType: 'search' | 'access' | 'related' = 'access'
): EnrichmentResult {
  const db = getDatabase();
  const memory = getMemoryById(memoryId);

  if (!memory) {
    return { enriched: false, reason: 'Memory not found' };
  }

  // Check cooldown
  const lastEnrichment = enrichmentTimestamps.get(memoryId);
  const now = Date.now();
  if (lastEnrichment && (now - lastEnrichment) < ENRICHMENT_COOLDOWN_HOURS * 60 * 60 * 1000) {
    return { enriched: false, reason: 'Enrichment cooldown active' };
  }

  // Check similarity - should be related but not too similar (new info)
  const similarity = jaccardSimilarity(memory.content, newContext);
  if (similarity > 0.8) {
    return { enriched: false, reason: 'Context too similar (no new information)' };
  }
  if (similarity < ENRICHMENT_SIMILARITY_THRESHOLD) {
    return { enriched: false, reason: 'Context not sufficiently related' };
  }

  // Truncate context if needed
  const truncatedContext = newContext.slice(0, MAX_ENRICHMENT_SIZE);

  // Build enrichment block with timestamp
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const enrichmentBlock = `\n\n---\n[${timestamp}] ${contextType}: ${truncatedContext}`;

  // Check size limit (leave 500 char buffer for future enrichments)
  const newContent = memory.content + enrichmentBlock;
  if (newContent.length > MAX_CONTENT_SIZE - 500) {
    return { enriched: false, reason: 'Content size limit reached' };
  }

  // Update memory
  db.prepare(`
    UPDATE memories
    SET content = ?,
        last_accessed = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newContent, memoryId);

  // Update cooldown timestamp
  enrichmentTimestamps.set(memoryId, now);

  // Emit update event for dashboard
  const updatedMemory = getMemoryById(memoryId)!;
  emitMemoryUpdated(updatedMemory);

  return { enriched: true, reason: `Added ${contextType} context (${truncatedContext.length} chars)` };
}

/**
 * Clear enrichment cooldown for a memory (for testing)
 */
export function clearEnrichmentCooldown(memoryId: number): void {
  enrichmentTimestamps.delete(memoryId);
}

/**
 * Get enrichment cooldown status for a memory
 */
export function getEnrichmentCooldownStatus(memoryId: number): {
  onCooldown: boolean;
  remainingMs: number;
} {
  const lastEnrichment = enrichmentTimestamps.get(memoryId);
  if (!lastEnrichment) {
    return { onCooldown: false, remainingMs: 0 };
  }

  const cooldownMs = ENRICHMENT_COOLDOWN_HOURS * 60 * 60 * 1000;
  const elapsed = Date.now() - lastEnrichment;
  const remaining = Math.max(0, cooldownMs - elapsed);

  return {
    onCooldown: remaining > 0,
    remainingMs: remaining,
  };
}

/**
 * Update persisted decay scores for all memories
 * Called during consolidation and periodically by the API server
 * Returns the number of memories updated
 */
export function updateDecayScores(): number {
  const db = getDatabase();

  // Get all memories
  const memories = db.prepare('SELECT * FROM memories').all() as Record<string, unknown>[];

  let updated = 0;
  const updateStmt = db.prepare('UPDATE memories SET decayed_score = ? WHERE id = ?');

  for (const row of memories) {
    const memory = rowToMemory(row);
    const decayedScore = calculateDecayedScore(memory);

    // Only update if score has changed significantly (saves writes)
    const currentScore = row.decayed_score as number | null;
    if (currentScore === null || Math.abs(currentScore - decayedScore) > 0.01) {
      updateStmt.run(decayedScore, memory.id);
      updated++;
    }
  }

  return updated;
}

/**
 * Detect the likely category a query is asking about
 */
function detectQueryCategory(query: string): MemoryCategory | null {
  const lower = query.toLowerCase();

  if (/architect|design|structure|pattern|system|schema|model/.test(lower)) {
    return 'architecture';
  }
  if (/error|bug|fix|issue|crash|exception|fail|problem/.test(lower)) {
    return 'error';
  }
  if (/prefer|always|never|style|convention|like|want/.test(lower)) {
    return 'preference';
  }
  if (/learn|discover|realiz|found\s+out|turns?\s+out/.test(lower)) {
    return 'learning';
  }
  if (/todo|task|pending|need\s+to|should\s+do/.test(lower)) {
    return 'todo';
  }
  if (/relation|depend|connect|link|reference/.test(lower)) {
    return 'relationship';
  }

  return null;
}

/**
 * Calculate a boost for memories linked to high-salience memories
 */
function calculateLinkBoost(memoryId: number, db: ReturnType<typeof getDatabase>): number {
  try {
    // Get linked memories and their salience
    const linked = db.prepare(`
      SELECT m.salience, ml.strength
      FROM memory_links ml
      JOIN memories m ON (m.id = ml.target_id OR m.id = ml.source_id)
      WHERE (ml.source_id = ? OR ml.target_id = ?)
        AND m.id != ?
    `).all(memoryId, memoryId, memoryId) as { salience: number; strength: number }[];

    if (linked.length === 0) return 0;

    // Calculate weighted average of linked memory salience
    const totalWeight = linked.reduce((sum, l) => sum + l.strength, 0);
    if (totalWeight === 0) return 0;

    const weightedSalience = linked.reduce(
      (sum, l) => sum + l.salience * l.strength,
      0
    ) / totalWeight;

    // Cap boost at 0.15
    return Math.min(0.15, weightedSalience * 0.2);
  } catch {
    return 0;
  }
}

/**
 * Calculate partial tag match score
 */
function calculateTagScore(queryTags: string[], memoryTags: string[]): number {
  if (queryTags.length === 0 || memoryTags.length === 0) return 0;

  // Count partial matches (substring matching)
  let matches = 0;
  for (const qt of queryTags) {
    const qtLower = qt.toLowerCase();
    if (memoryTags.some(mt => mt.toLowerCase().includes(qtLower) || qtLower.includes(mt.toLowerCase()))) {
      matches++;
    }
  }

  return (matches / queryTags.length) * 0.1;
}

/**
 * Extract potential tags from a query string
 */
function extractQueryTags(query: string): string[] {
  // Extract words that might be tags (tech terms, project-specific terms)
  const words = query.toLowerCase().split(/\s+/);
  return words.filter(w =>
    w.length > 2 &&
    /^[a-z][a-z0-9-]*$/.test(w) &&
    !['the', 'and', 'for', 'with', 'how', 'what', 'when', 'where', 'why'].includes(w)
  );
}

/**
 * Search memories by vector similarity
 * Returns memories sorted by cosine similarity to the query embedding
 */
function vectorSearch(
  queryEmbedding: Float32Array,
  limit: number,
  project?: string,
  includeGlobal: boolean = true
): Array<{ memory: Memory; similarity: number }> {
  const db = getDatabase();

  // Get memories with embeddings
  let query = `
    SELECT * FROM memories
    WHERE embedding IS NOT NULL
  `;
  const params: unknown[] = [];

  if (project && includeGlobal) {
    query += ` AND (project = ? OR scope = 'global')`;
    params.push(project);
  } else if (project) {
    query += ` AND project = ?`;
    params.push(project);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

  // Calculate similarities
  const results = rows
    .map(row => {
      const embeddingBuffer = row.embedding as Buffer;
      const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.length / 4);
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return {
        memory: rowToMemory(row),
        similarity,
      };
    })
    .filter(r => r.similarity > 0.3) // Threshold for relevance
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

/**
 * Search memories using full-text search, vector similarity, and filters
 * Now uses hybrid search combining FTS5 keywords with semantic vector matching
 */
export async function searchMemories(
  options: SearchOptions,
  config: MemoryConfig = DEFAULT_CONFIG
): Promise<SearchResult[]> {
  const db = getDatabase();
  const limit = options.limit || 20;
  const includeGlobal = options.includeGlobal ?? true;

  // Detect query category for boosting
  const detectedCategory = options.query ? detectQueryCategory(options.query) : null;
  const queryTags = options.query ? extractQueryTags(options.query) : [];

  // SEMANTIC SEARCH: Generate query embedding (may fail on first call while model loads)
  let queryEmbedding: Float32Array | null = null;
  let vectorResults: Map<number, number> = new Map(); // memoryId -> similarity
  if (options.query && options.query.trim()) {
    try {
      queryEmbedding = await generateEmbedding(options.query);
      const vectorHits = vectorSearch(queryEmbedding, limit * 2, options.project, includeGlobal);
      for (const hit of vectorHits) {
        vectorResults.set(hit.memory.id, hit.similarity);
      }
    } catch (e) {
      // Vector search unavailable - fall back to FTS only
      console.log('[claude-cortex] Vector search unavailable, using FTS only');
    }
  }

  let sql: string;
  const params: unknown[] = [];

  if (options.query && options.query.trim()) {
    // Use FTS search - escape query to prevent FTS5 syntax errors
    // FTS5 interprets "word-word" as "column:value", so we quote terms
    const escapedQuery = escapeFts5Query(options.query.trim());
    sql = `
      SELECT m.*, fts.rank
      FROM memories m
      JOIN memories_fts fts ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
    `;
    params.push(escapedQuery);
  } else {
    // No query, just filter
    sql = `SELECT *, 0 as rank FROM memories m WHERE 1=1`;
  }

  // Add filters - include global memories if enabled
  if (options.project) {
    if (includeGlobal) {
      sql += ` AND (m.project = ? OR m.scope = 'global')`;
    } else {
      sql += ' AND m.project = ?';
    }
    params.push(options.project);
  }
  if (options.category) {
    sql += ' AND m.category = ?';
    params.push(options.category);
  }
  if (options.type) {
    sql += ' AND m.type = ?';
    params.push(options.type);
  }
  if (options.minSalience) {
    sql += ' AND m.salience >= ?';
    params.push(options.minSalience);
  }
  if (options.tags && options.tags.length > 0) {
    // Use json_each() for proper JSON array parsing
    // This avoids false positives from LIKE matching (e.g., "api" matching "api-gateway")
    const tagPlaceholders = options.tags.map(() => '?').join(',');
    sql += ` AND EXISTS (
      SELECT 1 FROM json_each(m.tags)
      WHERE json_each.value IN (${tagPlaceholders})
    )`;
    params.push(...options.tags);
  }

  sql += ' ORDER BY m.salience DESC, m.last_accessed DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

  // Convert to SearchResult with computed scores
  const results: SearchResult[] = rows.map(row => {
    const memory = rowToMemory(row);
    const decayedScore = calculateDecayedScore(memory, config);
    memory.decayedScore = decayedScore;

    // Improved FTS score normalization (BM25-style)
    // FTS5 rank is negative, closer to 0 = better match
    const rawRank = row.rank as number;
    const ftsScore = rawRank ? 1 / (1 + Math.abs(rawRank)) : 0.3;

    // Recency boost for recently accessed memories
    const hoursSinceAccess = (Date.now() - new Date(memory.lastAccessed).getTime()) / (1000 * 60 * 60);
    const recencyBoost = hoursSinceAccess < 1 ? 0.1 : (hoursSinceAccess < 24 ? 0.05 : 0);

    // Category match bonus
    const categoryBoost = detectedCategory && memory.category === detectedCategory ? 0.1 : 0;

    // Link boost - memories connected to high-salience memories rank higher
    const linkBoost = calculateLinkBoost(memory.id, db);

    // Partial tag match bonus
    const tagBoost = calculateTagScore(queryTags, memory.tags);

    // ORGANIC FEATURE: Spreading Activation boost (Phase 2)
    // Recently accessed memories and their linked neighbors get a boost
    const activationBoost = getActivationBoost(memory.id);

    // SEMANTIC SEARCH: Vector similarity boost (Phase 5)
    // If memory was found by vector search, add similarity as a boost
    const vectorSimilarity = vectorResults.get(memory.id) || 0;
    const vectorBoost = vectorSimilarity * 0.3; // 30% weight for vector similarity

    // Combined relevance score (adjusted weights to accommodate vector)
    const relevanceScore = (
      ftsScore * 0.3 +           // Reduced from 0.35
      vectorBoost +              // New: 0-0.3 from vector similarity
      decayedScore * 0.25 +      // Reduced from 0.35
      calculatePriority(memory) * 0.1 +  // Reduced from 0.15
      recencyBoost + categoryBoost + linkBoost + tagBoost + activationBoost
    );

    return { memory, relevanceScore };
  });

  // Sort by relevance and filter out too-decayed memories
  const sortedResults = results
    .filter(r => options.includeDecayed || r.memory.decayedScore >= config.salienceThreshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  // ORGANIC FEATURE: Soft-access top results to reinforce useful memories
  // This closes the reinforcement loop - memories that appear in searches stay fresh
  // We only soft-access (update last_accessed, no salience boost) to avoid inflation
  for (const result of sortedResults.slice(0, 5)) {
    softAccessMemory(result.memory.id);
  }

  return sortedResults;
}

/**
 * Get all memories for a project
 */
export function getProjectMemories(
  project: string,
  config: MemoryConfig = DEFAULT_CONFIG
): Memory[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM memories
    WHERE project = ?
    ORDER BY salience DESC, last_accessed DESC
  `).all(project) as Record<string, unknown>[];

  return rows.map(row => {
    const memory = rowToMemory(row);
    memory.decayedScore = calculateDecayedScore(memory, config);
    return memory;
  });
}

/**
 * Get recent memories
 */
export function getRecentMemories(
  limit: number = 10,
  project?: string
): Memory[] {
  const db = getDatabase();
  let sql = 'SELECT * FROM memories';
  const params: unknown[] = [];

  if (project) {
    sql += ' WHERE project = ?';
    params.push(project);
  }

  sql += ' ORDER BY last_accessed DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToMemory);
}

/**
 * Get memories by type
 */
export function getMemoriesByType(
  type: MemoryType,
  limit: number = 50
): Memory[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM memories
    WHERE type = ?
    ORDER BY salience DESC, last_accessed DESC
    LIMIT ?
  `).all(type, limit) as Record<string, unknown>[];

  return rows.map(rowToMemory);
}

/**
 * Get high-priority memories (for context injection)
 */
export function getHighPriorityMemories(
  limit: number = 10,
  project?: string
): Memory[] {
  const db = getDatabase();
  let sql = `
    SELECT * FROM memories
    WHERE salience >= 0.6
  `;
  const params: unknown[] = [];

  if (project) {
    sql += ' AND project = ?';
    params.push(project);
  }

  sql += ' ORDER BY salience DESC, last_accessed DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToMemory);
}

/**
 * Promote a memory from short-term to long-term
 */
export function promoteMemory(id: number): Memory | null {
  const db = getDatabase();
  db.prepare(`
    UPDATE memories
    SET type = 'long_term'
    WHERE id = ? AND type = 'short_term'
  `).run(id);

  return getMemoryById(id);
}

/**
 * Bulk delete decayed memories
 */
export function cleanupDecayedMemories(
  config: MemoryConfig = DEFAULT_CONFIG
): number {
  const db = getDatabase();

  // Get all short-term memories and check decay
  const shortTerm = getMemoriesByType('short_term', 1000);
  const toDelete: number[] = [];

  for (const memory of shortTerm) {
    const decayedScore = calculateDecayedScore(memory, config);
    if (decayedScore < config.salienceThreshold) {
      toDelete.push(memory.id);
    }
  }

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...toDelete);
  }

  return toDelete.length;
}

/**
 * Get memory statistics
 */
export function getMemoryStats(project?: string): {
  total: number;
  shortTerm: number;
  longTerm: number;
  episodic: number;
  byCategory: Record<string, number>;
  averageSalience: number;
} {
  const db = getDatabase();

  let whereClause = '';
  const params: unknown[] = [];
  if (project) {
    whereClause = 'WHERE project = ?';
    params.push(project);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM memories ${whereClause}`).get(...params) as { count: number }).count;

  const shortTerm = (db.prepare(`SELECT COUNT(*) as count FROM memories ${whereClause} ${whereClause ? 'AND' : 'WHERE'} type = 'short_term'`).get(...params) as { count: number }).count;

  const longTerm = (db.prepare(`SELECT COUNT(*) as count FROM memories ${whereClause} ${whereClause ? 'AND' : 'WHERE'} type = 'long_term'`).get(...params) as { count: number }).count;

  const episodic = (db.prepare(`SELECT COUNT(*) as count FROM memories ${whereClause} ${whereClause ? 'AND' : 'WHERE'} type = 'episodic'`).get(...params) as { count: number }).count;

  const avgResult = db.prepare(`SELECT AVG(salience) as avg FROM memories ${whereClause}`).get(...params) as { avg: number | null };
  const averageSalience = avgResult.avg || 0;

  // Get counts by category
  const categoryRows = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM memories ${whereClause}
    GROUP BY category
  `).all(...params) as { category: string; count: number }[];

  const byCategory: Record<string, number> = {};
  for (const row of categoryRows) {
    byCategory[row.category] = row.count;
  }

  return {
    total,
    shortTerm,
    longTerm,
    episodic,
    byCategory,
    averageSalience,
  };
}

// ============================================================================
// MEMORY RELATIONSHIPS (LINKS)
// ============================================================================

export type RelationshipType = 'references' | 'extends' | 'contradicts' | 'related';

export interface MemoryLink {
  id: number;
  sourceId: number;
  targetId: number;
  relationship: RelationshipType;
  strength: number;
  createdAt: Date;
}

/**
 * Create a link between two memories
 */
export function createMemoryLink(
  sourceId: number,
  targetId: number,
  relationship: RelationshipType,
  strength: number = 0.5
): MemoryLink | null {
  const db = getDatabase();

  // Verify both memories exist
  const source = getMemoryById(sourceId);
  const target = getMemoryById(targetId);
  if (!source || !target) return null;

  // Prevent self-links
  if (sourceId === targetId) return null;

  try {
    const result = db.prepare(`
      INSERT INTO memory_links (source_id, target_id, relationship, strength)
      VALUES (?, ?, ?, ?)
    `).run(sourceId, targetId, relationship, strength);

    return {
      id: result.lastInsertRowid as number,
      sourceId,
      targetId,
      relationship,
      strength,
      createdAt: new Date(),
    };
  } catch {
    // Link already exists (UNIQUE constraint)
    return null;
  }
}

/**
 * Get all memories related to a given memory
 */
export function getRelatedMemories(memoryId: number): {
  memory: Memory;
  relationship: RelationshipType;
  strength: number;
  direction: 'outgoing' | 'incoming';
}[] {
  const db = getDatabase();

  // Get outgoing links (this memory references others)
  const outgoing = db.prepare(`
    SELECT m.*, ml.relationship, ml.strength
    FROM memory_links ml
    JOIN memories m ON m.id = ml.target_id
    WHERE ml.source_id = ?
  `).all(memoryId) as (Record<string, unknown> & { relationship: string; strength: number })[];

  // Get incoming links (other memories reference this one)
  const incoming = db.prepare(`
    SELECT m.*, ml.relationship, ml.strength
    FROM memory_links ml
    JOIN memories m ON m.id = ml.source_id
    WHERE ml.target_id = ?
  `).all(memoryId) as (Record<string, unknown> & { relationship: string; strength: number })[];

  const results: {
    memory: Memory;
    relationship: RelationshipType;
    strength: number;
    direction: 'outgoing' | 'incoming';
  }[] = [];

  for (const row of outgoing) {
    results.push({
      memory: rowToMemory(row),
      relationship: row.relationship as RelationshipType,
      strength: row.strength,
      direction: 'outgoing',
    });
  }

  for (const row of incoming) {
    results.push({
      memory: rowToMemory(row),
      relationship: row.relationship as RelationshipType,
      strength: row.strength,
      direction: 'incoming',
    });
  }

  return results;
}

/**
 * Delete a memory link
 */
export function deleteMemoryLink(sourceId: number, targetId: number): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM memory_links WHERE source_id = ? AND target_id = ?
  `).run(sourceId, targetId);
  return result.changes > 0;
}

/**
 * Get all memory links
 */
export function getAllMemoryLinks(): MemoryLink[] {
  const db = getDatabase();
  const rows = db.prepare(`SELECT * FROM memory_links ORDER BY created_at DESC`).all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as number,
    sourceId: row.source_id as number,
    targetId: row.target_id as number,
    relationship: row.relationship as RelationshipType,
    strength: row.strength as number,
    createdAt: new Date(row.created_at as string),
  }));
}

/**
 * Detect tag-based links for a memory.
 * Finds memories sharing tags and scores by overlap count.
 */
function detectTagLinks(
  db: ReturnType<typeof getDatabase>,
  memory: Memory,
  maxResults: number
): { targetId: number; relationship: RelationshipType; strength: number }[] {
  const results: { targetId: number; relationship: RelationshipType; strength: number }[] = [];

  if (memory.tags.length > 0) {
    const tagPlaceholders = memory.tags.map(() => '?').join(',');
    const tagMatches = db.prepare(`
      SELECT DISTINCT m.id, m.tags
      FROM memories m, json_each(m.tags)
      WHERE json_each.value IN (${tagPlaceholders})
        AND m.id != ?
      LIMIT ?
    `).all(...memory.tags, memory.id, maxResults) as { id: number; tags: string }[];

    for (const match of tagMatches) {
      const matchTags = JSON.parse(match.tags) as string[];
      const sharedCount = memory.tags.filter(t => matchTags.includes(t)).length;
      const strength = Math.min(0.9, 0.3 + (sharedCount * 0.2));
      results.push({ targetId: match.id, relationship: 'related', strength });
    }
  }

  return results;
}

/**
 * Detect embedding-based semantic links for a memory.
 * Computes cosine similarity against top memories that have embeddings.
 */
function detectEmbeddingLinks(
  db: ReturnType<typeof getDatabase>,
  memory: Memory,
  maxResults: number
): { targetId: number; relationship: RelationshipType; strength: number }[] {
  if (!memory.embedding) return [];

  const candidates = db.prepare(`
    SELECT id, embedding FROM memories
    WHERE embedding IS NOT NULL AND id != ?
    ORDER BY decayed_score DESC
    LIMIT 100
  `).all(memory.id) as { id: number; embedding: Buffer }[];

  const results: { targetId: number; relationship: RelationshipType; strength: number }[] = [];
  const sourceEmbedding = new Float32Array(memory.embedding.buffer, memory.embedding.byteOffset, memory.embedding.byteLength / 4);

  for (const candidate of candidates) {
    const candidateEmbedding = new Float32Array(candidate.embedding.buffer, candidate.embedding.byteOffset, candidate.embedding.byteLength / 4);
    const similarity = cosineSimilarity(sourceEmbedding, candidateEmbedding);
    if (similarity >= 0.6) {
      results.push({
        targetId: candidate.id,
        relationship: 'related',
        strength: Math.min(0.9, similarity),
      });
    }
  }

  return results;
}

/**
 * Detect content-based links using FTS5 and Jaccard similarity.
 * Fallback when embeddings are not available.
 */
function detectFtsLinks(
  db: ReturnType<typeof getDatabase>,
  memory: Memory,
  maxResults: number
): { targetId: number; relationship: RelationshipType; strength: number }[] {
  const queryText = `${memory.title} ${memory.content.slice(0, 200)}`;
  const escapedQuery = escapeFts5Query(queryText);
  if (!escapedQuery.trim()) return [];

  let ftsMatches: { id: number; title: string; content: string }[];
  try {
    ftsMatches = db.prepare(`
      SELECT m.id, m.title, m.content
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
        AND m.id != ?
      LIMIT ?
    `).all(escapedQuery, memory.id, maxResults * 2) as { id: number; title: string; content: string }[];
  } catch {
    return [];
  }

  const results: { targetId: number; relationship: RelationshipType; strength: number }[] = [];
  for (const match of ftsMatches) {
    const matchText = `${match.title} ${match.content.slice(0, 200)}`;
    const sim = jaccardSimilarity(queryText, matchText);
    if (sim >= 0.3) {
      results.push({
        targetId: match.id,
        relationship: 'related',
        strength: Math.min(0.7, sim + 0.2),
      });
    }
  }

  return results;
}

/**
 * Detect potential relationships for a new memory
 * Uses three strategies in priority order:
 * 1. Tag-based linking (shared tags)
 * 2. Embedding-based semantic linking (cosine similarity >= 0.6)
 * 3. FTS content similarity fallback (Jaccard similarity >= 0.3)
 */
export function detectRelationships(
  memory: Memory,
  maxResults: number = 5
): { targetId: number; relationship: RelationshipType; strength: number }[] {
  const db = getDatabase();
  const seen = new Set<number>();
  const results: { targetId: number; relationship: RelationshipType; strength: number }[] = [];

  function addResults(links: { targetId: number; relationship: RelationshipType; strength: number }[]) {
    for (const link of links) {
      if (!seen.has(link.targetId)) {
        seen.add(link.targetId);
        results.push(link);
      }
    }
  }

  // 1. Tag-based linking
  addResults(detectTagLinks(db, memory, maxResults));

  // 2. Embedding-based semantic linking
  addResults(detectEmbeddingLinks(db, memory, maxResults));

  // 3. FTS content similarity fallback (when no embeddings)
  if (!memory.embedding) {
    addResults(detectFtsLinks(db, memory, maxResults));
  }

  // Sort by strength descending and limit
  return results
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxResults);
}
