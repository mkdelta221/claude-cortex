/**
 * Memory Consolidation System
 *
 * Like sleep consolidation in human brains, this system:
 * - Moves worthy short-term memories to long-term storage
 * - Strengthens frequently accessed memories
 * - Cleans up decayed/irrelevant memories
 * - Merges similar memories to reduce redundancy
 */

import { getDatabase, withTransaction } from '../database/init.js';
import {
  Memory,
  MemoryConfig,
  DEFAULT_CONFIG,
  ConsolidationResult,
  ContextSummary,
} from './types.js';
import {
  getMemoriesByType,
  getRecentMemories,
  getHighPriorityMemories,
  promoteMemory,
  deleteMemory,
  searchMemories,
  getMemoryStats,
  updateDecayScores,
} from './store.js';
import {
  calculateDecayedScore,
  shouldPromoteToLongTerm,
  shouldPromoteEpisodic,
  shouldDelete,
  processDecay,
} from './decay.js';
import {
  detectContradictions,
  linkContradictions,
} from './contradiction.js';
import { jaccardSimilarity } from './similarity.js';

/**
 * Run full consolidation process
 * This is like the brain's sleep consolidation - should be run periodically
 */
export function consolidate(
  config: MemoryConfig = DEFAULT_CONFIG
): ConsolidationResult {
  // Wrap entire consolidation in a transaction for atomicity
  return withTransaction(() => {
    const db = getDatabase();
    let consolidated = 0;
    let decayed = 0;
    let deleted = 0;

    // Get all short-term memories
    const shortTermMemories = getMemoriesByType('short_term', config.maxShortTermMemories * 2);

    // Process decay for all memories
    const { toDelete, toPromote, updated } = processDecay(shortTermMemories, config);

    // Promote worthy memories
    for (const id of toPromote) {
      promoteMemory(id);
      consolidated++;
    }

    // Delete decayed memories (excluding those just promoted)
    for (const id of toDelete) {
      if (!toPromote.includes(id)) {
        deleteMemory(id);
        deleted++;
      }
    }

    // Update decayed scores in database
    const updateStmt = db.prepare('UPDATE memories SET salience = ? WHERE id = ?');
    for (const [id, score] of updated) {
      if (!toDelete.includes(id)) {
        updateStmt.run(score, id);
        decayed++;
      }
    }

    // Enforce memory limits
    deleted += enforceMemoryLimits(config);

    // Persist updated decay scores for efficient sorting
    updateDecayScores();

    // Evolve salience based on structural importance
    let salienceEvolved = 0;
    try {
      salienceEvolved = evolveSalience(db);
    } catch (e) {
      console.error('[claude-cortex] Salience evolution failed:', e);
    }

    // ORGANIC FEATURE: Contradiction Detection (Phase 3)
    // Detect and link contradicting memories during consolidation
    let contradictionsFound = 0;
    let contradictionsLinked = 0;

    try {
      const contradictions = detectContradictions({ minScore: 0.5, limit: 50 });
      contradictionsFound = contradictions.length;
      contradictionsLinked = linkContradictions(contradictions);
    } catch (e) {
      console.error('[claude-cortex] Contradiction detection failed:', e);
    }

    return { consolidated, decayed, deleted, contradictionsFound, contradictionsLinked, salienceEvolved };
  });
}

/**
 * Adjust salience based on structural importance (link count, contradiction status).
 * Called during consolidation.
 */
function evolveSalience(db: any): number {
  let updated = 0;

  // Boost highly-linked memories (hub bonus)
  const hubs = db.prepare(`
    SELECT m.id, m.salience,
      (SELECT COUNT(*) FROM memory_links WHERE source_id = m.id OR target_id = m.id) as link_count
    FROM memories m
    WHERE m.type IN ('long_term', 'episodic')
  `).all() as { id: number; salience: number; link_count: number }[];

  for (const hub of hubs) {
    if (hub.link_count < 2) continue;
    const linkBonus = Math.min(0.1, Math.log2(hub.link_count) * 0.03);
    const newSalience = Math.min(1.0, hub.salience + linkBonus);
    if (newSalience > hub.salience) {
      db.prepare('UPDATE memories SET salience = ? WHERE id = ?').run(newSalience, hub.id);
      updated++;
    }
  }

  // Penalize contradicted memories slightly (both sides)
  const contradicted = db.prepare(`
    SELECT DISTINCT source_id, target_id
    FROM memory_links
    WHERE relationship = 'contradicts'
  `).all() as { source_id: number; target_id: number }[];

  for (const pair of contradicted) {
    for (const id of [pair.source_id, pair.target_id]) {
      const mem = db.prepare('SELECT salience FROM memories WHERE id = ?').get(id) as any;
      if (mem && mem.salience > 0.3) {
        db.prepare('UPDATE memories SET salience = ? WHERE id = ?')
          .run(mem.salience - 0.02, id);
        updated++;
      }
    }
  }

  return updated;
}

