# Claude Cortex 🧠

**Brain-like memory system for Claude Code** - Solves the context compaction and memory persistence problems.

## The Problem

Claude Code has fundamental limitations:

1. **Context Window Exhaustion** - Long sessions hit token limits
2. **Compaction Loss** - When context is summarized, important details are lost
3. **No Persistence** - Knowledge doesn't survive across sessions

## The Solution

Claude Memory works like a human brain:

- **Short-term memory** - Session-level, high detail, decays fast
- **Long-term memory** - Cross-session, consolidated, persists
- **Episodic memory** - Specific events and successful patterns
- **Salience detection** - Automatically identifies what's worth remembering
- **Temporal decay** - Memories fade but can be reinforced through access
- **Consolidation** - Like sleep, moves worthy memories to long-term storage

## Quick Start

### 1. Install

```bash
cd claude-cortex
npm install
npm run build
```

### 2. Configure Claude Code

**Option A: Project-scoped (recommended for testing)**

Create `.mcp.json` in your project directory:

```json
{
  "mcpServers": {
    "memory": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/claude-compact/dist/index.js"]
    }
  }
}
```

**Option B: Global (all projects)**

Create `~/.claude/.mcp.json` with the same content.

After adding the config, restart Claude Code and approve the MCP server when prompted.

### 3. Configure PreCompact Hook (Recommended)

Add to `~/.claude/settings.json` for automatic memory extraction before compaction:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/claude-compact/scripts/pre-compact-hook.mjs"
          }
        ]
      }
    ]
  }
}
```

This ensures important context is auto-saved before any compaction event.

### 3. Use It

The memory system integrates seamlessly with Claude Code. Here are the key tools:

#### Remember Something
```
Claude, remember that we're using PostgreSQL for the database.
```

#### Recall Information
```
Claude, what do you know about our database setup?
```

#### Get Context (Key for Compaction!)
```
Claude, get the context for this project.
```

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with auto-categorization and salience detection |
| `recall` | Search and retrieve memories (semantic search, filters) |
| `forget` | Delete memories (single or bulk, with safety confirmations) |
| `get_context` | **THE KEY TOOL** - Get relevant context, especially after compaction |
| `start_session` | Start a session, get project context |
| `end_session` | End session, trigger consolidation |
| `consolidate` | Run memory consolidation manually |
| `memory_stats` | View memory statistics |
| `export_memories` | Export as JSON for backup |
| `import_memories` | Import from JSON |

## Resources

The server also exposes MCP resources:

| Resource | Description |
|----------|-------------|
| `memory://context` | Current memory context summary |
| `memory://important` | High-priority memories |
| `memory://recent` | Recently accessed memories |

## How It Works

### Salience Detection

Not everything is worth remembering. The system scores information on:

| Factor | Weight | Example |
|--------|--------|---------|
| Explicit request | 1.0 | "Remember this" |
| Architecture decision | 0.9 | "We're using microservices" |
| Error resolution | 0.8 | "Fixed by updating X" |
| Code pattern | 0.7 | "Use this approach for auth" |
| User preference | 0.7 | "Always use strict mode" |
| Code references | 0.5 | Mentions specific files/functions |
| Emotional markers | 0.5 | "Important", "critical" |

### Temporal Decay

Like human memory:

```
score = base_salience × (0.995 ^ hours_since_access)
```

- **Decay**: Memories fade over time
- **Reinforcement**: Each access boosts score by 1.2×
- **Consolidation**: Frequently accessed short-term → long-term

### Memory Types

| Type | Decay Rate | Use Case |
|------|------------|----------|
| Short-term | Fast (hourly) | Current session, debugging |
| Long-term | Slow (daily) | Architecture, patterns |
| Episodic | Medium | Specific events, learnings |

## Solving the Compaction Problem

When Claude Code compacts context:

1. **Before compaction** - The PreCompact hook **automatically extracts** important content
2. **After compaction** - Use `get_context` to restore what's relevant

### Automatic Memory Extraction (PreCompact Hook)

The system includes a hook that runs before every context compaction:

```
🧠 AUTO-MEMORY: 3 important items were automatically saved before compaction.
After compaction, use 'get_context' to retrieve your memories.
```

**What gets auto-extracted:**
- Decisions: "decided to...", "going with...", "chose..."
- Error fixes: "fixed by...", "the solution was...", "root cause..."
- Learnings: "learned that...", "discovered...", "turns out..."
- Architecture: "the architecture uses...", "design pattern..."
- Preferences: "always...", "never...", "prefer to..."
- Important notes: "important:", "remember:", "key point..."

Auto-extracted memories are:
- Tagged with `auto-extracted` for easy filtering
- Scored using salience detection (only high-scoring items saved)
- Limited to 5 per compaction to avoid noise

### Example Workflow

```
# Session starts
Claude: Let me get the project context.
[Calls get_context tool]
> Found: PostgreSQL database, React frontend, auth uses JWT...

# Work happens, context grows...

# Compaction occurs, context is lost!

# You notice Claude forgot something:
You: Claude, what database are we using?
Claude: Let me check my memory.
[Calls recall tool with query "database"]
> Found: "Using PostgreSQL for the database" (architecture, 95% salience)
```

## Configuration

### Database Location

Default: `~/.claude-cortex/memories.db` (with fallback to legacy `~/.claude-memory/` for existing users)

Custom location:
```bash
node dist/index.js --db /path/to/custom.db
```

Or in Claude config:
```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/dist/index.js", "--db", "/path/to/custom.db"]
    }
  }
}
```

### Tuning Parameters

In `src/memory/types.ts`:

```typescript
export const DEFAULT_CONFIG = {
  decayRate: 0.995,              // Per-hour decay factor
  reinforcementFactor: 1.2,      // Access boost
  salienceThreshold: 0.3,        // Min score to keep
  consolidationThreshold: 0.6,   // Min for STM→LTM
  maxShortTermMemories: 100,
  maxLongTermMemories: 1000,
  autoConsolidateHours: 4,
};
```

## Development

```bash
# Install dependencies
npm install

# Development mode (with tsx)
npm run dev

# Build
npm run build

# Watch mode
npm run watch
```

## How This Differs from Other Solutions

| Feature | Claude Memory | Other MCP Memory Tools |
|---------|--------------|------------------------|
| Salience detection | ✅ Auto-detects importance | ❌ Manual only |
| Temporal decay | ✅ Memories fade naturally | ❌ Static storage |
| Consolidation | ✅ STM → LTM promotion | ❌ Flat storage |
| Context injection | ✅ `get_context` tool | ❌ Manual recall |
| Semantic search | ✅ FTS5 full-text | Varies |
| Episodic memory | ✅ Event/pattern storage | ❌ Usually missing |

## License

MIT
