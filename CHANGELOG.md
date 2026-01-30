# Changelog

All notable changes to this project will be documented in this file.

## [1.9.0] - 2026-01-30

### Added
- **SessionEnd hook** — Auto-extracts important context when a Claude Code session exits. Reads the session transcript and saves high-salience memories (decisions, fixes, learnings) to the database.
- Hook coverage matrix in README documenting when each hook fires and its reliability.
- `npx claude-cortex hook session-end` CLI command for manual invocation.

### Changed
- SessionEnd hook skips extraction on `/clear` (intentional session wipe).
- Auto-extracted memories from SessionEnd are tagged with `session-end` for filtering.

## [1.8.3] - 2026-01-29

### Security
- **CRITICAL: Removed `shell: true` from Clawdbot hook** — `execFile` with `shell: true` allowed command injection via memory content. Now uses safe direct execution.
- **Parameterized SQL in session-start hook** — Replaced string interpolation in `NOT IN` clause with proper `?` placeholders.
- **Word-boundary regex for SQL endpoint** — DROP/TRUNCATE blocking now uses `\bDROP\b` to avoid false positives on column names.

### Fixed
- **Quote escaping in Clawdbot hook** — Single quotes in memory content are now escaped (`''`) instead of stripped, preserving data integrity.

### Added
- **`prepublishOnly` script** — Automatically runs `npm run build` before `npm publish` to prevent stale dist.

## [1.8.2] - 2026-01-29

### Fixed
- Strengthen post-compaction `get_context` directive to ensure context is recalled after compaction.
- Pre-compact hook now reads session JSONL files directly for reliable conversation extraction.

## [1.8.1] - 2026-01-29

### Changed
- **Unified setup command** — `npx claude-cortex setup` now configures both Claude Code (CLAUDE.md) and Clawdbot/Moltbot hook in one step.

## [1.8.0] - 2026-01-29

### Added
- **Clawdbot/Moltbot hook installer** — `npx claude-cortex clawdbot install|uninstall|status`
- Bundled `cortex-memory` hook that integrates via mcporter for persistent memory in Clawdbot sessions.
- Auto-saves session context on `/new`, injects past memories on bootstrap, keyword triggers ("remember this").

## [1.7.2] - 2026-01-28

### Added
- Moltbot/ClawdBot integration section in README with mcporter usage examples.

## [1.7.1] - 2026-01-28

### Fixed
- Added `hook` subcommand routing, fixed hook documentation.

## [1.7.0] - 2026-01-28

### Added
- **`setup` command** — `npx claude-cortex setup` injects proactive memory instructions into `~/.claude/CLAUDE.md`.

## [1.6.1] - 2026-01-28

### Fixed
- **ARM64 embedding support** — Migrated from `@xenova/transformers` to `@huggingface/transformers` for native Apple Silicon compatibility.

## [1.6.0] - 2026-01-28

### Added
- **Memory intelligence overhaul** — 7 improvements to connect isolated subsystems:
  - Semantic linking in `detectRelationships` (embeddings + FTS5 content similarity)
  - Search results reinforce salience and create co-search links
  - Dynamic salience evolution via link count, contradictions, and mention count
  - Contradictions surfaced in search results with warnings
  - Memory enrichment wired into search flow
  - Real consolidation merges related STM into coherent LTM entries
  - Increased activation weight in search, cache pruning

## [1.5.2] - 2026-01-28

### Added
- **Cross-platform auto-start service** — `npx claude-cortex service install|uninstall|status`
- Supports macOS (launchd), Linux (systemd), Windows (Startup folder VBS script).
- Logs to `~/.claude-cortex/logs/`.

## [1.5.1] - 2026-01-28

### Improved
- **Dashboard auto-starts API server** - No more manual `npm run dev:api` required when running dashboard directly
- Running `cd dashboard && npm run dev` now automatically detects and starts the API if not running

## [1.5.0] - 2026-01-28

### Added
- **Cross-process event IPC** - MCP tool events (remember, recall, forget) now appear in dashboard Activity log
- Events persisted to SQLite `events` table for cross-process communication
- API server polls for new events every 500ms and broadcasts via WebSocket
- Automatic cleanup of processed events after 24 hours

