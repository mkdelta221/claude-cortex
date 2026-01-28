/**
 * Event Emitter for Memory Events
 *
 * Broadcasts memory changes to connected WebSocket clients
 * for real-time visualization updates.
 */

import { EventEmitter } from 'events';
import { Memory, ConsolidationResult } from '../memory/types.js';
import { getDatabase } from '../database/init.js';

export type MemoryEventType =
  | 'memory_created'
  | 'memory_accessed'
  | 'memory_updated'
  | 'memory_deleted'
  | 'consolidation_complete'
  | 'decay_tick'
  | 'session_started'
  | 'session_ended'
  // Phase 4: Worker events
  | 'worker_light_tick'
  | 'worker_medium_tick'
  | 'link_discovered'
  | 'predictive_consolidation'
  // Version/Update events
  | 'update_started'
  | 'update_complete'
  | 'update_failed'
  | 'server_restarting';

export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: string;
  data: unknown;
}

export interface MemoryCreatedEvent extends MemoryEvent {
  type: 'memory_created';
  data: {
    memory: Memory;
  };
}

export interface MemoryAccessedEvent extends MemoryEvent {
  type: 'memory_accessed';
  data: {
    memoryId: number;
    memory: Memory;
    newSalience: number;
  };
}

export interface MemoryUpdatedEvent extends MemoryEvent {
  type: 'memory_updated';
  data: {
    memory: Memory;
  };
}

export interface MemoryDeletedEvent extends MemoryEvent {
  type: 'memory_deleted';
  data: {
    memoryId: number;
    title: string;
  };
}

export interface ConsolidationEvent extends MemoryEvent {
  type: 'consolidation_complete';
  data: ConsolidationResult & {
    promotedMemories: number[];
    deletedMemories: number[];
  };
}

export interface DecayTickEvent extends MemoryEvent {
  type: 'decay_tick';
  data: {
    updates: Array<{
      memoryId: number;
      oldScore: number;
      newScore: number;
    }>;
  };
}

// Phase 4: Worker event interfaces
export interface WorkerLightTickEvent extends MemoryEvent {
  type: 'worker_light_tick';
  data: {
    activationsPruned: number;
    predictiveConsolidation: ConsolidationResult | null;
    timestamp: string;
  };
}

export interface WorkerMediumTickEvent extends MemoryEvent {
  type: 'worker_medium_tick';
  data: {
    linksDiscovered: number;
    contradictionsFound: number;
    contradictionsLinked: number;
    memoriesScanned: number;
    timestamp: string;
  };
}

export interface LinkDiscoveredEvent extends MemoryEvent {
  type: 'link_discovered';
  data: {
    sourceId: number;
    targetId: number;
    relationship: string;
    strength: number;
  };
}

export interface PredictiveConsolidationEvent extends MemoryEvent {
  type: 'predictive_consolidation';
  data: {
    trigger: string;
    urgency: string;
    result: ConsolidationResult;
  };
}

// Global event emitter for memory events
class MemoryEventEmitter extends EventEmitter {
  emit(event: MemoryEventType, data: MemoryEvent['data']): boolean {
    const payload: MemoryEvent = {
      type: event,
      timestamp: new Date().toISOString(),
      data,
    };
    return super.emit('memory_event', payload);
  }

  onMemoryEvent(callback: (event: MemoryEvent) => void): void {
    this.on('memory_event', callback);
  }

  offMemoryEvent(callback: (event: MemoryEvent) => void): void {
    this.off('memory_event', callback);
  }
}

// Singleton instance
export const memoryEvents = new MemoryEventEmitter();

// Helper functions to emit events
export function emitMemoryCreated(memory: Memory): void {
  memoryEvents.emit('memory_created', { memory });
}

export function emitMemoryAccessed(memory: Memory, newSalience: number): void {
  memoryEvents.emit('memory_accessed', {
    memoryId: memory.id,
    memory,
    newSalience,
  });
}

