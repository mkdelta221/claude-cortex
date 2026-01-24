/**
 * Contradiction Detection System
 *
 * Detects potentially contradictory memories based on:
 * - Opposite statements about the same topic
 * - Different solutions to the same problem
 * - Conflicting preferences or decisions
 *
 * Phase 3 Organic Brain Feature
 */

import { getDatabase } from '../database/init.js';
import { Memory } from './types.js';
import { rowToMemory, createMemoryLink, getRelatedMemories } from './store.js';
import { jaccardSimilarity, extractKeyPhrases } from './similarity.js';

/**
 * Contradiction pattern pairs
 * If memory A matches pattern[0] and memory B matches pattern[1], they may contradict
 */
const CONTRADICTION_PATTERNS: Array<{
  patterns: [RegExp, RegExp];
  description: string;
  weight: number;
}> = [
  {
    patterns: [/\b(?:don'?t|never|avoid)\s+use\b/i, /\buse\b/i],
    description: 'Conflicting usage recommendation',
    weight: 0.8,
  },
  {
    patterns: [/\b(?:don'?t|never|avoid)\b/i, /\b(?:always|should|must)\b/i],
    description: 'Conflicting advice',
    weight: 0.6,
  },
  {
    patterns: [/\bfixed\s+by\s+/i, /\bfixed\s+by\s+/i],
    description: 'Different fixes for same issue',
    weight: 0.7,
  },
  {
    patterns: [/\bdecided\s+to\s+/i, /\bdecided\s+to\s+/i],
    description: 'Different decisions on same topic',
    weight: 0.5,
  },
  {
    patterns: [/\busing\s+(\w+)/i, /\bnot\s+using\s+(\w+)/i],
    description: 'Conflicting usage statement',
    weight: 0.8,
  },
  {
    patterns: [/\b(?:deprecated|removed|dropped)\b/i, /\b(?:added|introduced|using)\b/i],
    description: 'Conflicting status',
    weight: 0.6,
  },
  {
    patterns: [/\bprefer\s+(\w+)/i, /\bavoid\s+(\w+)/i],
    description: 'Conflicting preference',
    weight: 0.7,
  },
  {
    patterns: [/\b(?:works?|working)\b/i, /\b(?:broken|doesn'?t\s+work|failed)\b/i],
    description: 'Conflicting status report',
    weight: 0.6,
  },
];

/**
 * Result of checking two memories for contradiction
 */
export interface ContradictionResult {
  memoryA: Memory;
  memoryB: Memory;
  score: number; // 0-1, higher = more likely contradiction
  reason: string;
  sharedTopics: string[];
}

/**
 * Calculate topic similarity between two memories
 * Based on tags, category, project, and key phrases
 *
 * @param memoryA - First memory
 * @param memoryB - Second memory
 * @returns Similarity score 0-1
 */
function calculateTopicSimilarity(memoryA: Memory, memoryB: Memory): number {
  let score = 0;

  // Same project (+0.3)
  if (memoryA.project && memoryA.project === memoryB.project) {
    score += 0.3;
  }

  // Same category (+0.2)
  if (memoryA.category === memoryB.category) {
    score += 0.2;
  }

  // Shared tags (Jaccard on tags, up to +0.3)
  const tagsA = new Set(memoryA.tags);
  const tagsB = new Set(memoryB.tags);
  if (tagsA.size > 0 || tagsB.size > 0) {
    let tagIntersection = 0;
    for (const tag of tagsA) {
      if (tagsB.has(tag)) tagIntersection++;
    }
    const tagUnion = tagsA.size + tagsB.size - tagIntersection;
    if (tagUnion > 0) {
      score += (tagIntersection / tagUnion) * 0.3;
    }
  }

  // Title similarity (+0.2)
  const titleSim = jaccardSimilarity(memoryA.title, memoryB.title);
  score += titleSim * 0.2;

  return Math.min(1.0, score);
}

/**
 * Find shared topics between two memories
 *
 * @param memoryA - First memory
 * @param memoryB - Second memory
 * @returns Array of shared topic strings
 */
function findSharedTopics(memoryA: Memory, memoryB: Memory): string[] {
  const topics: string[] = [];

  // Shared tags
  const tagsA = new Set(memoryA.tags);
  for (const tag of memoryB.tags) {
    if (tagsA.has(tag)) topics.push(`tag:${tag}`);
  }

  // Shared key phrases
  const textA = `${memoryA.title} ${memoryA.content}`;
  const textB = `${memoryB.title} ${memoryB.content}`;
  const phrasesA = new Set(extractKeyPhrases(textA));
  const phrasesB = extractKeyPhrases(textB);

  for (const phrase of phrasesB) {
    if (phrasesA.has(phrase) && phrase.length > 3) {
      topics.push(phrase);
    }
  }

  // Same project
  if (memoryA.project && memoryA.project === memoryB.project) {
    topics.push(`project:${memoryA.project}`);
  }

  return [...new Set(topics)].slice(0, 5);
}

/**
 * Check if two memories might contradict each other
 *
 * @param memoryA - First memory to compare
 * @param memoryB - Second memory to compare
 * @returns ContradictionResult if contradiction detected, null otherwise
 */
export function checkContradiction(
  memoryA: Memory,
  memoryB: Memory
): ContradictionResult | null {
  // Same memory can't contradict itself
  if (memoryA.id === memoryB.id) return null;

  // Must share some topic/context to contradict
  const topicSimilarity = calculateTopicSimilarity(memoryA, memoryB);
  if (topicSimilarity < 0.2) return null;

  // Check for contradiction patterns
  const textA = `${memoryA.title} ${memoryA.content}`;
  const textB = `${memoryB.title} ${memoryB.content}`;

  let maxScore = 0;
  let matchedReason = '';

  for (const { patterns, description, weight } of CONTRADICTION_PATTERNS) {
    const [patternA, patternB] = patterns;

    // Check both directions
    const aMatchesFirst = patternA.test(textA);
    const bMatchesSecond = patternB.test(textB);
    const aMatchesSecond = patternB.test(textA);
    const bMatchesFirst = patternA.test(textB);

    if ((aMatchesFirst && bMatchesSecond) || (aMatchesSecond && bMatchesFirst)) {
      // For "different fixes" and "different decisions", we need to check
      // that they're actually different, not the same
      if (description.includes('Different')) {
        // Extract the captured content and compare
        const matchA = textA.match(patternA);
        const matchB = textB.match(patternB);
        if (matchA && matchB) {
          const contentA = matchA[0].toLowerCase();
          const contentB = matchB[0].toLowerCase();
          // If the content is too similar, it's not a contradiction
          if (jaccardSimilarity(contentA, contentB) > 0.8) {
            continue;
          }
        }
      }

      const score = weight * topicSimilarity;
      if (score > maxScore) {
        maxScore = score;
        matchedReason = description;
      }
    }
  }

  // Minimum score threshold
  if (maxScore < 0.3) return null;

  // Find shared topics for context
  const sharedTopics = findSharedTopics(memoryA, memoryB);

  return {
    memoryA,
    memoryB,
    score: maxScore,
    reason: matchedReason,
    sharedTopics,
  };
}

/**
 * Options for detecting contradictions
 */
export interface DetectContradictionsOptions {
  project?: string;
  category?: string;
  minScore?: number;
  limit?: number;
}

/**
 * Detect contradictions across all memories matching the filter
 *
 * @param options - Filtering and limit options
 * @returns Array of ContradictionResults sorted by score
 */
export function detectContradictions(
  options: DetectContradictionsOptions = {}
): ContradictionResult[] {
  const { project, category, minScore = 0.4, limit = 20 } = options;

  const db = getDatabase();

  // Build query
  let sql = 'SELECT * FROM memories WHERE 1=1';
  const params: unknown[] = [];

  if (project) {
    sql += ' AND project = ?';
    params.push(project);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  // Order by salience to prioritize important memories
  sql += ' ORDER BY salience DESC, last_accessed DESC LIMIT 200';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const memories = rows.map(rowToMemory);

  const contradictions: ContradictionResult[] = [];

  // Compare pairs (O(n^2) but limited to 200 memories max)
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const result = checkContradiction(memories[i], memories[j]);
      if (result && result.score >= minScore) {
        contradictions.push(result);
      }
    }
  }

  // Sort by score (highest first) and limit
  return contradictions
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Create 'contradicts' links between memories
 * Called during consolidation to persist detected contradictions
 *
 * @param contradictions - Array of detected contradictions
 * @returns Number of links created
 */
export function linkContradictions(contradictions: ContradictionResult[]): number {
  let linksCreated = 0;

  for (const contradiction of contradictions) {
    const link = createMemoryLink(
      contradiction.memoryA.id,
      contradiction.memoryB.id,
      'contradicts',
      contradiction.score
    );
    if (link) linksCreated++;
  }

  return linksCreated;
}

/**
 * Get all contradictions for a specific memory
 *
 * @param memoryId - ID of the memory to check
 * @returns Array of ContradictionResults
 */
export function getContradictionsFor(memoryId: number): ContradictionResult[] {
  const db = getDatabase();

  // Get the source memory
  const memoryRow = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId) as Record<string, unknown> | undefined;
  if (!memoryRow) return [];

  const memory = rowToMemory(memoryRow);

  // Get related memories with 'contradicts' relationship
  const related = getRelatedMemories(memoryId);
  const contradicting = related.filter(r => r.relationship === 'contradicts');

  return contradicting.map(c => ({
    memoryA: memory,
    memoryB: c.memory,
    score: c.strength,
    reason: 'Previously detected contradiction',
    sharedTopics: findSharedTopics(memory, c.memory),
  }));
}

/**
 * Check if a contradiction link already exists between two memories
 *
 * @param memoryAId - First memory ID
 * @param memoryBId - Second memory ID
 * @returns True if a contradiction link exists
 */
export function hasContradictionLink(memoryAId: number, memoryBId: number): boolean {
  const db = getDatabase();

  const link = db.prepare(`
    SELECT 1 FROM memory_links
    WHERE relationship = 'contradicts'
      AND ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?))
  `).get(memoryAId, memoryBId, memoryBId, memoryAId);

  return !!link;
}