## [1.4.2] - 2026-01-28

### Fixed
- Removed duplicate Pause/Sync buttons from dashboard header (now only in sidebar)
- Consolidation events now properly emit to Activity log
- Added tooltips to all dashboard buttons for better UX

## [1.4.1] - 2026-01-28

### Fixed
- React duplicate key error in MemoryDetail when memory has bidirectional relationships

## [1.4.0] - 2026-01-28

### Added
- **Version management in dashboard** - Display current version, check for updates, update, and restart server
- New API endpoints: `/api/version`, `/api/version/check`, `/api/version/update`, `/api/version/restart`
- VersionPanel component in dashboard sidebar
- WebSocket events for update progress: `update_started`, `update_complete`, `update_failed`, `server_restarting`
- Dashboard documentation section in README with features list and color legend

### Fixed
- MCP server now reports actual version from package.json instead of hardcoded "1.0.0"

## [1.3.2] - 2026-01-28

### Fixed
- FTS5 query escaping: periods in search terms now properly quoted (fixes "syntax error near ." when remembering content with version numbers like v1.3.1)

## [1.3.1] - 2026-01-28

### Fixed
- README branding: changed "Claude Memory" references to "Claude Cortex"

## [1.3.0] - 2026-01-27

### Added
- Jest test infrastructure with 31 passing tests
- Test coverage for salience, decay, similarity, and memory types
- npm scripts: `test`, `test:watch`, `test:coverage`, `audit:security`
- React error boundary for dashboard crash handling
- `.npmignore` for cleaner npm package

### Fixed
- npm security vulnerability (hono package)
- Type safety in embeddings (replaced `any` with proper interface)
- Three.js memory leaks in BrainMesh (use refs for cleanup)
- WebSocket dependency array causing reconnection loops
- Type-safe material casting in SynapseNodes

## [1.2.1] - 2026-01-27

### Added
- Ko-fi support link in README
- GitHub sponsor button via FUNDING.yml

## [1.2.0] - 2026-01-27

### Added
- Dashboard control panel (pause/resume memory creation, trigger consolidation)
- Debug tools panel with query tester, activity log, relationship graph, SQL console
- Control API endpoints for pause/resume/consolidate
- Chip visualization components (alternative view)
- Category labels for brain regions

## [1.1.1] - 2026-01-27

### Added
- Proactive memory instructions in SessionStart hook
- Reminds Claude to use `remember` immediately for decisions, bug fixes, learnings

### Fixed
- React duplicate key error in brain visualization
- Added defensive deduplication for memory nodes

## [1.1.0] - 2026-01-27

### Changed
- Clean neural network design for dashboard visualization
- Ghost wireframe brain outline (faint gray, no animation)
- Gray neural connections with bright white signal pulses
- Larger solid-colored memory nodes (no transparency/glow)
- Simplified UI overlay (just memory count)

### Removed
- Stars background, colored brain regions
- Synapse endpoint bulbs, connection count badge
- Neural activity indicator, holographic color mode

## [1.0.0] - 2026-01-27

### Added
- Brain-like memory system with short-term, long-term, and episodic memory types
- Salience detection for automatic importance scoring
- Temporal decay with reinforcement on access
- Automatic consolidation (STM → LTM promotion)
- Full-text search via SQLite FTS5
- Semantic search via vector embeddings (@xenova/transformers)
- Cross-project global memories with scope parameter
- Memory relationships and automatic linking
- Spreading activation for related memory priming
- Contradiction detection between memories
- Background worker for continuous brain-like processing
- Dashboard visualization (optional, runs separately)
- Session hooks for auto-recall and pre-compact memory extraction

### MCP Tools
- `remember` - Store memories with auto-categorization
- `recall` - Search and retrieve memories
- `forget` - Delete memories with safety confirmations
- `get_context` - Get relevant project context
- `start_session` / `end_session` - Session management
- `consolidate` - Manual consolidation trigger
- `memory_stats` - View statistics
- `export_memories` / `import_memories` - Backup and restore
- `get_related` / `link_memories` - Memory relationships
- `detect_contradictions` - Find conflicting memories
- `set_project` / `get_project` - Project scope management