/**
 * Enforce maximum memory limits
 * Removes lowest-priority memories when limits are exceeded
 */
export function enforceMemoryLimits(config: MemoryConfig = DEFAULT_CONFIG): number {
  // Note: If called within consolidate(), this is already in a transaction
  // If called standalone, we wrap it for safety
  const db = getDatabase();
  let deleted = 0;

  // Check short-term memory limit
  const shortTermCount = (db.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE type = 'short_term'"
  ).get() as { count: number }).count;

  if (shortTermCount > config.maxShortTermMemories) {
    const toRemove = shortTermCount - config.maxShortTermMemories;
    const lowPriority = db.prepare(`
      SELECT id FROM memories
      WHERE type = 'short_term'
      ORDER BY salience ASC, last_accessed ASC
      LIMIT ?
    `).all(toRemove) as { id: number }[];

    for (const { id } of lowPriority) {
      deleteMemory(id);
      deleted++;
    }
  }

  // Check long-term memory limit (more lenient)
  const longTermCount = (db.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE type = 'long_term'"
  ).get() as { count: number }).count;

  if (longTermCount > config.maxLongTermMemories) {
    const toRemove = longTermCount - config.maxLongTermMemories;
    const lowPriority = db.prepare(`
      SELECT id FROM memories
      WHERE type = 'long_term'
      ORDER BY salience ASC, access_count ASC, last_accessed ASC
      LIMIT ?
    `).all(toRemove) as { id: number }[];

    for (const { id } of lowPriority) {
      deleteMemory(id);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Find and merge similar short-term memories into coherent long-term entries.
 * Groups memories by project|category, then clusters by Jaccard similarity
 * on content (0.6 weight) + title (0.4 weight).
 * Returns count of deleted (merged) memories.
 */
export function mergeSimilarMemories(
  project?: string,
  similarityThreshold: number = 0.25
): number {
  return withTransaction(() => {
    const db = getDatabase();
    let deleted = 0;

    // Step 1: Get all short-term memories, optionally filtered by project
    let sql = "SELECT * FROM memories WHERE type = 'short_term'";
    const params: unknown[] = [];
    if (project) {
      sql += ' AND project = ?';
      params.push(project);
    }
    sql += ' ORDER BY created_at ASC';

    const memories = db.prepare(sql).all(...params) as Record<string, unknown>[];

    // Step 2: Group by project|category
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const mem of memories) {
      const key = `${mem.project || ''}|${mem.category || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(mem);
    }

    // Step 3: For each group with 2+ members, find clusters
    for (const [, group] of groups) {
      if (group.length < 2) continue;

      // Track which memories have been clustered
      const clustered = new Set<number>();

      for (let i = 0; i < group.length; i++) {
        if (clustered.has(i)) continue;

        const cluster: number[] = [i]; // indices into group
        const memA = group[i];

        for (let j = i + 1; j < group.length; j++) {
          if (clustered.has(j)) continue;

          const memB = group[j];
          const contentSim = jaccardSimilarity(
            memA.content as string,
            memB.content as string
          );
          const titleSim = jaccardSimilarity(
            memA.title as string,
            memB.title as string
          );
          const combinedSim = contentSim * 0.6 + titleSim * 0.4;

          if (combinedSim >= similarityThreshold) {
            cluster.push(j);
          }
        }

        if (cluster.length < 2) continue;

        // Mark all as clustered
        for (const idx of cluster) clustered.add(idx);

        // Step 4: Merge cluster
        // Sort by salience desc, pick highest as base
        const clusterMems = cluster.map(idx => group[idx]);
        clusterMems.sort(
          (a, b) => (b.salience as number) - (a.salience as number)
        );

        const base = clusterMems[0];
        const others = clusterMems.slice(1);

        // Merge content
        const bulletPoints = others
          .map(m => `- ${(m.title as string)}: ${(m.content as string)}`)
          .join('\n');
        const mergedContent = `${base.content as string}\n\nConsolidated context:\n${bulletPoints}`;

        // Merge tags (union)
        const allTags = new Set<string>();
        for (const m of clusterMems) {
          try {
            const tags = JSON.parse((m.tags as string) || '[]') as string[];
            for (const t of tags) allTags.add(t);
          } catch {
            // skip invalid tags
          }
        }

        // Sum access counts
        const totalAccessCount = clusterMems.reduce(
          (sum, m) => sum + ((m.access_count as number) || 0),
          0
        );

        // New salience: base + 0.1, capped at 1.0
        const newSalience = Math.min(1.0, (base.salience as number) + 0.1);

        // Update base memory
        db.prepare(`
          UPDATE memories
          SET type = 'long_term',
              content = ?,
              tags = ?,
              salience = ?,
              access_count = ?
          WHERE id = ?
        `).run(
          mergedContent,
          JSON.stringify([...allTags]),
          newSalience,
          totalAccessCount,
          base.id as number
        );

        // Delete others
        for (const other of others) {
          deleteMemory(other.id as number);
          deleted++;
        }
      }
    }

    return deleted;
  });
}

/**
 * Generate a context summary for session start
 * Provides a high-level view of relevant memories
 */
export async function generateContextSummary(
  project?: string,
  config: MemoryConfig = DEFAULT_CONFIG
): Promise<ContextSummary> {
  // Get recent memories
  const recentMemories = getRecentMemories(10, project);

  // Get key architecture decisions
  const keyDecisions = (await searchMemories({
    query: '',
    project,
    category: 'architecture',
    minSalience: 0.6,
    limit: 5,
  }, config)).map(r => r.memory);

  // Get active patterns
  const activePatterns = (await searchMemories({
    query: '',
    project,
    category: 'pattern',
    minSalience: 0.5,
    limit: 5,
  }, config)).map(r => r.memory);

  // Get pending items
  const pendingItems = (await searchMemories({
    query: '',
    project,
    category: 'todo',
    limit: 10,
  }, config)).map(r => r.memory);

  return {
    project,
    recentMemories,
    keyDecisions,
    activePatterns,
    pendingItems,
  };
}

/**
 * Format context summary as a readable string
 */
export function formatContextSummary(summary: ContextSummary): string {
  const lines: string[] = [];

  if (summary.project) {
    lines.push(`## Project: ${summary.project}\n`);
  }

  if (summary.keyDecisions.length > 0) {
    lines.push('### Key Decisions');
    for (const memory of summary.keyDecisions) {
      lines.push(`- **${memory.title}**: ${memory.content.slice(0, 100)}${memory.content.length > 100 ? '...' : ''}`);
    }
    lines.push('');
  }

  if (summary.activePatterns.length > 0) {
    lines.push('### Active Patterns');
    for (const memory of summary.activePatterns) {
      lines.push(`- **${memory.title}**: ${memory.content.slice(0, 100)}${memory.content.length > 100 ? '...' : ''}`);
    }
    lines.push('');
  }

  if (summary.pendingItems.length > 0) {
    lines.push('### Pending Items');
    for (const memory of summary.pendingItems) {
      lines.push(`- [ ] ${memory.title}`);
    }
    lines.push('');
  }

  if (summary.recentMemories.length > 0) {
    lines.push('### Recent Context');
    for (const memory of summary.recentMemories.slice(0, 5)) {
      lines.push(`- ${memory.title} (${memory.category})`);
    }
  }

  return lines.join('\n');
}

/**
 * Start a new session
 * Creates a session record and returns relevant context
 */
export async function startSession(project?: string): Promise<{
  sessionId: number;
  context: ContextSummary;
}> {
  const db = getDatabase();

  // Create session record
  const result = db.prepare(`
    INSERT INTO sessions (project) VALUES (?)
  `).run(project || null);

  const sessionId = result.lastInsertRowid as number;

  // Generate context summary
  const context = await generateContextSummary(project);

  return { sessionId, context };
}

/**
 * End a session
 * Updates session record with summary
 */
export function endSession(
  sessionId: number,
  summary?: string
): void {
  const db = getDatabase();

  // Get counts from this session
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM memories WHERE created_at >= s.started_at) as created,
      (SELECT COUNT(*) FROM memories WHERE last_accessed >= s.started_at) as accessed
    FROM sessions s WHERE s.id = ?
  `).get(sessionId) as { created: number; accessed: number } | undefined;

  db.prepare(`
    UPDATE sessions
    SET ended_at = CURRENT_TIMESTAMP,
        summary = ?,
        memories_created = ?,
        memories_accessed = ?
    WHERE id = ?
  `).run(
    summary || null,
    stats?.created || 0,
    stats?.accessed || 0,
    sessionId
  );
}

/**
 * Get suggested context for the current query
 * Returns memories that might be relevant to what the user is working on
 */
export async function getSuggestedContext(
  currentContext: string,
  project?: string,
  limit: number = 5
): Promise<Memory[]> {
  // Search for relevant memories based on current context
  const results = await searchMemories({
    query: currentContext,
    project,
    minSalience: 0.4,
    limit,
    includeDecayed: false,
  });

  return results.map(r => r.memory);
}

/**
 * Export memories as JSON (for backup/transfer)
 */
export function exportMemories(project?: string): string {
  const db = getDatabase();

  let sql = 'SELECT * FROM memories';
  const params: unknown[] = [];
  if (project) {
    sql += ' WHERE project = ?';
    params.push(project);
  }
  sql += ' ORDER BY created_at ASC';

  const rows = db.prepare(sql).all(...params);
  return JSON.stringify(rows, null, 2);
}

/**
 * Import memories from JSON
 */
export function importMemories(json: string): number {
  // Wrap in transaction for atomic import
  return withTransaction(() => {
    const db = getDatabase();
    const memories = JSON.parse(json) as Record<string, unknown>[];

    const stmt = db.prepare(`
      INSERT INTO memories (type, category, title, content, project, tags, salience, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    for (const memory of memories) {
      try {
        stmt.run(
          memory.type,
          memory.category,
          memory.title,
          memory.content,
          memory.project || null,
          memory.tags || '[]',
          memory.salience || 0.5,
          memory.metadata || '{}'
        );
        imported++;
      } catch {
        // Skip duplicates or invalid entries
      }
    }

    return imported;
  });
}

/**
 * Vacuum database to reclaim space after deletions
 * Run periodically or after major cleanup operations
 */
export function vacuumDatabase(): { success: boolean; message: string } {
  try {
    const db = getDatabase();
    db.exec('VACUUM');
    return { success: true, message: 'Database vacuumed successfully' };
  } catch (error) {
    return { success: false, message: `Vacuum failed: ${error}` };
  }
}

/**
 * Preview what consolidation would do without actually doing it
 * Useful for dry-run mode
 */
export function previewConsolidation(
  config: MemoryConfig = DEFAULT_CONFIG
): {
  toPromote: Memory[];
  toDelete: Memory[];
  totalShortTerm: number;
  totalLongTerm: number;
} {
  const db = getDatabase();

  // Get all short-term memories
  const shortTermMemories = getMemoriesByType('short_term', config.maxShortTermMemories * 2);

  // Get episodic memories too
  const episodicMemories = getMemoriesByType('episodic', 100);

  // Process decay to see what would happen
  const { toDelete: deleteIds, toPromote: promoteIds } = processDecay(
    [...shortTermMemories, ...episodicMemories],
    config
  );

  // Map IDs back to memories
  const allMemories = [...shortTermMemories, ...episodicMemories];
  const toPromote = allMemories.filter(m => promoteIds.includes(m.id));
  const toDelete = allMemories.filter(m => deleteIds.includes(m.id) && !promoteIds.includes(m.id));

  // Get counts
  const totalShortTerm = (db.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE type = 'short_term'"
  ).get() as { count: number }).count;

  const totalLongTerm = (db.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE type = 'long_term'"
  ).get() as { count: number }).count;

  return { toPromote, toDelete, totalShortTerm, totalLongTerm };
}

