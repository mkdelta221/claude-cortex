/**
 * Link Discovery Module
 *
 * Phase 4 Organic Brain Feature
 *
 * Finds memories that have no links and discovers relationships
 * for them during background worker cycles.
 */

import { getDatabase } from '../database/init.js';
import {
  rowToMemory,
  detectRelationships,
  createMemoryLink,
} from '../memory/store.js';
import { Memory } from '../memory/types.js';

/**
 * Find memories that have no outgoing links
 * These are candidates for relationship discovery
 *
 * @param limit - Maximum number of memories to return
 * @returns Array of Memory objects with no outgoing links
 */
export function findUnlinkedMemories(limit: number = 10): Memory[] {
  const db = getDatabase();

  // Find memories that are not the source of any link
  // Prioritize by salience (important memories should be linked first)
  const rows = db.prepare(`
    SELECT m.* FROM memories m
    LEFT JOIN memory_links ml ON m.id = ml.source_id
    WHERE ml.id IS NULL
    ORDER BY m.salience DESC, m.last_accessed DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map(rowToMemory);
}

/**
 * Find memories with few links (under-linked)
 * These might benefit from additional connections
 *
 * @param maxLinks - Maximum number of existing links to qualify
 * @param limit - Maximum number of memories to return
 * @returns Array of Memory objects with fewer than maxLinks links
 */
export function findUnderlinkedMemories(
  maxLinks: number = 2,
  limit: number = 10
): Memory[] {
  const db = getDatabase();

  // Find memories with fewer than maxLinks total links (as source or target)
  const rows = db.prepare(`
    SELECT m.*, COUNT(ml.id) as link_count
    FROM memories m
    LEFT JOIN memory_links ml ON m.id = ml.source_id OR m.id = ml.target_id
    GROUP BY m.id
    HAVING link_count < ?
    ORDER BY m.salience DESC
    LIMIT ?
  `).all(maxLinks, limit) as Record<string, unknown>[];

  return rows.map(rowToMemory);
}

/**
 * Discover and create links for unlinked memories
 * Called during medium tick to build the knowledge graph organically
 *
 * @param limit - Maximum number of memories to process per cycle
 * @returns Number of new links created
 */
export function discoverMissingLinks(limit: number = 10): number {
  const unlinked = findUnlinkedMemories(limit);
  let linksCreated = 0;

  for (const memory of unlinked) {
    try {
      // Find up to 3 related memories
      const relationships = detectRelationships(memory, 3);

      for (const rel of relationships) {
        const link = createMemoryLink(
          memory.id,
          rel.targetId,
          rel.relationship,
          rel.strength
        );
        if (link) {
          linksCreated++;
        }
      }
    } catch (e) {
      // Log but don't stop - continue with other memories
      console.error(
        `[BrainWorker] Link discovery failed for memory ${memory.id}:`,
        e
      );
    }
  }

  return linksCreated;
}

/**
 * Get statistics about memory link coverage
 * Useful for dashboard visualization
 *
 * @returns Object with link coverage stats
 */
export function getLinkCoverageStats(): {
  totalMemories: number;
  memoriesWithLinks: number;
  memoriesWithoutLinks: number;
  averageLinksPerMemory: number;
} {
  const db = getDatabase();

  const totalMemories = (db.prepare(
    'SELECT COUNT(*) as count FROM memories'
  ).get() as { count: number }).count;

  const memoriesWithLinks = (db.prepare(`
    SELECT COUNT(DISTINCT source_id) as count FROM memory_links
  `).get() as { count: number }).count;

  const totalLinks = (db.prepare(
    'SELECT COUNT(*) as count FROM memory_links'
  ).get() as { count: number }).count;

  return {
    totalMemories,
    memoriesWithLinks,
    memoriesWithoutLinks: totalMemories - memoriesWithLinks,
    averageLinksPerMemory: totalMemories > 0
      ? totalLinks / totalMemories
      : 0,
  };
}
