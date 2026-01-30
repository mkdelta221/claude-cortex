# Claude Cortex 🧠

**Brain-like memory system for Claude Code** - Solves the context compaction and memory persistence problems.

## The Problem

Claude Code has fundamental limitations:

1. **Context Window Exhaustion** - Long sessions hit token limits
2. **Compaction Loss** - When context is summarized, important details are lost
3. **No Persistence** - Knowledge doesn't survive across sessions

## The Solution

Claude Cortex works like a human brain:

- **Short-term memory** - Session-level, high detail, decays fast
- **Long-term memory** - Cross-session, consolidated, persists
- **Episodic memory** - Specific events and successful patterns
- **Salience detection** - Automatically identifies what's worth remembering
- **Temporal decay** - Memories fade but can be reinforced through access
- **Consolidation** - Like sleep, moves worthy memories to long-term storage

## Quick Start

### 1. Install

**Option A: Install via npm (Recommended)**

```bash
npm install -g claude-cortex
```

**Option B: Use with npx (no install)**

Configure directly in `.mcp.json` (see step 2).

**Option C: From source**

```bash
git clone https://github.com/mkdelta221/claude-cortex.git
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
      "command": "npx",
      "args": ["-y", "claude-cortex"]
    }
  }
}
```

**Option B: Global (all projects)**

Create `~/.claude/.mcp.json` with the same content.

After adding the config, restart Claude Code and approve the MCP server when prompted.

### 3. Configure Hooks (Recommended)

Add to `~/.claude/settings.json` for automatic memory extraction and context loading:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y claude-cortex hook pre-compact",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y claude-cortex hook session-start",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y claude-cortex hook session-end",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- **PreCompact**: Auto-saves important context before compaction events
- **SessionStart**: Auto-loads project context at the start of each session
- **SessionEnd**: Auto-saves context when the session exits

### 4. Run Setup (Recommended)

```bash
npx claude-cortex setup
```

This configures everything automatically:
- **Claude Code**: Adds proactive memory instructions to `~/.claude/CLAUDE.md`
- **Clawdbot/Moltbot**: Installs `cortex-memory` hook if Clawdbot or Moltbot is detected

Safe to run multiple times (idempotent). If Clawdbot isn't installed, it's skipped silently.

### 5. Use It

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
2. **After compaction** - Claude is directed to call `get_context` automatically to restore context

### Automatic Memory Extraction (PreCompact Hook)

The system includes a hook that runs before every context compaction:

```
🧠 AUTO-MEMORY: 3 important items were automatically saved before compaction.
IMPORTANT: You MUST call the 'get_context' MCP tool NOW to restore your project knowledge.
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

## Hook Coverage

Claude Cortex uses three hooks to cover the full session lifecycle:

| Hook | Fires When | What It Does | Reliability |
|------|-----------|--------------|-------------|
| **SessionStart** | Session begins | Loads project context from memory | Reliable |
| **PreCompact** | Before context compaction | Extracts important content before context is lost | Reliable (primary safety net) |
| **SessionEnd** | Session terminates | Extracts important content on exit | Best-effort* |

*SessionEnd does not fire on forced termination (terminal killed, SSH drops, crash). PreCompact remains the primary safety net since compaction happens more frequently than session exits.

### Stop Hook (Opt-in, Future)

A prompt-based Stop hook that uses Haiku to evaluate each Claude response for important events is planned. This calls the Haiku API on every response, which adds latency and cost. It will be opt-in via `--with-stop-hook` flag.

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

## Dashboard (Optional)

The dashboard provides a 3D brain visualization of your memories with real-time updates.

### CLI Commands

```bash
npx claude-cortex setup              # Configure Claude Code + Clawdbot (if detected)
npx claude-cortex hook pre-compact   # Run pre-compact hook (for settings.json)
npx claude-cortex hook session-start # Run session-start hook (for settings.json)
npx claude-cortex service install    # Enable auto-start on login
npx claude-cortex service uninstall  # Remove auto-start
npx claude-cortex service status     # Check service status
npx claude-cortex clawdbot install   # Install Clawdbot/Moltbot hook manually
npx claude-cortex clawdbot uninstall # Remove Clawdbot/Moltbot hook
npx claude-cortex clawdbot status    # Check Clawdbot hook status
```

Works on **macOS** (launchd), **Linux** (systemd), and **Windows** (Startup folder). The dashboard and API server will start automatically on login.

### Manual Start

```bash
# Terminal 1: Start API server
npm run dev:api

# Terminal 2: Start dashboard
cd dashboard && npm run dev
```

- **Dashboard**: http://localhost:3030
- **API Server**: http://localhost:3001

### Features

- **3D Brain Visualization** - Memories displayed as nodes in a neural network
- **Search** - Full-text search with autocomplete suggestions
- **Filters** - Filter by memory type (STM/LTM/Episodic) and category
- **Statistics** - System health, memory counts, category distribution
- **Controls** - Pause/resume memory creation, trigger consolidation
- **Version Management** - Check for updates, update, and restart server

### Memory Visualization Colors

| Color | Category |
|-------|----------|
| Blue | Architecture |
| Purple | Pattern |
| Green | Preference |
| Red | Error |
| Yellow | Learning |
| Cyan | Context |

## Moltbot / ClawdBot Integration

Claude Cortex works with [Moltbot](https://github.com/moltbot/moltbot) (formerly ClawdBot) via [mcporter](https://mcpmarket.com/tools/skills/mcporter).

### Automatic Hook (Recommended)

```bash
npx claude-cortex clawdbot install
```

Or run `npx claude-cortex setup` — it installs the hook automatically if Clawdbot/Moltbot is detected.

The **cortex-memory** hook provides:
- **Auto-save on `/new`** — Extracts decisions, fixes, learnings from ending sessions
- **Context injection on bootstrap** — Agent starts with past session knowledge
- **Keyword triggers** — Say "remember this" or "don't forget" to save with critical importance

### Manual mcporter Commands

Since Claude Cortex is a standard MCP server, Moltbot can also call its tools directly:

```bash
# Remember something via Moltbot
npx mcporter call --stdio "npx -y claude-cortex" memory.remember title:"API uses JWT" content:"The auth system uses JWT tokens with 15-min expiry"

# Recall memories
npx mcporter call --stdio "npx -y claude-cortex" memory.recall query:"authentication"

# Get project context
npx mcporter call --stdio "npx -y claude-cortex" memory.get_context
```

**Shared memory**: Memories created via Moltbot are instantly available in Claude Code sessions and vice versa — both use the same SQLite database at `~/.claude-cortex/memories.db`.

## How This Differs from Other Solutions

| Feature | Claude Cortex | Other MCP Memory Tools |
|---------|---------------|------------------------|
| Salience detection | ✅ Auto-detects importance | ❌ Manual only |
| Temporal decay | ✅ Memories fade naturally | ❌ Static storage |
| Consolidation | ✅ STM → LTM promotion | ❌ Flat storage |
| Context injection | ✅ `get_context` tool | ❌ Manual recall |
| Semantic search | ✅ FTS5 full-text | Varies |
| Episodic memory | ✅ Event/pattern storage | ❌ Usually missing |

## Support

If you find this project useful, consider supporting its development:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/cyborgninja)

## License

MIT