/**
 * Check if consolidation should be triggered based on memory state
 * Returns true if consolidation is recommended
 */
export function shouldTriggerConsolidation(
  config: MemoryConfig = DEFAULT_CONFIG
): { shouldRun: boolean; reason: string } {
  const stats = getMemoryStats();
  const stmFullness = stats.shortTerm / config.maxShortTermMemories;

  // Trigger early when approaching capacity
  if (stmFullness > 0.8) {
    return {
      shouldRun: true,
      reason: `Short-term memory at ${Math.round(stmFullness * 100)}% capacity`,
    };
  }

  // Check if many memories are below threshold
  const db = getDatabase();
  const lowScoreCount = (db.prepare(`
    SELECT COUNT(*) as count FROM memories
    WHERE type = 'short_term' AND decayed_score < ?
  `).get(config.salienceThreshold) as { count: number }).count;

  if (lowScoreCount > 10) {
    return {
      shouldRun: true,
      reason: `${lowScoreCount} memories below salience threshold`,
    };
  }

  return { shouldRun: false, reason: 'No consolidation needed' };
}

/**
 * Full cleanup: consolidate + vacuum
 * Best run periodically to keep database healthy
 */
export function fullCleanup(
  config: MemoryConfig = DEFAULT_CONFIG
): { consolidation: ConsolidationResult; vacuumed: boolean; merged: number } {
  // Run consolidation
  const consolidation = consolidate(config);

  // Merge similar memories
  const merged = mergeSimilarMemories();

  // Vacuum if we deleted anything
  let vacuumed = false;
  if (consolidation.deleted > 0 || merged > 0) {
    const vacResult = vacuumDatabase();
    vacuumed = vacResult.success;
  }

  return { consolidation, vacuumed, merged };
}
