/**
 * Brain Worker
 *
 * Phase 4 Organic Brain Feature
 *
 * Background worker that performs brain-like maintenance operations:
 * - Light tick (5 min): Prune activation cache, check predictive consolidation
 * - Medium tick (30 min): Discover missing links, scan for contradictions
 *
 * This transforms the memory system from reactive to continuously organic.
 */

import {
  WorkerConfig,
  DEFAULT_WORKER_CONFIG,
  LightTickResult,
  MediumTickResult,
  WorkerStatus,
} from './types.js';
import { pruneActivationCache } from '../memory/activation.js';
import { getMemoryStats } from '../memory/store.js';
import { consolidate } from '../memory/consolidate.js';
import {
  detectContradictions,
  linkContradictions,
} from '../memory/contradiction.js';
import { discoverMissingLinks, findUnlinkedMemories } from './link-discovery.js';
import { shouldTriggerPredictiveConsolidation } from './predictive-consolidation.js';
import {
  emitWorkerLightTick,
  emitWorkerMediumTick,
  emitPredictiveConsolidation,
} from '../api/events.js';

/**
 * Brain Worker Class
 *
 * Manages background processing timers and operations.
 * Designed to be started by the visualization server and run continuously.
 */
export class BrainWorker {
  private lightTimer: NodeJS.Timeout | null = null;
  private mediumTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: WorkerConfig;

  // Statistics tracking
  private stats = {
    lightTicks: 0,
    mediumTicks: 0,
    consolidations: 0,
  };

  // Timestamps
  private lastLightTick: Date | null = null;
  private lastMediumTick: Date | null = null;
  private lastConsolidation: Date | null = null;

