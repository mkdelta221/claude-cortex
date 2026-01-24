/**
 * Event Emitter for Memory Events
 *
 * Broadcasts memory changes to connected WebSocket clients
 * for real-time visualization updates.
 */

import { EventEmitter } from 'events';
import { Memory, ConsolidationResult } from '../memory/types.js';

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
  | 'predictive_consolidation';

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
