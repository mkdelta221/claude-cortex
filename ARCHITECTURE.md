# Claude Memory - Brain-Like Memory System for Claude Code

## The Problem

Claude Code has two major limitations:
1. **Context Window Exhaustion**: Long sessions hit token limits
2. **Compaction Loss**: When context is summarized, important details are lost
3. **No Persistence**: Knowledge doesn't survive across sessions

## The Solution: Brain-Like Memory

This MCP plugin mimics how human memory works:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE SESSION                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Working Memory (Context)                │    │
│  │         Current conversation, active files          │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  CLAUDE   │
                    │  MEMORY   │
                    │   (MCP)   │
                    └─────┬─────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
   │ SHORT   │      │   LONG    │     │  EPISODIC │
   │  TERM   │ ──── │   TERM    │     │  MEMORY   │
   │ MEMORY  │      │  MEMORY   │     │ (Events)  │
   └─────────┘      └───────────┘     └───────────┘
   Session-level    Cross-session     Success/failure
   High detail      Consolidated      patterns
   Decays fast      Persists          Learnings
```

## Memory Tiers

### 1. Short-Term Memory (STM)
- **Scope**: Current coding session
- **Content**: Recent decisions, current file context, active debugging
- **Decay**: Fast (hours)
- **Storage**: In-memory + SQLite

### 2. Long-Term Memory (LTM)
- **Scope**: Cross-session, persistent
- **Content**: Architecture decisions, code patterns, user preferences
- **Decay**: Slow (weeks/months), reinforced by access
- **Storage**: SQLite with FTS5

### 3. Episodic Memory
- **Scope**: Specific events/outcomes
- **Content**: "When I tried X, Y happened", successful solutions
- **Decay**: Based on utility (successful patterns persist)
- **Storage**: SQLite with context links

## Salience Detection

Not everything is worth remembering. The system scores information on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Explicit request | 1.0 | User says "remember this" |
| Architecture decision | 0.9 | System design choices |
| Error resolution | 0.8 | Debugging breakthroughs |
| Code pattern | 0.7 | Reusable implementation patterns |
| User preference | 0.7 | Coding style, tool preferences |
| Repeated mention | 0.6 | Topics that come up multiple times |
| File location | 0.5 | Where important code lives |
| Temporary context | 0.2 | Current debugging state |

Only memories above threshold (0.5) are stored long-term.

## Temporal Decay & Reinforcement

Like human memory:
- **Decay**: `score = base_score * (0.995 ^ hours_since_access)`
- **Reinforcement**: Each access boosts score by 1.2x
- **Consolidation**: High-access STM → LTM (like sleep consolidation)

## MCP Tools

### Core Operations
- `remember` - Store a memory with auto-salience scoring
- `recall` - Search memories (semantic + full-text)
- `forget` - Remove a memory
- `reinforce` - Boost a memory's importance

### Automatic Operations
- `capture_context` - Auto-extract important info from conversation
- `consolidate` - Move worthy STM to LTM
- `cleanup` - Remove decayed memories

### Context Injection
- `get_relevant_context` - Auto-inject relevant memories into prompts
- `get_project_context` - Get all memories for current project

## Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,           -- 'short_term', 'long_term', 'episodic'
  category TEXT,                -- 'architecture', 'pattern', 'preference', etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  project TEXT,                 -- Project scope
  tags TEXT,                    -- JSON array
  salience REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decayed_score REAL,           -- Computed on access
  metadata TEXT                 -- JSON for flexible data
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, content, tags,
  content='memories',
  content_rowid='id'
);
```

## Integration with Claude Code

### On Session Start
1. Load relevant project context from LTM
2. Initialize STM for session
3. Inject context via MCP resources

### During Session
1. Auto-capture decisions and patterns (via tool calls)
2. Respond to explicit "remember" requests
3. Provide relevant context on request

### On Session End / Compact
1. Capture summary of session work
2. Consolidate worthy STM → LTM
3. Run decay on all memories
4. Clean up low-value memories

### On Compact Event
1. Before compact: Store critical context as memories
2. After compact: Inject relevant memories back

## Usage Examples

```
User: "Remember that we're using PostgreSQL for the database"
→ Stores as architecture decision with high salience

User: "What database are we using?"
→ Recalls "PostgreSQL" from memory

[Auto-capture]: After fixing a bug
→ Stores episodic memory of the fix pattern

[On session start]:
→ "I recall this project uses PostgreSQL, React, and has
    a modular architecture. Last session we were working
    on the auth system."
```

## Files Structure

```
claude-cortex/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── server.ts          # MCP server setup
│   ├── database/
│   │   ├── init.ts        # SQLite setup
│   │   ├── schema.sql     # Database schema
│   │   └── queries.ts     # Query functions
│   ├── memory/
│   │   ├── types.ts       # Memory type definitions
│   │   ├── store.ts       # Memory CRUD operations
│   │   ├── salience.ts    # Salience scoring
│   │   ├── decay.ts       # Temporal decay logic
│   │   └── consolidate.ts # STM → LTM consolidation
│   ├── tools/
│   │   ├── remember.ts    # Store memories
│   │   ├── recall.ts      # Search memories
│   │   ├── forget.ts      # Delete memories
│   │   └── context.ts     # Context injection
│   └── utils/
│       ├── embeddings.ts  # Text embeddings (optional)
│       └── extraction.ts  # Auto-extraction logic
├── package.json
├── tsconfig.json
└── README.md
```
