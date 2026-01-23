/**
 * Recall Tool
 *
 * Search and retrieve memories using semantic search and filters.
 */

import { z } from 'zod';
import { searchMemories, accessMemory, getRecentMemories, getHighPriorityMemories } from '../memory/store.js';
import { formatTimeSinceAccess } from '../memory/decay.js';
import { Memory, SearchResult } from '../memory/types.js';
import { MemoryNotFoundError, formatErrorForMcp } from '../errors.js';
import { resolveProject } from '../context/project-context.js';

// Input schema for the recall tool
export const recallSchema = z.object({
  query: z.string().optional().describe('Search query (semantic search)'),
  category: z.enum([
    'architecture', 'pattern', 'preference', 'error',
    'context', 'learning', 'todo', 'note', 'relationship', 'custom'
  ]).optional().describe('Filter by category'),
  type: z.enum(['short_term', 'long_term', 'episodic']).optional()
    .describe('Filter by memory type'),
  project: z.string().optional().describe('Filter by project'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  limit: z.number().min(1).max(50).optional().default(10)
    .describe('Maximum number of results'),
  includeDecayed: z.boolean().optional().default(false)
    .describe('Include memories that have decayed below threshold'),
  mode: z.enum(['search', 'recent', 'important']).optional().default('search')
    .describe('Recall mode: search (query-based), recent (by time), important (by salience)'),
});

export type RecallInput = z.infer<typeof recallSchema>;

/**
 * Execute the recall tool
 */
export function executeRecall(input: RecallInput): {
  success: boolean;
  memories?: Memory[];
  count?: number;
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);
    const projectFilter = resolvedProject ?? undefined;

    let memories: Memory[] = [];

    switch (input.mode) {
      case 'recent':
        memories = getRecentMemories(input.limit, projectFilter);
        break;

      case 'important':
        memories = getHighPriorityMemories(input.limit, projectFilter);
        break;

      case 'search':
      default:
        const results = searchMemories({
          query: input.query || '',
          category: input.category,
          type: input.type,
          project: projectFilter,
          tags: input.tags,
          limit: input.limit,
          includeDecayed: input.includeDecayed,
        });
        memories = results.map(r => r.memory);
        break;
    }

    // Access each memory to reinforce it
    memories = memories.map(m => accessMemory(m.id) || m);

    return {
      success: true,
      memories,
      count: memories.length,
    };
  } catch (error) {
    return {
      success: false,
      error: formatErrorForMcp(error),
    };
  }
}

/**
 * Format a single memory for display
 */
export function formatMemory(memory: Memory, verbose: boolean = false): string {
  const lines = [
    `[${memory.id}] **${memory.title}**`,
    `    ${memory.content.slice(0, 200)}${memory.content.length > 200 ? '...' : ''}`,
  ];

  if (verbose) {
    lines.push(`    Type: ${memory.type} | Category: ${memory.category}`);
    lines.push(`    Salience: ${(memory.salience * 100).toFixed(0)}% | Accessed: ${memory.accessCount}x`);
    lines.push(`    Last access: ${formatTimeSinceAccess(memory)}`);
    if (memory.tags.length > 0) {
      lines.push(`    Tags: ${memory.tags.join(', ')}`);
    }
    if (memory.project) {
      lines.push(`    Project: ${memory.project}`);
    }
  } else {
    lines.push(`    (${memory.type}, ${memory.category}, ${formatTimeSinceAccess(memory)})`);
  }

  return lines.join('\n');
}

/**
 * Format the recall result for MCP response
 */
export function formatRecallResult(
  result: ReturnType<typeof executeRecall>,
  verbose: boolean = false
): string {
  if (!result.success) {
    return `Failed to recall: ${result.error}`;
  }

  if (!result.memories || result.memories.length === 0) {
    return 'No memories found matching your query.';
  }

  const header = `Found ${result.count} ${result.count === 1 ? 'memory' : 'memories'}:\n`;
  const formattedMemories = result.memories.map(m => formatMemory(m, verbose)).join('\n\n');

  return header + formattedMemories;
}

/**
 * Get a single memory by ID
 */
export const getMemorySchema = z.object({
  id: z.number().describe('Memory ID to retrieve'),
});

export function executeGetMemory(input: { id: number }): {
  success: boolean;
  memory?: Memory;
  error?: string;
} {
  try {
    const memory = accessMemory(input.id);
    if (!memory) {
      const error = new MemoryNotFoundError(input.id);
      return {
        success: false,
        error: error.toUserMessage(),
      };
    }
    return { success: true, memory };
  } catch (error) {
    return {
      success: false,
      error: formatErrorForMcp(error),
    };
  }
}
