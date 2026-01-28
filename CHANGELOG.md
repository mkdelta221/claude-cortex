# Changelog

All notable changes to this project will be documented in this file.

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
