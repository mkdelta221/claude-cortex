/**
 * Spreading Activation System
 *
 * Implements brain-like spreading activation where accessing a memory
 * "primes" related memories, making them easier to recall.
 *
 * EPHEMERAL: This cache is session-only and does not persist to disk.
 * Each MCP server restart starts with a fresh activation state.
 *
 * Based on spreading activation theory in cognitive psychology:
 * - Collins & Loftus (1975) semantic network model
 * - Activation spreads through associative links
 * - Activation decays over time (exponential decay)
 */

import { getRelatedMemories } from './store.js';

/**
 * An entry in the activation cache
 */
interface ActivationEntry {
  memoryId: number;
  activationLevel: number; // 0-1, higher = more primed
  timestamp: number; // When activation was last updated
}

/**
 * In-memory activation cache
 * Ephemeral - cleared on process restart
 */
const activationCache = new Map<number, ActivationEntry>();

// Configuration
const DECAY_HALF_LIFE_MINUTES = 30; // Activation halves every 30 minutes
const SPREAD_FACTOR = 0.5; // How much activation spreads (50% of link strength)
const MAX_SPREAD_DEPTH = 1; // Only spread to direct neighbors (not neighbors of neighbors)
const MAX_ACTIVATION_BOOST = 0.2; // Cap search boost at 20%

/**
 * Activate a memory and spread activation to linked memories
 *
 * When a memory is accessed, it becomes fully activated (1.0).
 * Linked memories receive partial activation based on link strength.
 *
 * @param memoryId - The ID of the memory being accessed
 */
export function activateMemory(memoryId: number): void {
  const now = Date.now();

  // Fully activate the accessed memory
  activationCache.set(memoryId, {
    memoryId,
    activationLevel: 1.0,
    timestamp: now,
  });

  // Spread activation to linked memories
  try {
    const related = getRelatedMemories(memoryId);

    for (const link of related) {
      // Calculate spread amount: link strength * spread factor
      const spreadAmount = link.strength * SPREAD_FACTOR;

      // Get existing activation (if any)
      const existing = activationCache.get(link.memory.id);
      const existingLevel = existing
        ? getDecayedActivation(existing, now)
        : 0;

      // Add activation (cap at 1.0)
      const newLevel = Math.min(1.0, existingLevel + spreadAmount);

      activationCache.set(link.memory.id, {
        memoryId: link.memory.id,
        activationLevel: newLevel,
        timestamp: now,
      });
    }
  } catch (e) {
    // Don't fail memory access if spreading fails
    console.error('[claude-cortex] Activation spreading failed:', e);
  }
}

/**
 * Calculate decayed activation level
 *
 * Uses exponential decay: level * 0.5^(minutes / half_life)
 */
function getDecayedActivation(entry: ActivationEntry, now: number): number {
  const ageMinutes = (now - entry.timestamp) / (1000 * 60);
  const decayFactor = Math.pow(0.5, ageMinutes / DECAY_HALF_LIFE_MINUTES);
  return entry.activationLevel * decayFactor;
}

/**
 * Get the activation boost for a memory in search scoring
 *
 * Returns 0 if memory is not activated or activation has fully decayed.
 * Returns up to MAX_ACTIVATION_BOOST for fully activated memories.
 *
 * @param memoryId - The ID of the memory to check
 * @returns Activation boost (0 to MAX_ACTIVATION_BOOST)
 */
export function getActivationBoost(memoryId: number): number {
  const entry = activationCache.get(memoryId);
  if (!entry) return 0;

  const now = Date.now();
  const decayedLevel = getDecayedActivation(entry, now);

  // If activation is negligible, clean up the entry
  if (decayedLevel < 0.01) {
    activationCache.delete(memoryId);
    return 0;
  }

  // Scale to max boost (e.g., 1.0 activation -> 0.2 boost)
  return decayedLevel * MAX_ACTIVATION_BOOST;
}

/**
 * Get current activation level for a memory (for debugging/dashboard)
 *
 * @param memoryId - The ID of the memory to check
 * @returns Current activation level (0-1) or null if not activated
 */
export function getActivationLevel(memoryId: number): number | null {
  const entry = activationCache.get(memoryId);
  if (!entry) return null;

  const decayedLevel = getDecayedActivation(entry, Date.now());
  if (decayedLevel < 0.01) return null;

  return decayedLevel;
}

/**
 * Get all currently activated memories with their levels
 * Useful for dashboard visualization
 *
 * @returns Array of {memoryId, activationLevel} for all activated memories
 */
export function getActiveMemories(): Array<{ memoryId: number; activationLevel: number }> {
  const now = Date.now();
  const active: Array<{ memoryId: number; activationLevel: number }> = [];

  for (const entry of activationCache.values()) {
    const level = getDecayedActivation(entry, now);
    if (level >= 0.01) {
      active.push({ memoryId: entry.memoryId, activationLevel: level });
    }
  }

  return active.sort((a, b) => b.activationLevel - a.activationLevel);
}

/**
 * Clear the activation cache
 * Useful for testing or manual reset
 */
export function clearActivationCache(): void {
  activationCache.clear();
}

/**
 * Prune stale entries from the activation cache
 * Call periodically to prevent memory bloat
 */
export function pruneActivationCache(): number {
  const now = Date.now();
  let pruned = 0;

  for (const [memoryId, entry] of activationCache) {
    if (getDecayedActivation(entry, now) < 0.01) {
      activationCache.delete(memoryId);
      pruned++;
    }
  }

  return pruned;
}

/**
 * Get activation cache statistics
 */
export function getActivationStats(): {
  totalEntries: number;
  activeEntries: number;
  averageActivation: number;
} {
  const active = getActiveMemories();
  const avgActivation = active.length > 0
    ? active.reduce((sum, a) => sum + a.activationLevel, 0) / active.length
    : 0;

  return {
    totalEntries: activationCache.size,
    activeEntries: active.length,
    averageActivation: avgActivation,
  };
}