  /**
   * Create a new BrainWorker
   *
   * @param config - Partial configuration to override defaults
   */
  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
  }

  /**
   * Start the background worker
   * Sets up interval timers for light and medium ticks
   */
  start(): void {
    if (this.isRunning) {
      console.log('[BrainWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[BrainWorker] Starting background worker');
    console.log(`[BrainWorker] Light tick interval: ${this.config.lightTickIntervalMs / 1000}s`);
    console.log(`[BrainWorker] Medium tick interval: ${this.config.mediumTickIntervalMs / 1000}s`);

    // Light tick every 5 minutes (by default)
    this.lightTimer = setInterval(
      () => this.lightTick(),
      this.config.lightTickIntervalMs
    );

    // Medium tick every 30 minutes (by default)
    this.mediumTimer = setInterval(
      () => this.mediumTick(),
      this.config.mediumTickIntervalMs
    );

    // Run initial light tick after a short delay (10 seconds)
    // This allows the server to fully initialize first
    setTimeout(() => {
      if (this.isRunning) {
        this.lightTick();
      }
    }, 10000);
  }

  /**
   * Stop the background worker
   * Clears all interval timers
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[BrainWorker] Not running');
      return;
    }

    this.isRunning = false;

    if (this.lightTimer) {
      clearInterval(this.lightTimer);
      this.lightTimer = null;
    }

    if (this.mediumTimer) {
      clearInterval(this.mediumTimer);
      this.mediumTimer = null;
    }

    console.log('[BrainWorker] Stopped');
  }

  /**
   * Check if the worker is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Light tick - runs every 5 minutes
   *
   * Operations:
   * 1. Prune stale activation cache entries
   * 2. Check if predictive consolidation should run
   */
  async lightTick(): Promise<LightTickResult> {
    const result: LightTickResult = {
      activationsPruned: 0,
      predictiveConsolidation: null,
      timestamp: new Date(),
    };

    try {
      // 1. Prune activation cache
      result.activationsPruned = pruneActivationCache();

      // 2. Check if predictive consolidation is needed
      const stats = getMemoryStats();
      const decision = shouldTriggerPredictiveConsolidation(stats, this.config);

      if (decision.shouldRun) {
        console.log(`[BrainWorker] Predictive consolidation triggered: ${decision.reason}`);
        result.predictiveConsolidation = consolidate();
        this.lastConsolidation = new Date();
        this.stats.consolidations++;

        // Emit event for dashboard
        emitPredictiveConsolidation({
          trigger: decision.reason,
          urgency: decision.urgency,
          result: result.predictiveConsolidation,
        });
      }

      // Update stats
      this.lastLightTick = result.timestamp;
      this.stats.lightTicks++;

      // Emit light tick event
      emitWorkerLightTick(result);

      // Log summary
      if (result.activationsPruned > 0 || result.predictiveConsolidation) {
        console.log(
          `[BrainWorker] Light tick: pruned ${result.activationsPruned} activations` +
          (result.predictiveConsolidation
            ? `, consolidated ${result.predictiveConsolidation.consolidated}`
            : '')
        );
      }

    } catch (e) {
      console.error('[BrainWorker] Light tick failed:', e);
    }

    return result;
  }

  /**
   * Medium tick - runs every 30 minutes
   *
   * Operations:
   * 1. Discover and create missing links
   * 2. Scan for contradictions
   */
  async mediumTick(): Promise<MediumTickResult> {
    const result: MediumTickResult = {
      linksDiscovered: 0,
      contradictionsFound: 0,
      contradictionsLinked: 0,
      memoriesScanned: 0,
      timestamp: new Date(),
    };

    try {
      // 1. Link discovery - find unlinked memories and create relationships
      const unlinked = findUnlinkedMemories(this.config.maxLinksPerCycle);
      result.memoriesScanned = unlinked.length;
      result.linksDiscovered = discoverMissingLinks(this.config.maxLinksPerCycle);

      // 2. Contradiction scan
      const contradictions = detectContradictions({
        minScore: 0.5,
        limit: this.config.contradictionScanLimit,
      });
      result.contradictionsFound = contradictions.length;
      result.contradictionsLinked = linkContradictions(contradictions);

      // Update stats
      this.lastMediumTick = result.timestamp;
      this.stats.mediumTicks++;

      // Emit medium tick event
      emitWorkerMediumTick(result);

      // Log summary
      console.log(
        `[BrainWorker] Medium tick: scanned ${result.memoriesScanned} memories, ` +
        `discovered ${result.linksDiscovered} links, ` +
        `found ${result.contradictionsFound} contradictions`
      );

    } catch (e) {
      console.error('[BrainWorker] Medium tick failed:', e);
    }

    return result;
  }

  /**
   * Get current worker status
   */
  getStatus(): WorkerStatus {
    return {
      isRunning: this.isRunning,
      lastLightTick: this.lastLightTick,
      lastMediumTick: this.lastMediumTick,
      lastConsolidation: this.lastConsolidation,
      stats: { ...this.stats },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): WorkerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * Note: Changes won't affect running timers until restart
   */
  updateConfig(config: Partial<WorkerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Manual triggers for testing and API endpoints

  /**
   * Manually trigger a light tick
   * Useful for testing or immediate cache pruning
   */
  triggerLightTick(): Promise<LightTickResult> {
    return this.lightTick();
  }

  /**
   * Manually trigger a medium tick
   * Useful for testing or immediate link discovery
   */
  triggerMediumTick(): Promise<MediumTickResult> {
    return this.mediumTick();
  }
}

// Default singleton instance (optional - server can create its own)
let defaultWorker: BrainWorker | null = null;

/**
 * Get or create the default worker instance
 */
export function getDefaultWorker(): BrainWorker {
  if (!defaultWorker) {
    defaultWorker = new BrainWorker();
  }
  return defaultWorker;
}

/**
 * Start the default worker if not already running
 */
export function startDefaultWorker(): BrainWorker {
  const worker = getDefaultWorker();
  if (!worker.isActive()) {
    worker.start();
  }
  return worker;
}

/**
 * Stop the default worker
 */
export function stopDefaultWorker(): void {
  if (defaultWorker) {
    defaultWorker.stop();
  }
}
