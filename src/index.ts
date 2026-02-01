#!/usr/bin/env node

/**
 * Claude Cortex - Brain-like Memory System for Claude Code
 *
 * This server provides persistent, intelligent memory for Claude Code,
 * solving the context compaction and session persistence problems.
 *
 * Usage:
 *   npx claude-cortex                         # Start MCP server (default)
 *   npx claude-cortex --mode mcp              # Start MCP server
 *   npx claude-cortex --mode api              # Start visualization API server
 *   npx claude-cortex --mode both             # Start both servers
 *   npx claude-cortex --dashboard             # Start API + Dashboard (admin panel)
 *   npx claude-cortex --db /path/to.db        # Custom database path
 *   npx claude-cortex setup                    # Configure Claude for proactive memory use
 *   npx claude-cortex setup uninstall          # Remove hooks and CLAUDE.md block
 *   npx claude-cortex uninstall               # Complete uninstall (keeps database)
 *   npx claude-cortex uninstall --keep-logs   # Complete uninstall, preserve logs
 *   npx claude-cortex hook pre-compact         # Run pre-compact hook (for settings.json)
 *   npx claude-cortex hook session-start       # Run session-start hook (for settings.json)
 *   npx claude-cortex hook session-end         # Run session-end hook (for settings.json)
 *   npx claude-cortex service install         # Auto-start dashboard on login
 *   npx claude-cortex service uninstall       # Remove auto-start
 *   npx claude-cortex service status          # Check service status
 *   npx claude-cortex clawdbot install        # Install OpenClaw/Clawdbot hook
 *   npx claude-cortex clawdbot uninstall      # Remove OpenClaw/Clawdbot hook
 *   npx claude-cortex clawdbot status         # Check Clawdbot hook status
 *   npx claude-cortex plugin                  # Print plugin directory path (for --plugin-dir)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer } from './server.js';
import { startVisualizationServer } from './api/visualization-server.js';
import { handleServiceCommand } from './service/install.js';
import { setupClaudeMd } from './setup/claude-md.js';
import { handleHookCommand } from './setup/hooks.js';
import { handleClawdbotCommand } from './setup/clawdbot.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

type ServerMode = 'mcp' | 'api' | 'both' | 'dashboard';

interface Args {
  dbPath?: string;
  mode: ServerMode;
}

// Get the directory of this file for relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { mode: 'mcp' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--dashboard') {
      result.mode = 'dashboard';
    } else if (args[i] === '--mode' && args[i + 1]) {
      const mode = args[i + 1].toLowerCase();
      if (mode === 'mcp' || mode === 'api' || mode === 'both' || mode === 'dashboard') {
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
 * Start the Next.js dashboard as a child process
 */
function startDashboard(): ChildProcess {
  // Dashboard is in the dashboard/ subdirectory relative to project root
  // Since we're in dist/, go up one level to find dashboard/
  const dashboardDir = path.resolve(__dirname, '..', 'dashboard');

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║             🧠 Claude Cortex Dashboard                        ║
╠══════════════════════════════════════════════════════════════╣
║  Starting Next.js dashboard...                               ║
║  Dashboard: http://localhost:3030                            ║
║  API:       http://localhost:3001                            ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Start Next.js in production mode if built, otherwise dev mode
  const dashboard = spawn('npm', ['run', 'start'], {
    cwd: dashboardDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Pipe dashboard output with prefix
  dashboard.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      console.log(`[dashboard] ${line}`);
    }
  });

  dashboard.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      console.error(`[dashboard] ${line}`);
    }
  });

  dashboard.on('error', (error) => {
    console.error('[dashboard] Failed to start:', error.message);
    console.error('[dashboard] Make sure to run "npm run build" in the dashboard directory first.');
  });

  dashboard.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dashboard] Killed by signal ${signal}`);
    } else if (code !== 0) {
      console.error(`[dashboard] Exited with code ${code}`);
    }
  });

  return dashboard;
}

/**
 * Main entry point
 */
async function main() {
  // Handle --version / -v
  if (process.argv[2] === '--version' || process.argv[2] === '-v') {
    console.log(pkg.version);
    return;
  }

  // Handle "doctor" subcommand
  if (process.argv[2] === 'doctor') {
    const { handleDoctorCommand } = await import('./setup/doctor.js');
    await handleDoctorCommand();
    return;
  }

  // Handle "setup" subcommand
  if (process.argv[2] === 'setup') {
    if (process.argv[3] === 'uninstall') {
      const { uninstallSetup } = await import('./setup/uninstall.js');
      await uninstallSetup();
      return;
    }
    const stopHook = process.argv.includes('--with-stop-hook');
    await setupClaudeMd({ stopHook });
    return;
  }

  // Handle "plugin" — print plugin directory path
  if (process.argv[2] === 'plugin') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pluginDir = path.resolve(__dirname, '..', 'plugin');
    console.log(pluginDir);
    return;
  }

  // Handle "uninstall" — full uninstall
  if (process.argv[2] === 'uninstall') {
    const { uninstallAll } = await import('./setup/uninstall.js');
    const keepLogs = process.argv.includes('--keep-logs');
    await uninstallAll({ keepLogs });
    return;
  }

  // Handle "hook" subcommand
  if (process.argv[2] === 'hook') {
    await handleHookCommand(process.argv[3] || '');
    return;
  }

  // Handle "clawdbot" subcommand
  if (process.argv[2] === 'clawdbot') {
    await handleClawdbotCommand(process.argv[3] || '');
    return;
  }

  // Handle "service" subcommand before normal mode parsing
  if (process.argv[2] === 'service') {
    await handleServiceCommand(process.argv[3] || '');
    return;
  }

  // Handle "graph" subcommand
  if (process.argv[2] === 'graph') {
    const action = process.argv[3];
    if (action === 'backfill') {
      const { initDatabase } = await import('./database/init.js');
      const os = await import('os');
      const dbPath = process.env.CLAUDE_MEMORY_DB || path.join(os.homedir(), '.claude-cortex', 'memories.db');
      initDatabase(dbPath);

      const { backfillGraph } = await import('./graph/backfill.js');
      console.log('Backfilling knowledge graph from existing memories...');
      const result = backfillGraph();
      console.log(`Done! Extracted ${result.entities} new entities, ${result.triples} new triples from ${result.memoriesProcessed} memories.`);
    } else {
      console.error('Unknown graph command. Available: backfill');
      process.exit(1);
    }
    return;
  }

  const { dbPath, mode } = parseArgs();

  let dashboardProcess: ChildProcess | null = null;

  if (mode === 'api') {
    // API mode only - for dashboard visualization
    console.log('Starting Claude Cortex in API mode...');
    startVisualizationServer(dbPath);
  } else if (mode === 'dashboard') {
    // Dashboard mode - API + Next.js dashboard
    console.log('Starting Claude Cortex with Dashboard...');
    startVisualizationServer(dbPath);
    dashboardProcess = startDashboard();

    // Graceful shutdown for dashboard mode
    const shutdown = (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down...`);
      if (dashboardProcess) {
        dashboardProcess.kill('SIGTERM');
      }
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else if (mode === 'both') {
    // Both modes - API in background, MCP in foreground
    console.log('Starting Claude Cortex in both modes...');
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
