/**
 * Predictive Consolidation Module
 *
 * Phase 4 Organic Brain Feature
 *
 * Determines when to run consolidation early based on memory pressure
 * and activity patterns, rather than waiting for the 4-hour cycle.
 */

import { getDatabase } from '../database/init.js';
import { WorkerConfig, PredictiveDecision } from './types.js';

/**
 * Memory statistics type (matches getMemoryStats return type)
 */
export interface MemoryStats {
  total: number;
  shortTerm: number;
  longTerm: number;
  episodic: number;
  byCategory: Record<string, number>;
  averageSalience: number;
}

/**
 * Memory limits (from DEFAULT_CONFIG)
 */
const MAX_SHORT_TERM = 100;
const MAX_LONG_TERM = 1000;
const MAX_TOTAL = MAX_SHORT_TERM + MAX_LONG_TERM;

/**
 * Determine if consolidation should run early
 * More intelligent than just waiting for the 4-hour cycle
 *
 * @param stats - Current memory statistics
 * @param config - Worker configuration
 * @returns Decision object with shouldRun, reason, and urgency
 */
export function shouldTriggerPredictiveConsolidation(
  stats: MemoryStats,
  config: WorkerConfig
): PredictiveDecision {
  const stmFullness = stats.shortTerm / MAX_SHORT_TERM;
  const totalFullness = stats.total / MAX_TOTAL;

  // Critical: Over 85% STM capacity - consolidate immediately
  if (stmFullness > config.stmCriticalThreshold) {
    return {
      shouldRun: true,
      reason: `STM at ${(stmFullness * 100).toFixed(0)}% (critical threshold)`,
      urgency: 'critical',
    };
  }

  // High: Over 80% total capacity
  if (totalFullness > config.totalMemoryWarningThreshold) {
    return {
      shouldRun: true,
      reason: `Total memory at ${(totalFullness * 100).toFixed(0)}% capacity`,
      urgency: 'high',
    };
  }

  // Medium: Over 70% STM + high recent activity
  if (stmFullness > config.stmWarningThreshold) {
    const db = getDatabase();

    // Check recent activity (memories created in last 30 minutes)
    const recentActivity = db.prepare(`
      SELECT COUNT(*) as count FROM memories
      WHERE created_at > datetime('now', '-30 minutes')
    `).get() as { count: number };

    if (recentActivity.count >= config.highActivityThreshold) {
      return {
        shouldRun: true,
        reason: `STM at ${(stmFullness * 100).toFixed(0)}% with high activity (${recentActivity.count} recent memories)`,
        urgency: 'medium',
      };
    }

    // Check if many memories are below deletion threshold
    // These are candidates for cleanup
    const lowScoreCount = db.prepare(`
      SELECT COUNT(*) as count FROM memories
      WHERE type = 'short_term' AND decayed_score < 0.25
    `).get() as { count: number };

    if (lowScoreCount.count > 15) {
      return {
        shouldRun: true,
        reason: `${lowScoreCount.count} STM memories below salience threshold`,
        urgency: 'medium',
      };
    }
  }

  // No consolidation needed
  return {
    shouldRun: false,
    reason: 'No consolidation triggers met',
    urgency: 'low',
  };
}

/**
 * Get detailed memory pressure information
 * Useful for dashboard visualization and debugging
 *
 * @param stats - Current memory statistics
 * @param config - Worker configuration
 * @returns Object with detailed pressure metrics
 */
export function getMemoryPressure(
  stats: MemoryStats,
  config: WorkerConfig
): {
  stmFullness: number;
  totalFullness: number;
  ltmFullness: number;
  isWarning: boolean;
  isCritical: boolean;
  recommendation: string;
} {
  const stmFullness = stats.shortTerm / MAX_SHORT_TERM;
  const ltmFullness = stats.longTerm / MAX_LONG_TERM;
  const totalFullness = stats.total / MAX_TOTAL;

  const isCritical = stmFullness > config.stmCriticalThreshold;
  const isWarning = stmFullness > config.stmWarningThreshold ||
    totalFullness > config.totalMemoryWarningThreshold;

  let recommendation = 'Memory levels healthy';
  if (isCritical) {
    recommendation = 'Immediate consolidation recommended';
  } else if (isWarning) {
    recommendation = 'Consider running consolidation soon';
  }

  return {
    stmFullness,
    totalFullness,
    ltmFullness,
    isWarning,
    isCritical,
    recommendation,
  };
}
