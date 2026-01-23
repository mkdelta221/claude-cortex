/**
 * Context Tool
 *
 * Manages context injection and session handling.
 * This is the key tool for solving the compaction problem.
 */

import { z } from 'zod';
import {
  generateContextSummary,
  formatContextSummary,
  startSession,
  endSession,
  getSuggestedContext,
  consolidate,
  exportMemories,
  importMemories,
} from '../memory/consolidate.js';
import { getMemoryStats, getProjectMemories } from '../memory/store.js';
import { Memory, ContextSummary, ConsolidationResult } from '../memory/types.js';
import { resolveProject } from '../context/project-context.js';

// Input schema for getting context
export const getContextSchema = z.object({
  project: z.string().optional().describe('Project to get context for'),
  query: z.string().optional().describe('Current query/task to find relevant context for'),
  format: z.enum(['summary', 'detailed', 'raw']).optional().default('summary')
    .describe('Output format'),
});

export type GetContextInput = z.infer<typeof getContextSchema>;

/**
 * Execute the get_context tool
 */
export function executeGetContext(input: GetContextInput): {
  success: boolean;
  context?: string;
  summary?: ContextSummary;
  relevantMemories?: Memory[];
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);
    const projectFilter = resolvedProject ?? undefined;

    // Generate context summary
    const summary = generateContextSummary(projectFilter);

    // If there's a query, also get specifically relevant memories
    let relevantMemories: Memory[] = [];
    if (input.query) {
      relevantMemories = getSuggestedContext(input.query, projectFilter, 5);
    }

    // Format based on requested format
    let context: string;
    switch (input.format) {
      case 'raw':
        context = JSON.stringify({ summary, relevantMemories }, null, 2);
        break;
      case 'detailed':
        context = formatDetailedContext(summary, relevantMemories);
        break;
      case 'summary':
      default:
        context = formatContextSummary(summary);
        if (relevantMemories.length > 0) {
          context += '\n\n### Relevant to Current Query\n';
          context += relevantMemories.map(m =>
            `- **${m.title}**: ${m.content.slice(0, 100)}...`
          ).join('\n');
        }
        break;
    }

    return {
      success: true,
      context,
      summary,
      relevantMemories,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format detailed context output
 */
function formatDetailedContext(summary: ContextSummary, relevant: Memory[]): string {
  const lines: string[] = [];

  if (summary.project) {
    lines.push(`# Project Context: ${summary.project}\n`);
  } else {
    lines.push('# Memory Context\n');
  }

  // Key decisions
  if (summary.keyDecisions.length > 0) {
    lines.push('## Architecture & Decisions\n');
    for (const m of summary.keyDecisions) {
      lines.push(`### ${m.title}`);
      lines.push(m.content);
      lines.push(`*Salience: ${(m.salience * 100).toFixed(0)}% | Category: ${m.category}*\n`);
    }
  }

  // Patterns
  if (summary.activePatterns.length > 0) {
    lines.push('## Active Patterns\n');
    for (const m of summary.activePatterns) {
      lines.push(`### ${m.title}`);
      lines.push(m.content);
      lines.push('');
    }
  }

  // Pending
  if (summary.pendingItems.length > 0) {
    lines.push('## Pending Items\n');
    for (const m of summary.pendingItems) {
      lines.push(`- [ ] **${m.title}**: ${m.content.slice(0, 100)}`);
    }
    lines.push('');
  }

  // Relevant to query
  if (relevant.length > 0) {
    lines.push('## Relevant to Current Context\n');
    for (const m of relevant) {
      lines.push(`### ${m.title}`);
      lines.push(m.content);
      lines.push(`*Type: ${m.type} | Tags: ${m.tags.join(', ') || 'none'}*\n`);
    }
  }

  // Recent activity
  if (summary.recentMemories.length > 0) {
    lines.push('## Recent Activity\n');
    for (const m of summary.recentMemories.slice(0, 5)) {
      lines.push(`- **${m.title}** (${m.category})`);
    }
  }

  return lines.join('\n');
}

// Session management
export const startSessionSchema = z.object({
  project: z.string().optional().describe('Project for this session'),
});

export function executeStartSession(input: { project?: string }): {
  success: boolean;
  sessionId?: number;
  context?: string;
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);
    const projectFilter = resolvedProject ?? undefined;

    const { sessionId, context } = startSession(projectFilter);
    const formattedContext = formatContextSummary(context);

    return {
      success: true,
      sessionId,
      context: formattedContext,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const endSessionSchema = z.object({
  sessionId: z.number().describe('Session ID to end'),
  summary: z.string().optional().describe('Summary of what was accomplished'),
});

export function executeEndSession(input: { sessionId: number; summary?: string }): {
  success: boolean;
  consolidationResult?: ConsolidationResult;
  error?: string;
} {
  try {
    endSession(input.sessionId, input.summary);

    // Run consolidation
    const consolidationResult = consolidate();

    return {
      success: true,
      consolidationResult,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Consolidation
export const consolidateSchema = z.object({
  force: z.boolean().optional().default(false)
    .describe('Force consolidation even if not due'),
});

export function executeConsolidate(input: { force?: boolean }): {
  success: boolean;
  result?: ConsolidationResult;
  error?: string;
} {
  try {
    const result = consolidate();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Stats
export const statsSchema = z.object({
  project: z.string().optional().describe('Get stats for specific project'),
});

export function executeStats(input: { project?: string }): {
  success: boolean;
  stats?: ReturnType<typeof getMemoryStats>;
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);
    const projectFilter = resolvedProject ?? undefined;

    const stats = getMemoryStats(projectFilter);
    return { success: true, stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function formatStats(stats: ReturnType<typeof getMemoryStats>): string {
  const lines = [
    '## Memory Statistics',
    '',
    `Total memories: ${stats.total}`,
    `  - Short-term: ${stats.shortTerm}`,
    `  - Long-term: ${stats.longTerm}`,
    `  - Episodic: ${stats.episodic}`,
    '',
    `Average salience: ${(stats.averageSalience * 100).toFixed(1)}%`,
    '',
    '### By Category',
  ];

  for (const [category, count] of Object.entries(stats.byCategory)) {
    lines.push(`  - ${category}: ${count}`);
  }

  return lines.join('\n');
}

// Export/Import
export const exportSchema = z.object({
  project: z.string().optional().describe('Export only memories for this project'),
});

export function executeExport(input: { project?: string }): {
  success: boolean;
  data?: string;
  count?: number;
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);
    const projectFilter = resolvedProject ?? undefined;

    const data = exportMemories(projectFilter);
    const memories = JSON.parse(data);
    return {
      success: true,
      data,
      count: memories.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const importSchema = z.object({
  data: z.string().describe('JSON data to import'),
});

export function executeImport(input: { data: string }): {
  success: boolean;
  imported?: number;
  error?: string;
} {
  try {
    const imported = importMemories(input.data);
    return { success: true, imported };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
