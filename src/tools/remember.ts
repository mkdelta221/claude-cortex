/**
 * Remember Tool
 *
 * Store memories with automatic salience detection and categorization.
 */

import { z } from 'zod';
import { addMemory, searchMemories, detectRelationships, createMemoryLink, getLastTruncationInfo } from '../memory/store.js';
import { calculateSalience, analyzeSalienceFactors, explainSalience } from '../memory/salience.js';
import { MemoryCategory, MemoryType } from '../memory/types.js';
import { formatErrorForMcp } from '../errors.js';
import { resolveProject } from '../context/project-context.js';

// Input schema for the remember tool
export const rememberSchema = z.object({
  title: z.string().describe('Short title for the memory (what to remember)'),
  content: z.string().describe('Detailed content of the memory'),
  category: z.enum([
    'architecture', 'pattern', 'preference', 'error',
    'context', 'learning', 'todo', 'note', 'relationship', 'custom'
  ]).optional().describe('Category of memory (auto-detected if not provided)'),
  type: z.enum(['short_term', 'long_term', 'episodic']).optional()
    .describe('Memory type (auto-determined based on salience if not provided)'),
  project: z.string().optional().describe('Project this memory belongs to'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  importance: z.enum(['low', 'normal', 'high', 'critical']).optional()
    .describe('Override automatic salience detection'),
});

export type RememberInput = z.infer<typeof rememberSchema>;

/**
 * Execute the remember tool
 */
export function executeRemember(input: RememberInput): {
  success: boolean;
  memory?: {
    id: number;
    title: string;
    salience: number;
    type: MemoryType;
    category: MemoryCategory;
    reason: string;
    linksCreated?: number;
    truncated?: {
      wasTruncated: boolean;
      originalLength: number;
      truncatedLength: number;
    };
  };
  error?: string;
} {
  try {
    // Resolve project (auto-detect if not provided)
    const resolvedProject = resolveProject(input.project);

    // Map importance to salience override
    let salienceOverride: number | undefined;
    if (input.importance) {
      const importanceMap: Record<string, number> = {
        low: 0.3,
        normal: 0.5,
        high: 0.8,
        critical: 1.0,
      };
      salienceOverride = importanceMap[input.importance];
    }

    // Check for duplicates
    const existing = searchMemories({
      query: input.title,
      project: resolvedProject ?? undefined,
      limit: 3,
    });

    // If very similar memory exists, update instead
    if (existing.length > 0 && existing[0].relevanceScore > 0.9) {
      const existingMemory = existing[0].memory;
      return {
        success: true,
        memory: {
          id: existingMemory.id,
          title: existingMemory.title,
          salience: existingMemory.salience,
          type: existingMemory.type,
          category: existingMemory.category,
          reason: 'Updated existing similar memory',
        },
      };
    }

    // Create the memory
    const memory = addMemory({
      title: input.title,
      content: input.content,
      category: input.category,
      type: input.type,
      project: resolvedProject ?? undefined,
      tags: input.tags,
      salience: salienceOverride,
    });

    // Auto-detect and create relationships with existing memories
    let linksCreated = 0;
    try {
      const potentialLinks = detectRelationships(memory, 3);
      for (const link of potentialLinks) {
        const created = createMemoryLink(memory.id, link.targetId, link.relationship, link.strength);
        if (created) linksCreated++;
      }
    } catch {
      // Silently ignore relationship detection errors
    }

    // Explain why this was remembered
    const factors = analyzeSalienceFactors({ title: input.title, content: input.content });
    const reason = explainSalience(factors);

    // Check if content was truncated
    const truncationInfo = getLastTruncationInfo();

    return {
      success: true,
      memory: {
        id: memory.id,
        title: memory.title,
        salience: memory.salience,
        type: memory.type,
        category: memory.category,
        reason,
        linksCreated,
        truncated: truncationInfo?.wasTruncated ? truncationInfo : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: formatErrorForMcp(error),
    };
  }
}

/**
 * Format the remember result for MCP response
 */
export function formatRememberResult(result: ReturnType<typeof executeRemember>): string {
  if (!result.success) {
    return `Failed to remember: ${result.error}`;
  }

  const m = result.memory!;
  const lines = [
    `✓ Remembered: "${m.title}"`,
    `  ID: ${m.id}`,
    `  Type: ${m.type}`,
    `  Category: ${m.category}`,
    `  Salience: ${(m.salience * 100).toFixed(0)}%`,
    `  Reason: ${m.reason}`,
  ];
  if (m.linksCreated && m.linksCreated > 0) {
    lines.push(`  Links: ${m.linksCreated} related memories connected`);
  }
  if (m.truncated && m.truncated.wasTruncated) {
    const originalKB = (m.truncated.originalLength / 1024).toFixed(1);
    const truncatedKB = (m.truncated.truncatedLength / 1024).toFixed(1);
    lines.push(`  ⚠️  WARNING: Content truncated from ${originalKB}KB to ${truncatedKB}KB (10KB limit)`);
    lines.push(`  Consider splitting large memories into smaller, focused pieces.`);
  }
  return lines.join('\n');
}
