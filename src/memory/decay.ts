/**
 * Temporal Decay System
 *
 * Implements memory decay similar to human forgetting curves.
 * Memories fade over time but can be reinforced through access.
 */

import { Memory, MemoryConfig, DEFAULT_CONFIG, DELETION_THRESHOLDS } from './types.js';

/**
 * Calculate the current decayed score for a memory
 * Uses exponential decay: score = base_score * (decay_rate ^ effective_hours)
 *
 * Memory types have different decay rates:
 * - Short-term: hourly decay (fastest)
 * - Episodic: 6-hour decay (medium)
 * - Long-term: daily decay (slowest)
 *
 * Access count slows decay (multiplicative bonus, not additive)
 */
export function calculateDecayedScore(
  memory: Memory,
  config: MemoryConfig = DEFAULT_CONFIG
): number {
  const now = new Date();
  const lastAccessed = new Date(memory.lastAccessed);
  const hoursSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);

  // Determine effective decay period based on memory type
  // This is applied FIRST, not as a replacement after calculation
  let effectiveHours = hoursSinceAccess;
  if (memory.type === 'long_term') {
    effectiveHours = hoursSinceAccess / 24; // Daily decay instead of hourly
  } else if (memory.type === 'episodic') {
    effectiveHours = hoursSinceAccess / 6; // 6-hour decay rate
  }

  // Apply access count bonus to SLOW decay (multiplicative, not additive)
  // Frequently accessed memories decay slower - up to 30% slower
  // This prevents score inflation beyond original salience
  const accessSlowdown = 1 + Math.min(0.3, memory.accessCount * 0.02);
  effectiveHours = effectiveHours / accessSlowdown;

  // Calculate decay factor with type-adjusted and access-adjusted time
  const decayFactor = Math.pow(config.decayRate, effectiveHours);

  // Apply decay to salience - score can never exceed original salience
  const score = memory.salience * decayFactor;

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate reinforcement boost when memory is accessed
 */
export function calculateReinforcementBoost(
  memory: Memory,
  config: MemoryConfig = DEFAULT_CONFIG
): number {
  // Diminishing returns on reinforcement
  const currentBoost = Math.min(
    0.5,
    (config.reinforcementFactor - 1) * Math.pow(0.9, memory.accessCount)
  );

  // New score after reinforcement
  let newScore = memory.salience + currentBoost;

  // Cap at 1.0
  return Math.min(1.0, newScore);
}

/**
 * Determine if a memory should be promoted from short-term to long-term
 * Based on access patterns and salience
 */
export function shouldPromoteToLongTerm(
  memory: Memory,
  config: MemoryConfig = DEFAULT_CONFIG
): boolean {
  if (memory.type !== 'short_term') return false;

  // Check if salience is above consolidation threshold
  if (memory.salience < config.consolidationThreshold) return false;

  // Check if accessed multiple times (spaced repetition indicator)
  if (memory.accessCount >= 3) return true;

  // Check if memory has survived for a while with good salience
  const ageHours = (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60);
  if (ageHours >= config.autoConsolidateHours && memory.salience >= 0.7) return true;

  return false;
}

/**
 * Determine if an episodic memory should be promoted to long-term
 * Episodic memories (session markers) promote if they're accessed frequently,
 * indicating an important session that's being referenced
 */
export function shouldPromoteEpisodic(memory: Memory): boolean {
  if (memory.type !== 'episodic') return false;

  // Promote if accessed 5+ times (indicates important session marker)
  if (memory.accessCount >= 5) return true;

  // Promote if high salience and relatively old
  const ageHours = (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60);
  if (ageHours >= 24 && memory.salience >= 0.8) return true;

  return false;
}

/**
 * Determine if a memory should be deleted due to decay
 * Uses category-specific thresholds - architecture/errors are harder to delete
 */
export function shouldDelete(
  memory: Memory,
  config: MemoryConfig = DEFAULT_CONFIG
): boolean {
  const decayedScore = calculateDecayedScore(memory, config);

  // Don't delete long-term memories easily
  if (memory.type === 'long_term') {
    return decayedScore < 0.1 && memory.accessCount < 2;
  }

  // Get category-specific threshold (defaults to config threshold if not found)
  const categoryThreshold = DELETION_THRESHOLDS[memory.category] ?? config.salienceThreshold;

  // Short-term and episodic memories use category-specific thresholds
  return decayedScore < categoryThreshold;
}

/**
 * Get memories sorted by priority (salience + recency + access count)
 */
export function calculatePriority(memory: Memory): number {
  const decayedScore = calculateDecayedScore(memory);

  // Weight factors
  const salienceWeight = 0.4;
  const recencyWeight = 0.3;
  const accessWeight = 0.3;

  // Calculate recency score (1.0 for recent, decreasing with age)
  const ageHours = (Date.now() - new Date(memory.lastAccessed).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-ageHours / 24); // Half-life of ~17 hours

  // Calculate access score (capped at 1.0)
  const accessScore = Math.min(1.0, memory.accessCount / 10);

  return (
    decayedScore * salienceWeight +
    recencyScore * recencyWeight +
    accessScore * accessWeight
  );
}

/**
 * Batch process memories for decay and cleanup
 * Returns IDs of memories to delete and promote
 */
export function processDecay(
  memories: Memory[],
  config: MemoryConfig = DEFAULT_CONFIG
): {
  toDelete: number[];
  toPromote: number[];
  updated: Map<number, number>; // id -> new decayed score
} {
  const toDelete: number[] = [];
  const toPromote: number[] = [];
  const updated = new Map<number, number>();

  for (const memory of memories) {
    const decayedScore = calculateDecayedScore(memory, config);
    updated.set(memory.id, decayedScore);

    if (shouldDelete(memory, config)) {
      toDelete.push(memory.id);
    } else if (shouldPromoteToLongTerm(memory, config)) {
      toPromote.push(memory.id);
    } else if (shouldPromoteEpisodic(memory)) {
      // Also consider episodic memories for promotion
      toPromote.push(memory.id);
    }
  }

  return { toDelete, toPromote, updated };
}

/**
 * Calculate optimal time for next consolidation
 * Based on current memory state
 */
export function calculateNextConsolidationTime(
  memories: Memory[],
  config: MemoryConfig = DEFAULT_CONFIG
): Date {
  const shortTermCount = memories.filter(m => m.type === 'short_term').length;

  // If we have many short-term memories, consolidate sooner
  if (shortTermCount > config.maxShortTermMemories * 0.8) {
    return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }

  if (shortTermCount > config.maxShortTermMemories * 0.5) {
    return new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  }

  return new Date(Date.now() + config.autoConsolidateHours * 60 * 60 * 1000);
}

/**
 * Human-readable time since last access
 */
export function formatTimeSinceAccess(memory: Memory): string {
  const hours = (Date.now() - new Date(memory.lastAccessed).getTime()) / (1000 * 60 * 60);

  if (hours < 1) return 'just now';
  if (hours < 2) return '1 hour ago';
  if (hours < 24) return `${Math.floor(hours)} hours ago`;
  if (hours < 48) return 'yesterday';
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}
