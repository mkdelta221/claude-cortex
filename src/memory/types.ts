/**
 * Core type definitions for the Claude Memory system
 */

export type MemoryType = 'short_term' | 'long_term' | 'episodic';

export type MemoryCategory =
  | 'architecture'    // System design decisions
  | 'pattern'         // Code patterns and practices
  | 'preference'      // User coding preferences
  | 'error'           // Error resolutions
  | 'context'         // Project context
  | 'learning'        // Things learned during session
  | 'todo'            // Pending tasks
  | 'note'            // General notes
  | 'relationship'    // Code relationships/dependencies
  | 'custom';         // User-defined

export interface Memory {
  id: number;
  type: MemoryType;
  category: MemoryCategory;
  title: string;
  content: string;
  project?: string;
  tags: string[];
  salience: number;        // 0.0 - 1.0, importance score
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  decayedScore: number;    // Current score after decay
  metadata: Record<string, unknown>;
}

export interface MemoryInput {
  type?: MemoryType;
  category?: MemoryCategory;
  title: string;
  content: string;
  project?: string;
  tags?: string[];
  salience?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  project?: string;
  category?: MemoryCategory;
  type?: MemoryType;
  tags?: string[];
  minSalience?: number;
  limit?: number;
  includeDecayed?: boolean;  // Include memories below decay threshold
}

export interface SearchResult {
  memory: Memory;
  relevanceScore: number;   // Combined search + salience + recency
}

export interface ConsolidationResult {
  consolidated: number;     // Memories moved to long-term
  decayed: number;          // Memories that decayed
  deleted: number;          // Memories removed due to low score
}

export interface ContextSummary {
  project?: string;
  recentMemories: Memory[];
  keyDecisions: Memory[];
  activePatterns: Memory[];
  pendingItems: Memory[];
}

// Salience factors for automatic scoring
export interface SalienceFactors {
  explicitRequest: boolean;      // User said "remember"
  isArchitectureDecision: boolean;
  isErrorResolution: boolean;
  isCodePattern: boolean;
  isUserPreference: boolean;
  mentionCount: number;          // How many times topic mentioned
  hasCodeReference: boolean;     // References specific files/functions
  emotionalMarkers: boolean;     // Frustration, success indicators
}

// Configuration for the memory system
export interface MemoryConfig {
  dbPath: string;
  decayRate: number;           // Per-hour decay factor (default 0.995)
  reinforcementFactor: number; // Access boost (default 1.2)
  salienceThreshold: number;   // Min score to keep (default 0.2)
  consolidationThreshold: number; // Min score for STM→LTM (default 0.6)
  maxShortTermMemories: number;
  maxLongTermMemories: number;
  autoConsolidateHours: number; // Auto-consolidate after N hours
}

export const DEFAULT_CONFIG: MemoryConfig = {
  dbPath: '~/.claude-memory/memories.db',
  decayRate: 0.995,
  reinforcementFactor: 1.2,
  salienceThreshold: 0.2, // Lowered from 0.3 to match reduced base salience (0.25)
  consolidationThreshold: 0.6,
  maxShortTermMemories: 100,
  maxLongTermMemories: 1000,
  autoConsolidateHours: 4,
};

/**
 * Category-specific deletion thresholds
 * Lower threshold = harder to delete (more valuable)
 */
export const DELETION_THRESHOLDS: Record<MemoryCategory, number> = {
  architecture: 0.15,  // Hardest to delete - high value, rarely changes
  error: 0.15,         // Valuable for debugging
  pattern: 0.18,       // Important code patterns
  preference: 0.20,    // User preferences
  context: 0.22,       // Project context
  learning: 0.20,      // Learnings from sessions
  relationship: 0.20,  // Code relationships
  note: 0.25,          // General notes - easier to delete
  todo: 0.25,          // Todos - easier to delete
  custom: 0.22,        // Custom memories
};
