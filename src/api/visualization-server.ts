/**
 * Visualization API Server
 *
 * Provides REST endpoints and WebSocket for the Brain Dashboard.
 * Runs alongside or instead of the MCP server.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getDatabase, initDatabase, checkpointWal } from '../database/init.js';
import { Memory, MemoryConfig, DEFAULT_CONFIG } from '../memory/types.js';
import {
  searchMemories,
  getRecentMemories,
  getHighPriorityMemories,
  getMemoryStats,
  getMemoryById,
  addMemory,
  deleteMemory,
  accessMemory,
  updateDecayScores,
  rowToMemory,
} from '../memory/store.js';
import {
  consolidate,
  generateContextSummary,
  formatContextSummary,
} from '../memory/consolidate.js';
import { calculateDecayedScore } from '../memory/decay.js';
import { getActivationStats, getActiveMemories } from '../memory/activation.js';
import { detectContradictions, getContradictionsFor } from '../memory/contradiction.js';
import { enrichMemory } from '../memory/store.js';
import { memoryEvents, MemoryEvent, emitDecayTick, emitConsolidation } from './events.js';
import { BrainWorker } from '../worker/brain-worker.js';
import { isPaused, pause, resume, getControlStatus } from './control.js';
import { getCurrentVersion, checkForUpdates, performUpdate, scheduleRestart } from './version.js';

const PORT = process.env.PORT || 3001;

// Track connected WebSocket clients
const clients = new Set<WebSocket>();

/**
 * Start the visualization API server
 */
