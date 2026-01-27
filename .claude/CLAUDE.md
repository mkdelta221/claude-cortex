# Claude Cortex - Project Instructions

## What This Is
An MCP server that gives Claude Code brain-like memory. This project IS the memory system, so be careful not to break it while working on it.

## Development Workflow

```bash
# After any TypeScript changes
npm run build

# Test the MCP server (spawns via Claude Code)
# Restart Claude Code to reload the server

# Run API server for dashboard
npm run dev:api

# Run dashboard (separate terminal) - runs on port 3030
cd dashboard && npm run dev
```

## Dashboard
- URL: http://localhost:3030 (dashboard) + http://localhost:3001 (API)
- The dashboard is optional - core memory works without it
- Shows 3D brain visualization of memories
- Real-time updates via WebSocket (falls back to 30s polling)
- Search with autocomplete suggestions

## Key Files

| File | Purpose |
|------|---------|
| `src/server.ts` | MCP server setup, tool definitions |
| `src/context/project-context.ts` | Project auto-detection and scoping |
| `src/memory/store.ts` | Core CRUD operations, memory links |
| `src/memory/consolidate.ts` | STM→LTM promotion, cleanup |
| `src/memory/decay.ts` | Temporal decay logic |
| `src/database/init.ts` | SQLite setup, schema, transactions |
| `src/errors.ts` | Custom error classes with helpful messages |
| `src/api/visualization-server.ts` | REST API + WebSocket for dashboard |
| `scripts/session-start-hook.mjs` | Auto-recall context on session start |
| `scripts/pre-compact-hook.mjs` | Auto-extract memories before compaction |
| `dashboard/` | 3D brain visualization (Next.js) |

## Database Location
`~/.claude-cortex/memories.db` (SQLite with FTS5, with fallback to legacy `~/.claude-memory/`)

## Recent Improvements

### Phase 1: Stability
- Transaction safety for batch operations
- FTS5 query escaping (handles AND, OR, NOT, special chars)
- Memory limits enforced on addMemory()
- Tag search uses proper JSON parsing
- Race condition protection (busy_timeout=5000ms)

### Phase 2: Features
- Memory relationships (auto-detected links between memories)
- WebSocket for real-time dashboard updates
- API pagination (offset/limit/total/hasMore)
- Content truncation warning when >10KB
- Persisted decay scores for efficient sorting
- Adjusted base salience (0.25) and deletion threshold (0.2)

### Phase 3: Polish
- Search debouncing (300ms) in dashboard
- 3D rendering optimization (shared geometries, memoization)
- Better error messages with actionable suggestions
- Search autocomplete with suggestions

## Anti-Bloat Safeguards
- Max 100 STM, 1000 LTM memories
- 10KB content limit per memory (with warning)
- 100MB database hard limit
- Auto-consolidation every 4 hours
- Auto-vacuum after deletions
- Decay scores persisted every 5 minutes

## Testing Changes
1. Make changes to TypeScript
2. Run `npm run build`
3. Restart Claude Code (or start new session)
4. Test with: "Show memory stats" or "Remember X"

## Project Auto-Scoping
Memories are automatically scoped to the current project:
- Project detected from `process.cwd()` at MCP server startup
- Override with `CLAUDE_MEMORY_PROJECT` environment variable
- Use `project: "*"` to query all projects (global scope)
- New tools: `set_project` (switch context), `get_project` (show current)
- Located at: `src/context/project-context.ts`

## Hooks

### SessionStart Hook - Auto-Recall Context
Runs when Claude Code starts a new session:
- **Auto-loads** project context from memory
- Shows architecture decisions, patterns, preferences
- Displays up to 15 high-salience memories
- New projects get a welcome message
- Located at: `scripts/session-start-hook.mjs`
- Configured in: `~/.claude/settings.json` → hooks.SessionStart

### PreCompact Hook - Automatic Memory Extraction
Runs before every context compaction (manual or auto):
- **Auto-extracts** high-salience content (decisions, fixes, learnings, patterns)
- Up to 5 memories auto-saved per compaction (threshold: salience ≥ 0.25-0.35)
- Creates session marker for continuity tracking
- All auto-extracted memories tagged with "auto-extracted" for filtering
- Located at: `scripts/pre-compact-hook.mjs`
- Configured in: `~/.claude/settings.json` → hooks.PreCompact

**What Gets Auto-Extracted:**
- Decisions: "decided to...", "going with...", "chose...", "using...", "opted for..."
- Error fixes: "fixed by...", "the solution was...", "root cause...", "bug was..."
- Learnings: "learned that...", "discovered...", "turns out...", "figured out..."
- Architecture: "the architecture uses...", "created...", "implemented...", "refactored..."
- Preferences: "always...", "never...", "prefer to..."
- Important notes: "important:", "remember:", "key point...", "crucial..."

## Proactive Memory Use

**IMPORTANT:** Don't rely solely on auto-extraction. Use the `remember` MCP tool proactively:

### When to Use `remember`:
- **After making a decision**: "Remember: decided to use PostgreSQL for better JSON support"
- **After fixing a bug**: "Remember: the auth bug was caused by expired JWT tokens"
- **After learning something new**: "Remember: SQLite FTS5 requires escaping hyphens"
- **For architecture choices**: "Remember: using microservices pattern with API gateway"
- **For user preferences**: "Remember: user prefers TypeScript strict mode"

### Best Practices:
1. Call `remember` immediately when something important happens
2. Include context: what, why, and any relevant code/file references
3. Use clear titles that summarize the key point
4. Tag with relevant categories (architecture, error, learning, preference)

### Example Usage:
```
// After debugging a tricky issue
remember({
  title: "SQLite concurrent access fix",
  content: "Multiple processes accessing the same DB caused crashes. Fixed by adding busy_timeout=10000ms and WAL mode checkpointing.",
  category: "error",
  importance: "high"
})
```

## API Endpoints (Visualization Server)
```
GET  /api/health         - Health check
GET  /api/memories       - List memories (with pagination)
GET  /api/memories/:id   - Get single memory
POST /api/memories       - Create memory
DEL  /api/memories/:id   - Delete memory
POST /api/memories/:id/access - Reinforce memory
GET  /api/stats          - Memory statistics
GET  /api/links          - Memory relationships
POST /api/consolidate    - Trigger consolidation
GET  /api/context        - Context summary
GET  /api/suggestions    - Search autocomplete
WS   /ws/events          - Real-time updates
```

## Known Issues
- MCP server process caches - restart Claude Code after code changes
- FTS5 queries with special characters need escaping (handled automatically)

## Database Contention (Fixed)
Multiple processes accessing the same SQLite database can cause crashes. Mitigations:
- **Auto-checkpoint**: WAL auto-checkpoints every 100 pages (~400KB)
- **Graceful shutdown**: Checkpoints WAL and removes lock file on exit
- **Lock file**: Creates `.lock` file to help detect concurrent instances
- **Increased timeout**: busy_timeout raised to 10 seconds
- **Periodic maintenance**: API server checkpoints WAL every 5 minutes
