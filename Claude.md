# Claude Memory - Project Instructions

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

# Run dashboard (separate terminal)
cd dashboard && npm run dev
```

## Key Files

| File | Purpose |
|------|---------|
| `src/server.ts` | MCP server setup, tool definitions |
| `src/memory/store.ts` | Core CRUD operations |
| `src/memory/consolidate.ts` | STM→LTM promotion, cleanup |
| `src/memory/decay.ts` | Temporal decay logic |
| `src/database/init.ts` | SQLite setup, schema |
| `dashboard/` | 3D brain visualization (Next.js) |

## Database Location
`~/.claude-memory/memories.db` (SQLite with FTS5)

## Anti-Bloat Safeguards
- Max 100 STM, 1000 LTM memories
- 10KB content limit per memory
- 100MB database hard limit
- Auto-consolidation every 4 hours
- Auto-vacuum after deletions

## Testing Changes
1. Make changes to TypeScript
2. Run `npm run build`
3. Restart Claude Code (or start new session)
4. Test with: "Show memory stats" or "Remember X"

## Known Issues
- FTS5 queries with hyphens need escaping (fixed in `escapeFts5Query`)
- MCP server process caches - restart Claude Code after code changes