export function startVisualizationServer(dbPath?: string): void {
  // Initialize database
  initDatabase(dbPath || DEFAULT_CONFIG.dbPath);

  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // ============================================
  // REST API ENDPOINTS
  // ============================================

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get all memories with filters and pagination
  app.get('/api/memories', async (req: Request, res: Response) => {
    try {
      // Extract query params as strings
      const project = typeof req.query.project === 'string' ? req.query.project : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '50';
      const offsetStr = typeof req.query.offset === 'string' ? req.query.offset : '0';
      const mode = typeof req.query.mode === 'string' ? req.query.mode : 'recent';
      const query = typeof req.query.query === 'string' ? req.query.query : undefined;

      const limit = Math.min(parseInt(limitStr), 200); // Cap at 200
      const offset = parseInt(offsetStr);

      let memories: Memory[];

      if (mode === 'search' && query) {
        const results = await searchMemories({
          query,
          project,
          type: type as Memory['type'] | undefined,
          category: category as Memory['category'] | undefined,
          limit: limit + offset + 1, // Fetch extra to check hasMore
        });
        memories = results.map(r => r.memory);
      } else if (mode === 'important') {
        memories = getHighPriorityMemories(limit + offset + 1, project);
      } else {
        memories = getRecentMemories(limit + offset + 1, project);
      }

      // Filter by type and category if provided
      if (type) {
        memories = memories.filter(m => m.type === type);
      }
      if (category) {
        memories = memories.filter(m => m.category === category);
      }

      // Get total count for pagination
      const stats = getMemoryStats(project);
      const total = stats.total;

      // Apply pagination
      const hasMore = memories.length > offset + limit;
      const paginatedMemories = memories.slice(offset, offset + limit);

      // Add computed decayed score to each memory
      const memoriesWithDecay = paginatedMemories.map(m => ({
        ...m,
        decayedScore: calculateDecayedScore(m),
      }));

      res.json({
        memories: memoriesWithDecay,
        pagination: {
          offset,
          limit,
          total,
          hasMore,
        },
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get single memory by ID
  app.get('/api/memories/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const memory = getMemoryById(id);
      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json({
        ...memory,
        decayedScore: calculateDecayedScore(memory),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create memory
  app.post('/api/memories', (req: Request, res: Response) => {
    try {
      const { title, content, type, category, project, tags, salience } = req.body;

      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content required' });
      }

      const memory = addMemory({
        title,
        content,
        type: type || 'short_term',
        category: category || 'note',
        project,
        tags: tags || [],
        salience,
      });

      res.status(201).json(memory);
    } catch (error) {
      // Handle paused state gracefully
      if ((error as Error).name === 'MemoryPausedError') {
        return res.status(503).json({
          error: 'Memory creation is paused',
          paused: true,
          message: 'Use the dashboard control panel to resume memory creation.',
        });
      }
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete memory
  app.delete('/api/memories/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const success = deleteMemory(id);
      if (!success) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Access/reinforce memory
  app.post('/api/memories/:id/access', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const memory = accessMemory(id);
      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json({
        ...memory,
        decayedScore: calculateDecayedScore(memory),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get statistics
  app.get('/api/stats', (req: Request, res: Response) => {
    try {
      const project = typeof req.query.project === 'string' ? req.query.project : undefined;
      const stats = getMemoryStats(project);

      // Add decay distribution
      const db = getDatabase();
      const rawRows = db.prepare(
        project
          ? 'SELECT * FROM memories WHERE project = ?'
          : 'SELECT * FROM memories'
      ).all(project ? [project] : []) as Record<string, unknown>[];

      // Convert raw DB rows to Memory objects (snake_case -> camelCase)
      const allMemories = rawRows.map(rowToMemory);

      const decayDistribution = {
        healthy: 0,  // > 0.35 (realistic given base salience 0.25 + access bonus)
        fading: 0,   // 0.2 - 0.35
        critical: 0, // < 0.2 (approaching deletion threshold)
      };

      for (const m of allMemories) {
        const score = calculateDecayedScore(m);
        if (score > 0.35) decayDistribution.healthy++;
        else if (score > 0.2) decayDistribution.fading++;
        else decayDistribution.critical++;
      }

      // Get spreading activation stats (Phase 2 organic feature)
      const activationStats = getActivationStats();

      res.json({
        ...stats,
        decayDistribution,
        activation: activationStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get currently activated memories (spreading activation)
  app.get('/api/activation', (_req: Request, res: Response) => {
    try {
      const activeMemories = getActiveMemories();
      const stats = getActivationStats();

      res.json({
        activeMemories,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // ORGANIC BRAIN ENDPOINTS (Phase 3)
  // ============================================

  // Get detected contradictions
  app.get('/api/contradictions', (req: Request, res: Response) => {
    try {
      const project = typeof req.query.project === 'string' ? req.query.project : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const minScoreStr = typeof req.query.minScore === 'string' ? req.query.minScore : '0.4';
      const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';

      const minScore = parseFloat(minScoreStr);
      const limit = parseInt(limitStr);

      const contradictions = detectContradictions({
        project,
        category: category as Memory['category'] | undefined,
        minScore,
        limit,
      });

      res.json({
        contradictions: contradictions.map(c => ({
          memoryAId: c.memoryA.id,
          memoryATitle: c.memoryA.title,
          memoryBId: c.memoryB.id,
          memoryBTitle: c.memoryB.title,
          score: c.score,
          reason: c.reason,
          sharedTopics: c.sharedTopics,
        })),
        count: contradictions.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get contradictions for a specific memory
  app.get('/api/memories/:id/contradictions', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid memory ID' });
      }

      const contradictions = getContradictionsFor(id);

      res.json({
        memoryId: id,
        contradictions: contradictions.map(c => ({
          contradictingMemoryId: c.memoryB.id,
          contradictingMemoryTitle: c.memoryB.title,
          score: c.score,
          reason: c.reason,
          sharedTopics: c.sharedTopics,
        })),
        count: contradictions.length,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Manually enrich a memory with new context
  app.post('/api/memories/:id/enrich', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid memory ID' });
      }

      const { context, contextType } = req.body;
      if (!context || typeof context !== 'string') {
        return res.status(400).json({ error: 'Context string required in request body' });
      }

      const validTypes = ['search', 'access', 'related'];
      const type = validTypes.includes(contextType) ? contextType : 'access';

      const result = enrichMemory(id, context, type);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get list of all projects
  app.get('/api/projects', (_req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const projects = db.prepare(`
        SELECT DISTINCT project, COUNT(*) as memory_count
        FROM memories
        WHERE project IS NOT NULL AND project != ''
        GROUP BY project
        ORDER BY memory_count DESC
      `).all() as { project: string; memory_count: number }[];

      // Add "All Projects" option with total count
      const totalCount = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };

      res.json({
        projects: [
          { project: null, memory_count: totalCount.count, label: 'All Projects' },
          ...projects.map(p => ({ ...p, label: p.project })),
        ],
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // CONTROL ENDPOINTS
  // ============================================

  // Get control status
  app.get('/api/control/status', (_req: Request, res: Response) => {
    try {
      const status = getControlStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Pause memory creation
  app.post('/api/control/pause', (_req: Request, res: Response) => {
    try {
      pause();
      res.json({ paused: true, message: 'Memory creation paused' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Resume memory creation
  app.post('/api/control/resume', (_req: Request, res: Response) => {
    try {
      resume();
      res.json({ paused: false, message: 'Memory creation resumed' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // VERSION ENDPOINTS
  // ============================================

  // Get current version
  app.get('/api/version', (_req: Request, res: Response) => {
    try {
      const version = getCurrentVersion();
      res.json({ version });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Check for updates
  app.get('/api/version/check', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.force === 'true';
      const versionInfo = await checkForUpdates(forceRefresh);
      res.json(versionInfo);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Perform update
  app.post('/api/version/update', async (_req: Request, res: Response) => {
    try {
      // Notify clients that update is starting
      broadcast({
        type: 'update_started',
        timestamp: new Date().toISOString(),
        data: { message: 'Update in progress...' },
      } as MemoryEvent);

      const result = await performUpdate();

      // Notify clients of result
      broadcast({
        type: result.success ? 'update_complete' : 'update_failed',
        timestamp: new Date().toISOString(),
        data: result,
      } as MemoryEvent);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Restart server
  app.post('/api/version/restart', (_req: Request, res: Response) => {
    try {
      // Notify all WebSocket clients
      broadcast({
        type: 'server_restarting',
        timestamp: new Date().toISOString(),
        data: { message: 'Server restarting in 3 seconds...' },
      } as MemoryEvent);

      // Close WebSocket connections gracefully
      for (const client of clients) {
        client.send(
          JSON.stringify({
            type: 'server_restarting',
            timestamp: new Date().toISOString(),
            data: { reconnectIn: 5000 },
          })
        );
      }

      // Schedule restart after response is sent
      res.json({ success: true, message: 'Server will restart in 3 seconds' });

      scheduleRestart(3000);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get memory links/relationships
  app.get('/api/links', (req: Request, res: Response) => {
    try {
      const project = typeof req.query.project === 'string' ? req.query.project : undefined;
      const db = getDatabase();

      const query = project
        ? `
          SELECT
            ml.*,
            m1.title as source_title,
            m1.category as source_category,
            m1.type as source_type,
            m2.title as target_title,
            m2.category as target_category,
            m2.type as target_type
          FROM memory_links ml
          JOIN memories m1 ON ml.source_id = m1.id
          JOIN memories m2 ON ml.target_id = m2.id
          WHERE m1.project = ? OR m2.project = ?
          ORDER BY ml.created_at DESC
          LIMIT 500
        `
        : `
          SELECT
            ml.*,
            m1.title as source_title,
            m1.category as source_category,
            m1.type as source_type,
            m2.title as target_title,
            m2.category as target_category,
            m2.type as target_type
          FROM memory_links ml
          JOIN memories m1 ON ml.source_id = m1.id
          JOIN memories m2 ON ml.target_id = m2.id
          ORDER BY ml.created_at DESC
          LIMIT 500
        `;

      const links = project
        ? db.prepare(query).all(project, project)
        : db.prepare(query).all();

      res.json(links);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // SQL CONSOLE ENDPOINT
  // ============================================

  // Execute SQL query (with safety restrictions)
  app.post('/api/sql', (req: Request, res: Response) => {
    try {
      const { query, allowWrite } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query string required' });
      }

      const upperQuery = query.toUpperCase().trim();

      // Always block DROP and TRUNCATE
      if (upperQuery.includes('DROP') || upperQuery.includes('TRUNCATE')) {
        return res.status(403).json({
          error: 'DROP and TRUNCATE operations are blocked for safety',
        });
      }

      // Block writes unless explicitly allowed
      const isWriteOperation =
        upperQuery.startsWith('INSERT') ||
        upperQuery.startsWith('UPDATE') ||
        upperQuery.startsWith('DELETE') ||
        upperQuery.startsWith('ALTER') ||
        upperQuery.startsWith('CREATE');

      if (isWriteOperation && !allowWrite) {
        return res.status(403).json({
          error: 'Write operations are disabled. Enable allowWrite to execute.',
        });
      }

      const db = getDatabase();
      const startTime = Date.now();

      // Execute query
      const isSelect = upperQuery.startsWith('SELECT') || upperQuery.startsWith('PRAGMA');

      if (isSelect) {
        const rows = db.prepare(query).all() as Record<string, unknown>[];
        const executionTime = Date.now() - startTime;

        // Get column names from first row or empty
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        res.json({
          columns,
          rows,
          rowCount: rows.length,
          executionTime,
        });
      } else {
        // Write operation
        const result = db.prepare(query).run();
        const executionTime = Date.now() - startTime;

        res.json({
          columns: ['changes', 'lastInsertRowid'],
          rows: [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid }],
          rowCount: 1,
          executionTime,
        });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Trigger consolidation
  app.post('/api/consolidate', (_req: Request, res: Response) => {
    try {
      const result = consolidate();
      // Emit event for Activity log
      emitConsolidation(result);
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get context summary
  app.get('/api/context', async (req: Request, res: Response) => {
    try {
      const project = typeof req.query.project === 'string' ? req.query.project : undefined;
      const summary = await generateContextSummary(project);
      const formatted = formatContextSummary(summary);

      res.json({
        summary,
        formatted,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get search suggestions (for autocomplete)
  app.get('/api/suggestions', (req: Request, res: Response) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 10;

      if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
      }

      const db = getDatabase();

      // Get suggestions from memory titles, categories, tags, and projects
      const suggestions: Array<{ text: string; type: string; count: number }> = [];

      // Search titles that contain the query
      const titleMatches = db.prepare(`
        SELECT DISTINCT title, COUNT(*) as count
        FROM memories
        WHERE title LIKE ?
        GROUP BY title
        ORDER BY count DESC, last_accessed DESC
        LIMIT ?
      `).all(`%${query}%`, limit) as { title: string; count: number }[];

      for (const match of titleMatches) {
        suggestions.push({ text: match.title, type: 'title', count: match.count });
      }

      // Get matching categories
      const categoryMatches = db.prepare(`
        SELECT DISTINCT category, COUNT(*) as count
        FROM memories
        WHERE category LIKE ?
        GROUP BY category
        ORDER BY count DESC
        LIMIT 5
      `).all(`%${query}%`) as { category: string; count: number }[];

      for (const match of categoryMatches) {
        suggestions.push({ text: match.category, type: 'category', count: match.count });
      }

      // Get matching projects
      const projectMatches = db.prepare(`
        SELECT DISTINCT project, COUNT(*) as count
        FROM memories
        WHERE project IS NOT NULL AND project LIKE ?
        GROUP BY project
        ORDER BY count DESC
        LIMIT 5
      `).all(`%${query}%`) as { project: string; count: number }[];

      for (const match of projectMatches) {
        suggestions.push({ text: match.project, type: 'project', count: match.count });
      }

      // Sort by count and limit total results
      suggestions.sort((a, b) => b.count - a.count);
      const limitedSuggestions = suggestions.slice(0, limit);

      res.json({ suggestions: limitedSuggestions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // BRAIN WORKER (Phase 4)
  // ============================================

  // Create and start the background brain worker
  const brainWorker = new BrainWorker();

  // Worker status endpoint
  app.get('/api/worker/status', (_req: Request, res: Response) => {
    try {
      res.json(brainWorker.getStatus());
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Manually trigger light tick (for testing)
  app.post('/api/worker/trigger-light', async (_req: Request, res: Response) => {
    try {
      const result = await brainWorker.triggerLightTick();
      res.json({
        success: true,
        ...result,
        timestamp: result.timestamp.toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Manually trigger medium tick (for testing)
  app.post('/api/worker/trigger-medium', async (_req: Request, res: Response) => {
    try {
      const result = await brainWorker.triggerMediumTick();
      res.json({
        success: true,
        ...result,
        timestamp: result.timestamp.toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================
  // WEBSOCKET SERVER
  // ============================================

  const wss = new WebSocketServer({ server, path: '/ws/events' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`[WS] Client connected. Total: ${clients.size}`);

    // Send initial state
    const stats = getMemoryStats();
    const memories = getRecentMemories(100);
    const memoriesWithDecay = memories.map(m => ({
      ...m,
      decayedScore: calculateDecayedScore(m),
    }));

    ws.send(JSON.stringify({
      type: 'initial_state',
      timestamp: new Date().toISOString(),
      data: {
        stats,
        memories: memoriesWithDecay,
      },
    }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('[WS] Error:', error);
      clients.delete(ws);
    });
  });

  // Broadcast events to all connected clients
  function broadcast(event: MemoryEvent): void {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // Subscribe to memory events
  memoryEvents.onMemoryEvent((event) => {
    broadcast(event);
  });

  // Decay tick - update clients with decay changes every 30 seconds
  let decayTickCount = 0;
  setInterval(() => {
    const db = getDatabase();
    const rawRows = db.prepare(
      'SELECT * FROM memories ORDER BY last_accessed DESC LIMIT 200'
    ).all() as Record<string, unknown>[];

    // Convert raw DB rows to Memory objects (snake_case -> camelCase)
    const memories = rawRows.map(rowToMemory);

    const updates: Array<{ memoryId: number; oldScore: number; newScore: number }> = [];

    for (const memory of memories) {
      const newScore = calculateDecayedScore(memory);
      // Only include memories that have decayed significantly since last update
      // Compare to decayedScore (not salience) to detect actual changes
      if (Math.abs(newScore - memory.decayedScore) > 0.01) {
        updates.push({
          memoryId: memory.id,
          oldScore: memory.decayedScore,
          newScore,
        });
      }
    }

    if (updates.length > 0) {
      emitDecayTick(updates);
    }

    // Persist decay scores and checkpoint WAL every 5 minutes (10 ticks)
    decayTickCount++;
    if (decayTickCount >= 10) {
      decayTickCount = 0;
      try {
        updateDecayScores();
        // Checkpoint WAL to prevent file bloat and reduce contention
        const checkpoint = checkpointWal();
        if (checkpoint.walPages > 0) {
          console.log(`[WAL] Checkpointed ${checkpoint.checkpointed}/${checkpoint.walPages} pages`);
        }
      } catch (error) {
        console.error('[Maintenance] Failed to persist decay scores or checkpoint:', error);
      }
    }
  }, 30000);

  // ============================================
  // START SERVER
  // ============================================

  // Start brain worker before starting server
  brainWorker.start();

  // Graceful shutdown handler
  function gracefulShutdown(signal: string) {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

    // Stop the brain worker
    brainWorker.stop();

    // Close WebSocket connections
    for (const client of clients) {
      client.close();
    }
    clients.clear();

    // Close the HTTP server
    server.close(() => {
      console.log('[Server] HTTP server closed');

      // Checkpoint WAL before exit
      try {
        checkpointWal();
        console.log('[Server] WAL checkpointed');
      } catch (e) {
        console.error('[Server] Failed to checkpoint WAL:', e);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Server] Forced exit after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║             🧠 Claude Cortex API Server                       ║
╠══════════════════════════════════════════════════════════════╣
║  REST API:    http://localhost:${PORT}/api                        ║
║  WebSocket:   ws://localhost:${PORT}/ws/events                    ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET  /api/health         - Health check                   ║
║    GET  /api/memories       - List memories                  ║
║    GET  /api/memories/:id   - Get memory                     ║
║    POST /api/memories       - Create memory                  ║
║    DEL  /api/memories/:id   - Delete memory                  ║
║    POST /api/memories/:id/access - Reinforce memory          ║
║    GET  /api/stats          - Memory statistics              ║
║    GET  /api/links          - Memory relationships           ║
║    POST /api/consolidate    - Trigger consolidation          ║
║    GET  /api/context        - Context summary                ║
║    GET  /api/suggestions    - Search autocomplete            ║
║                                                              ║
║  Control:                                                    ║
║    GET  /api/control/status - Get pause state & uptime       ║
║    POST /api/control/pause  - Pause memory creation          ║
║    POST /api/control/resume - Resume memory creation         ║
║                                                              ║
║  Brain Worker:                                               ║
║    GET  /api/worker/status       - Worker status             ║
║    POST /api/worker/trigger-light  - Trigger light tick      ║
║    POST /api/worker/trigger-medium - Trigger medium tick     ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}
