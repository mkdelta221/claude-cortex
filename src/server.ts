/**
 * Claude Memory MCP Server
 *
 * Brain-like memory system for Claude Code.
 * Solves context compaction and memory persistence issues.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { initDatabase } from './database/init.js';
import { DEFAULT_CONFIG } from './memory/types.js';
import {
  initProjectContext,
  getActiveProject,
  setActiveProject,
  getProjectContextInfo,
  GLOBAL_PROJECT_SENTINEL,
} from './context/project-context.js';

// Import tools
import { rememberSchema, executeRemember, formatRememberResult } from './tools/remember.js';
import { recallSchema, executeRecall, formatRecallResult, getMemorySchema, executeGetMemory, formatMemory } from './tools/recall.js';
import { forgetSchema, executeForget, formatForgetResult } from './tools/forget.js';
import {
  getContextSchema, executeGetContext,
  startSessionSchema, executeStartSession,
  endSessionSchema, executeEndSession,
  consolidateSchema, executeConsolidate,
  statsSchema, executeStats, formatStats,
  exportSchema, executeExport,
  importSchema, executeImport,
} from './tools/context.js';
import { generateContextSummary, formatContextSummary, consolidate, fullCleanup } from './memory/consolidate.js';
import { getHighPriorityMemories, getRecentMemories, getRelatedMemories, createMemoryLink, RelationshipType, enrichMemory } from './memory/store.js';
import { detectContradictions, getContradictionsFor } from './memory/contradiction.js';
import { checkDatabaseSize } from './database/init.js';

/**
 * Create and configure the MCP server
 */