export function emitMemoryUpdated(memory: Memory): void {
  memoryEvents.emit('memory_updated', { memory });
}

export function emitMemoryDeleted(memoryId: number, title: string): void {
  memoryEvents.emit('memory_deleted', { memoryId, title });
}

export function emitConsolidation(
  result: ConsolidationResult,
  promotedMemories: number[] = [],
  deletedMemories: number[] = []
): void {
  memoryEvents.emit('consolidation_complete', {
    ...result,
    promotedMemories,
    deletedMemories,
  });
}

export function emitDecayTick(
  updates: Array<{ memoryId: number; oldScore: number; newScore: number }>
): void {
  memoryEvents.emit('decay_tick', { updates });
}

// Phase 4: Worker event emitters
export function emitWorkerLightTick(data: {
  activationsPruned: number;
  predictiveConsolidation: ConsolidationResult | null;
  timestamp: Date;
}): void {
  memoryEvents.emit('worker_light_tick', {
    ...data,
    timestamp: data.timestamp.toISOString(),
  });
}

export function emitWorkerMediumTick(data: {
  linksDiscovered: number;
  contradictionsFound: number;
  contradictionsLinked: number;
  memoriesScanned: number;
  timestamp: Date;
}): void {
  memoryEvents.emit('worker_medium_tick', {
    ...data,
    timestamp: data.timestamp.toISOString(),
  });
}

export function emitLinkDiscovered(data: {
  sourceId: number;
  targetId: number;
  relationship: string;
  strength: number;
}): void {
  memoryEvents.emit('link_discovered', data);
}

export function emitPredictiveConsolidation(data: {
  trigger: string;
  urgency: string;
  result: ConsolidationResult;
}): void {
  memoryEvents.emit('predictive_consolidation', data);
}

// ============================================================================
// Cross-Process IPC via Database
// ============================================================================

/**
 * Persist event to database for cross-process IPC.
 * Called by MCP server when tools are invoked.
 * The API server polls for these events and broadcasts to WebSocket clients.
 */
export function persistEvent(type: MemoryEventType, data?: unknown): void {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO events (type, data, timestamp)
      VALUES (?, ?, ?)
    `);
    stmt.run(type, data ? JSON.stringify(data) : null, new Date().toISOString());
  } catch (error) {
    // Log but don't throw - event persistence is best-effort
    console.error('[Events] Failed to persist event:', error);
  }
}

/**
 * Get unprocessed events from database.
 * Called by API server to poll for new events from MCP process.
 */
export function getUnprocessedEvents(limit = 100): Array<{
  id: number;
  type: MemoryEventType;
  data: unknown;
  timestamp: string;
}> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, type, data, timestamp
      FROM events
      WHERE processed = 0
      ORDER BY id ASC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<{
      id: number;
      type: string;
      data: string | null;
      timestamp: string;
    }>;
    return rows.map(row => ({
      id: row.id,
      type: row.type as MemoryEventType,
      data: row.data ? JSON.parse(row.data) : null,
      timestamp: row.timestamp,
    }));
  } catch (error) {
    console.error('[Events] Failed to get events:', error);
    return [];
  }
}

/**
 * Mark events as processed after broadcasting.
 */
export function markEventsProcessed(ids: number[]): void {
  if (ids.length === 0) return;
  try {
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE events SET processed = 1 WHERE id IN (${placeholders})`).run(...ids);
  } catch (error) {
    console.error('[Events] Failed to mark events processed:', error);
  }
}

/**
 * Cleanup old processed events (keep last 24 hours).
 * Called periodically by API server.
 */
export function cleanupOldEvents(): void {
  try {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`DELETE FROM events WHERE processed = 1 AND timestamp < ?`).run(cutoff);
    if (result.changes > 0) {
      console.log(`[Events] Cleaned up ${result.changes} old events`);
    }
  } catch (error) {
    console.error('[Events] Failed to cleanup events:', error);
  }
}
