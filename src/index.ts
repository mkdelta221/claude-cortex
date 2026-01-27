#!/usr/bin/env node

/**
 * Claude Memory - Brain-like Memory System for Claude Code
 *
 * This server provides persistent, intelligent memory for Claude Code,
 * solving the context compaction and session persistence problems.
 *
 * Usage:
 *   npx claude-cortex                         # Start MCP server (default)
 *   npx claude-cortex --mode mcp              # Start MCP server
 *   npx claude-cortex --mode api              # Start visualization API server
 *   npx claude-cortex --mode both             # Start both servers
 *   npx claude-cortex --db /path/to.db        # Custom database path
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { startVisualizationServer } from './api/visualization-server.js';

type ServerMode = 'mcp' | 'api' | 'both';

interface Args {
  dbPath?: string;
  mode: ServerMode;
}

// Parse command line arguments
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { mode: 'mcp' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      const mode = args[i + 1].toLowerCase();
      if (mode === 'mcp' || mode === 'api' || mode === 'both') {
        result.mode = mode as ServerMode;
      }
      i++;
    }
  }

  return result;
}

/**
 * Start MCP server for Claude Code integration
 */
async function startMcpServer(dbPath?: string): Promise<void> {
  // Create the MCP server
  const server = createServer(dbPath);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

/**
 * Main entry point
 */
async function main() {
  const { dbPath, mode } = parseArgs();

  if (mode === 'api') {
    // API mode only - for dashboard visualization
    console.log('Starting Claude Memory in API mode...');
    startVisualizationServer(dbPath);
  } else if (mode === 'both') {
    // Both modes - API in background, MCP in foreground
    console.log('Starting Claude Memory in both modes...');
    startVisualizationServer(dbPath);
    await startMcpServer(dbPath);
  } else {
    // MCP mode (default) - for Claude Code integration
    await startMcpServer(dbPath);
  }
}

// Run
main().catch((error) => {
  // Log to stderr to avoid corrupting MCP protocol
  console.error('Failed to start claude-cortex server:', error);
  process.exit(1);
});
