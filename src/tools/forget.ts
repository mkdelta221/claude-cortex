/**
 * Forget Tool
 *
 * Delete memories - either individually or in bulk.
 */

import { z } from 'zod';
import { deleteMemory, searchMemories, getMemoryById } from '../memory/store.js';
import { getDatabase, withTransaction } from '../database/init.js';
import {
  MemoryNotFoundError,
  BulkDeleteSafetyError,
  formatErrorForMcp,
} from '../errors.js';
import { resolveProject } from '../context/project-context.js';

// Input schema for the forget tool
export const forgetSchema = z.object({
  id: z.number().optional().describe('Specific memory ID to delete'),
  query: z.string().optional().describe('Delete memories matching this query'),
  category: z.enum([
    'architecture', 'pattern', 'preference', 'error',
    'context', 'learning', 'todo', 'note', 'relationship', 'custom'
  ]).optional().describe('Delete all memories in this category'),
  project: z.string().optional().describe('Delete all memories for this project'),
  olderThan: z.number().optional().describe('Delete memories older than N days'),
  belowSalience: z.number().min(0).max(1).optional()
    .describe('Delete memories with salience below this threshold'),
  dryRun: z.boolean().optional().default(false)
    .describe('Preview what would be deleted without actually deleting'),
  confirm: z.boolean().optional().default(false)
    .describe('Confirm bulk deletion (required for operations affecting multiple memories)'),
});

export type ForgetInput = z.infer<typeof forgetSchema>;

/**
 * Execute the forget tool
 */
export function executeForget(input: ForgetInput): {
  success: boolean;
  deleted?: number;
  wouldDelete?: number;
  memories?: { id: number; title: string }[];
  error?: string;
} {
  try {
    const db = getDatabase();

    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);

    // Single ID deletion
    if (input.id !== undefined) {
      const memory = getMemoryById(input.id);
      if (!memory) {
        const error = new MemoryNotFoundError(input.id);
        return {
          success: false,
          error: error.toUserMessage(),
        };
      }

      if (input.dryRun) {
        return {
          success: true,
          wouldDelete: 1,
          memories: [{ id: memory.id, title: memory.title }],
        };
      }

      deleteMemory(input.id);
      return {
        success: true,
        deleted: 1,
        memories: [{ id: memory.id, title: memory.title }],
      };
    }

    // Build bulk delete query
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (input.query) {
      // Get IDs from FTS search
      const results = searchMemories({
        query: input.query,
        limit: 100,
        includeDecayed: true,
      });
      if (results.length === 0) {
        return { success: true, deleted: 0, memories: [] };
      }
      const ids = results.map(r => r.memory.id);
      conditions.push(`id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    if (input.category) {
      conditions.push('category = ?');
      params.push(input.category);
    }

    if (resolvedProject) {
      conditions.push('project = ?');
      params.push(resolvedProject);
    }

    if (input.olderThan !== undefined) {
      conditions.push("created_at < datetime('now', ? || ' days')");
      params.push(-input.olderThan);
    }

    if (input.belowSalience !== undefined) {
      conditions.push('salience < ?');
      params.push(input.belowSalience);
    }

    if (conditions.length === 0) {
      return {
        success: false,
        error: 'No deletion criteria specified. Provide id, query, category, project, olderThan, or belowSalience.',
      };
    }

    const whereClause = conditions.join(' AND ');

    // Get affected memories
    const affected = db.prepare(
      `SELECT id, title FROM memories WHERE ${whereClause}`
    ).all(...params) as { id: number; title: string }[];

    if (affected.length === 0) {
      return { success: true, deleted: 0, memories: [] };
    }

    // Dry run - just show what would be deleted
    if (input.dryRun) {
      return {
        success: true,
        wouldDelete: affected.length,
        memories: affected.slice(0, 20), // Limit preview
      };
    }

    // Require confirmation for bulk deletes
    if (affected.length > 1 && !input.confirm) {
      const error = new BulkDeleteSafetyError(affected.length);
      return {
        success: false,
        wouldDelete: affected.length,
        memories: affected.slice(0, 10),
        error: error.toUserMessage(),
      };
    }

    // Execute deletion within a transaction for atomicity
    withTransaction(() => {
      db.prepare(`DELETE FROM memories WHERE ${whereClause}`).run(...params);
    });

    return {
      success: true,
      deleted: affected.length,
      memories: affected,
    };
  } catch (error) {
    return {
      success: false,
      error: formatErrorForMcp(error),
    };
  }
}

/**
 * Format the forget result for MCP response
 */
export function formatForgetResult(result: ReturnType<typeof executeForget>): string {
  if (!result.success) {
    if (result.wouldDelete !== undefined) {
      const preview = result.memories?.map(m => `  - [${m.id}] ${m.title}`).join('\n') || '';
      return [
        `⚠️  ${result.error}`,
        '',
        'Preview of memories to delete:',
        preview,
        result.memories && result.memories.length < (result.wouldDelete || 0)
          ? `  ... and ${(result.wouldDelete || 0) - result.memories.length} more`
          : '',
      ].join('\n');
    }
    return `Failed to forget: ${result.error}`;
  }

  if (result.wouldDelete !== undefined) {
    // Dry run result
    const preview = result.memories?.map(m => `  - [${m.id}] ${m.title}`).join('\n') || '';
    return [
      `🔍 Dry run: Would delete ${result.wouldDelete} ${result.wouldDelete === 1 ? 'memory' : 'memories'}:`,
      preview,
      result.memories && result.memories.length < result.wouldDelete
        ? `  ... and ${result.wouldDelete - result.memories.length} more`
        : '',
    ].join('\n');
  }

  if (result.deleted === 0) {
    return 'No memories matched the deletion criteria.';
  }

  const deleted = result.memories?.map(m => `  - [${m.id}] ${m.title}`).join('\n') || '';
  return [
    `✓ Deleted ${result.deleted} ${result.deleted === 1 ? 'memory' : 'memories'}:`,
    deleted,
  ].join('\n');
}