export function createServer(dbPath?: string): McpServer {
  // Initialize database
  const config = { ...DEFAULT_CONFIG };
  if (dbPath) {
    config.dbPath = dbPath;
  }
  initDatabase(config.dbPath);

  // Initialize project context (auto-detect from working directory)
  initProjectContext();
  const projectInfo = getProjectContextInfo();
  if (projectInfo.project) {
    console.error(`[claude-cortex] Project: "${projectInfo.project}" (from ${projectInfo.source})`);
  } else {
    console.error('[claude-cortex] Project: global scope');
  }

  // Create MCP server
  const server = new McpServer({
    name: 'claude-cortex',
    version: '1.0.0',
  });

  // ============================================
  // TOOLS
  // ============================================

  // Remember - Store a memory
  server.tool(
    'remember',
    `Store information in memory for later recall. Use this to remember:
- Architecture decisions ("We're using PostgreSQL for the database")
- Code patterns ("The auth flow uses JWT tokens")
- User preferences ("Always use TypeScript strict mode")
- Error resolutions ("Fixed by updating the dependency")
- Project context ("This is a React + Node.js project")
- Important notes ("Remember to test the edge cases")

The system automatically detects importance, categorizes, and manages storage.`,
    {
      title: z.string().describe('Short title for the memory'),
      content: z.string().describe('Detailed content'),
      category: z.enum([
        'architecture', 'pattern', 'preference', 'error',
        'context', 'learning', 'todo', 'note', 'relationship', 'custom'
      ]).optional().describe('Category (auto-detected if not provided)'),
      type: z.enum(['short_term', 'long_term', 'episodic']).optional()
        .describe('Memory type (auto-determined if not provided)'),
      project: z.string().optional().describe('Project scope. Auto-detected from working directory if not provided. Use "*" for global.'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      importance: z.enum(['low', 'normal', 'high', 'critical']).optional()
        .describe('Override automatic salience'),
      scope: z.enum(['project', 'global']).optional()
        .describe('Memory scope: project (default) or global (cross-project)'),
      transferable: z.boolean().optional()
        .describe('Whether this memory can be transferred to other projects'),
    },
    async (args) => {
      const result = await executeRemember(args);
      return {
        content: [{ type: 'text', text: formatRememberResult(result) }],
      };
    }
  );

  // Recall - Search and retrieve memories
  server.tool(
    'recall',
    `Search and retrieve memories. Use this to:
- Find relevant context ("What do I know about auth?")
- Get recent activity ("What did we work on?")
- Find decisions ("What architecture decisions were made?")

Modes: search (query-based), recent (by time), important (by salience)`,
    {
      query: z.string().optional().describe('Search query'),
      category: z.enum([
        'architecture', 'pattern', 'preference', 'error',
        'context', 'learning', 'todo', 'note', 'relationship', 'custom'
      ]).optional().describe('Filter by category'),
      type: z.enum(['short_term', 'long_term', 'episodic']).optional()
        .describe('Filter by type'),
      project: z.string().optional().describe('Project scope. Auto-detected if not provided. Use "*" for all projects.'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      limit: z.number().min(1).max(50).optional().default(10)
        .describe('Max results'),
      includeDecayed: z.boolean().optional().default(false)
        .describe('Include decayed memories'),
      includeGlobal: z.boolean().optional().default(true)
        .describe('Include global memories in search results (default: true)'),
      mode: z.enum(['search', 'recent', 'important']).optional().default('search')
        .describe('Recall mode'),
    },
    async (args) => {
      const result = await executeRecall(args);
      return {
        content: [{ type: 'text', text: formatRecallResult(result, true) }],
      };
    }
  );

  // Forget - Delete memories
  server.tool(
    'forget',
    `Delete memories. Use dryRun: true to preview, confirm: true for bulk.`,
    {
      id: z.number().optional().describe('Memory ID to delete'),
      query: z.string().optional().describe('Delete matching query'),
      category: z.enum([
        'architecture', 'pattern', 'preference', 'error',
        'context', 'learning', 'todo', 'note', 'relationship', 'custom'
      ]).optional().describe('Delete category'),
      project: z.string().optional().describe('Project scope for deletion. Auto-detected if not provided. Use "*" for all projects.'),
      olderThan: z.number().optional().describe('Delete older than N days'),
      belowSalience: z.number().min(0).max(1).optional()
        .describe('Delete below salience'),
      dryRun: z.boolean().optional().default(false)
        .describe('Preview only'),
      confirm: z.boolean().optional().default(false)
        .describe('Confirm bulk delete'),
    },
    async (args) => {
      const result = await executeForget(args);
      return {
        content: [{ type: 'text', text: formatForgetResult(result) }],
      };
    }
  );

  // Get Context - THE KEY TOOL
  server.tool(
    'get_context',
    `Get relevant context from memory. THE KEY TOOL for maintaining context.

Use at session start, after compaction, when switching tasks, or to recall project info.
Returns: architecture decisions, patterns, pending items, recent activity.`,
    {
      project: z.string().optional().describe('Project scope. Auto-detected if not provided. Use "*" for all projects.'),
      query: z.string().optional().describe('Current task for relevant context'),
      format: z.enum(['summary', 'detailed', 'raw']).optional().default('summary')
        .describe('Output format'),
    },
    async (args) => {
      const result = await executeGetContext(args);
      return {
        content: [{
          type: 'text',
          text: result.success ? result.context! : `Error: ${result.error}`
        }],
      };
    }
  );

  // Start Session
  server.tool(
    'start_session',
    'Start a new coding session. Returns relevant context.',
    {
      project: z.string().optional().describe('Project scope. Auto-detected if not provided. Use "*" for global.'),
    },
    async (args) => {
      const result = await executeStartSession(args);
      return {
        content: [{
          type: 'text',
          text: result.success
            ? `Session ${result.sessionId} started.\n\n${result.context}`
            : `Error: ${result.error}`
        }],
      };
    }
  );

  // End Session
  server.tool(
    'end_session',
    'End session and trigger consolidation.',
    {
      sessionId: z.number().describe('Session ID'),
      summary: z.string().optional().describe('Session summary'),
    },
    async (args) => {
      const result = executeEndSession(args);
      if (!result.success) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
      }
      const r = result.consolidationResult!;
      return {
        content: [{
          type: 'text',
          text: `Session ended. Consolidation: ${r.consolidated} promoted, ${r.decayed} decayed, ${r.deleted} deleted.`
        }],
      };
    }
  );

  // Consolidate
  server.tool(
    'consolidate',
    'Run memory consolidation (like brain sleep). Promotes STM to LTM, decays old memories. Use dryRun to preview.',
    {
      force: z.boolean().optional().default(false).describe('Force consolidation'),
      dryRun: z.boolean().optional().default(false).describe('Preview what would happen without doing it'),
    },
    async (args) => {
      const result = executeConsolidate(args);
      if (!result.success) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
      }

      // Dry run returns preview
      if (result.preview) {
        const p = result.preview;
        const lines = [
          '## Consolidation Preview (Dry Run)',
          '',
          `Would promote: ${p.toPromote} memories`,
          `Would delete: ${p.toDelete} memories`,
        ];
        if (p.promoteList.length > 0) {
          lines.push('', '**To promote:**');
          lines.push(...p.promoteList.map(t => `  - ${t}`));
        }
        if (p.deleteList.length > 0) {
          lines.push('', '**At risk of deletion:**');
          lines.push(...p.deleteList.map(t => `  - ${t}`));
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // Actual consolidation result
      const r = result.result!;
      return {
        content: [{
          type: 'text',
          text: `Consolidation: ${r.consolidated} promoted, ${r.decayed} updated, ${r.deleted} deleted.`
        }],
      };
    }
  );

  // Stats
  server.tool(
    'memory_stats',
    'Get memory statistics.',
    {
      project: z.string().optional().describe('Project scope. Auto-detected if not provided. Use "*" for all projects.'),
    },
    async (args) => {
      const result = executeStats(args);
      return {
        content: [{
          type: 'text',
          text: result.success ? formatStats(result.stats!) : `Error: ${result.error}`
        }],
      };
    }
  );

  // Get Memory by ID
  server.tool(
    'get_memory',
    'Get a specific memory by ID.',
    {
      id: z.number().describe('Memory ID'),
    },
    async (args) => {
      const result = executeGetMemory(args);
      return {
        content: [{
          type: 'text',
          text: result.success ? formatMemory(result.memory!, true) : `Error: ${result.error}`
        }],
      };
    }
  );

  // Export memories
  server.tool(
    'export_memories',
    'Export memories as JSON for backup.',
    {
      project: z.string().optional().describe('Project scope. Auto-detected if not provided. Use "*" for all projects.'),
    },
    async (args) => {
      const result = executeExport(args);
      return {
        content: [{
          type: 'text',
          text: result.success
            ? `Exported ${result.count} memories:\n\n${result.data}`
            : `Error: ${result.error}`
        }],
      };
    }
  );

  // Import memories
  server.tool(
    'import_memories',
    'Import memories from JSON.',
    {
      data: z.string().describe('JSON data'),
    },
    async (args) => {
      const result = executeImport(args);
      return {
        content: [{
          type: 'text',
          text: result.success
            ? `Imported ${result.imported} memories.`
            : `Error: ${result.error}`
        }],
      };
    }
  );

  // Get Related Memories
  server.tool(
    'get_related',
    'Get memories related to a specific memory. Shows connections and relationships.',
    {
      id: z.number().describe('Memory ID to find relationships for'),
    },
    async (args) => {
      const related = getRelatedMemories(args.id);
      if (related.length === 0) {
        return { content: [{ type: 'text', text: 'No related memories found.' }] };
      }
      const lines = [`## Related Memories for ID ${args.id}\n`];
      for (const r of related) {
        const arrow = r.direction === 'outgoing' ? '→' : '←';
        lines.push(`${arrow} **${r.memory.title}** (${r.relationship}, ${(r.strength * 100).toFixed(0)}% strength)`);
        lines.push(`  ID: ${r.memory.id} | ${r.memory.category} | ${(r.memory.salience * 100).toFixed(0)}% salience`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // Link Memories
  server.tool(
    'link_memories',
    'Create a relationship link between two memories.',
    {
      sourceId: z.number().describe('Source memory ID'),
      targetId: z.number().describe('Target memory ID'),
      relationship: z.enum(['references', 'extends', 'contradicts', 'related'])
        .describe('Type of relationship'),
      strength: z.number().min(0).max(1).optional().default(0.5)
        .describe('Relationship strength (0-1)'),
    },
    async (args) => {
      const link = createMemoryLink(
        args.sourceId,
        args.targetId,
        args.relationship as RelationshipType,
        args.strength
      );
      if (!link) {
        return { content: [{ type: 'text', text: 'Failed to create link. Memories may not exist or link already exists.' }] };
      }
      return { content: [{ type: 'text', text: `✓ Linked memory ${args.sourceId} → ${args.targetId} (${args.relationship})` }] };
    }
  );

  // Set Project - Switch active project context
  server.tool(
    'set_project',
    `Switch active project context. Use "${GLOBAL_PROJECT_SENTINEL}" for global/all projects.`,
    {
      project: z.string().describe(`Project name, or "${GLOBAL_PROJECT_SENTINEL}" for global scope`),
    },
    async (args) => {
      const oldProject = getActiveProject();
      setActiveProject(args.project === GLOBAL_PROJECT_SENTINEL ? null : args.project);
      const newProject = getActiveProject();
      return {
        content: [{
          type: 'text',
          text: `Project context changed: ${oldProject || 'global'} → ${newProject || 'global'}`
        }]
      };
    }
  );

  // Get Project - Show current project scope
  server.tool(
    'get_project',
    'Show current project scope and detection info.',
    {},
    async () => {
      const info = getProjectContextInfo();
      const lines = [
        `**Current Project:** ${info.project || 'global (all projects)'}`,
        `**Detection Source:** ${info.source}`,
        `**Scope:** ${info.isGlobal ? 'Global - queries return all projects' : `Scoped - queries filtered to "${info.project}"`}`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ============================================
  // ORGANIC BRAIN TOOLS (Phase 3)
  // ============================================

  // Detect Contradictions - Find conflicting memories
  server.tool(
    'detect_contradictions',
    `Scan memories for potential contradictions. Finds memories that may contain
conflicting information about the same topic, such as:
- Different solutions to the same problem
- Conflicting recommendations (use X vs don't use X)
- Opposite decisions or preferences

Contradictions are automatically detected during consolidation and linked,
but you can use this tool to check for new contradictions at any time.`,
    {
      project: z.string().optional().describe('Filter by project (omit for current project)'),
      category: z.enum([
        'architecture', 'pattern', 'preference', 'error',
        'context', 'learning', 'todo', 'note', 'relationship', 'custom'
      ]).optional().describe('Filter by category'),
      minScore: z.number().min(0).max(1).optional().default(0.4)
        .describe('Minimum contradiction score (0-1, default 0.4)'),
      limit: z.number().min(1).max(50).optional().default(10)
        .describe('Maximum results to return'),
    },
    async (args) => {
      const project = args.project ?? getActiveProject() ?? undefined;
      const contradictions = detectContradictions({
        project,
        category: args.category,
        minScore: args.minScore,
        limit: args.limit,
      });

      if (contradictions.length === 0) {
        return { content: [{ type: 'text', text: 'No contradictions detected.' }] };
      }

      const lines = ['## Potential Contradictions\n'];
      for (const c of contradictions) {
        lines.push(`### ${c.reason} (${(c.score * 100).toFixed(0)}% confidence)`);
        lines.push(`**Memory A:** [#${c.memoryA.id}] ${c.memoryA.title}`);
        lines.push(`**Memory B:** [#${c.memoryB.id}] ${c.memoryB.title}`);
        if (c.sharedTopics.length > 0) {
          lines.push(`**Shared Topics:** ${c.sharedTopics.join(', ')}`);
        }
        lines.push('');
      }

      lines.push(`\n*Found ${contradictions.length} potential contradiction(s). Use \`get_related\` to see linked contradictions.*`);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ============================================
  // RESOURCES
  // ============================================

  // Project context resource
  server.resource(
    'memory://context',
    'memory://context',
    async () => {
      const summary = await generateContextSummary();
      return {
        contents: [{
          uri: 'memory://context',
          mimeType: 'text/markdown',
          text: formatContextSummary(summary),
        }],
      };
    }
  );

  // Important memories resource
  server.resource(
    'memory://important',
    'memory://important',
    async () => {
      const memories = getHighPriorityMemories(20);
      const text = memories.map(m =>
        `## ${m.title}\n${m.content}\n*${m.category} | ${(m.salience * 100).toFixed(0)}% salience*\n`
      ).join('\n');

      return {
        contents: [{
          uri: 'memory://important',
          mimeType: 'text/markdown',
          text: text || 'No high-priority memories stored yet.',
        }],
      };
    }
  );

  // Recent memories resource
  server.resource(
    'memory://recent',
    'memory://recent',
    async () => {
      const memories = getRecentMemories(15);
      const text = memories.map(m =>
        `- **${m.title}** (${m.category}): ${m.content.slice(0, 100)}...`
      ).join('\n');

      return {
        contents: [{
          uri: 'memory://recent',
          mimeType: 'text/markdown',
          text: text || 'No recent memories.',
        }],
      };
    }
  );

  // ============================================
  // PROMPTS
  // ============================================

  // Context restoration prompt
  server.prompt(
    'restore_context',
    'Restore context after compaction or at session start',
    async () => {
      const summary = await generateContextSummary();
      const context = formatContextSummary(summary);

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Please review this context from memory and use it:\n\n${context}`,
          },
        }],
      };
    }
  );

  // Memory search prompt
  server.prompt(
    'search_memory',
    'Search memories for information',
    async () => {
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Search my memories for relevant information.`,
          },
        }],
      };
    }
  );

  // ============================================
  // AUTO-CONSOLIDATION (Anti-bloat)
  // ============================================

  // Run initial consolidation on startup
  try {
    const startupResult = consolidate();
    console.error(`[claude-cortex] Startup consolidation: ${startupResult.consolidated} promoted, ${startupResult.deleted} deleted`);
  } catch (e) {
    console.error('[claude-cortex] Startup consolidation failed:', e);
  }

  // Check database size on startup
  const sizeInfo = checkDatabaseSize();
  if (sizeInfo.warning || sizeInfo.blocked) {
    console.error(`[claude-cortex] ${sizeInfo.message}`);
  }

  // Schedule periodic consolidation every 4 hours
  const CONSOLIDATION_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
  setInterval(() => {
    try {
      const result = fullCleanup();
      console.error(`[claude-cortex] Scheduled cleanup: ${result.consolidation.consolidated} promoted, ${result.consolidation.deleted} deleted, ${result.merged} merged, vacuumed: ${result.vacuumed}`);
    } catch (e) {
      console.error('[claude-cortex] Scheduled cleanup failed:', e);
    }
  }, CONSOLIDATION_INTERVAL);

  return server;
}
