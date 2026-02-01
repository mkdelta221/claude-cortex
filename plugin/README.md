# Claude Cortex Plugin

Brain-like persistent memory for Claude Code. Remembers decisions, bug fixes, patterns, and preferences across sessions.

## Install

### Via Plugin Marketplace (Recommended)

```
/plugin marketplace add mkdelta221/claude-cortex
/plugin install claude-cortex
```

### Via Local Directory

```bash
npm install -g claude-cortex
claude --plugin-dir $(npx claude-cortex plugin)
```

## What Gets Installed

| Component | Purpose |
|-----------|---------|
| **MCP Server** | Provides `remember`, `recall`, `get_context`, `forget`, and 10+ other memory tools |
| **Hooks** | Auto-extracts memories on session start, pre-compact, and session end |
| **Skill** | Instructs Claude to use memory proactively (`/memory`) |

## How It Works

- **Session Start**: Loads relevant project context from past sessions
- **During Work**: Use `remember` to save decisions, fixes, and learnings
- **Pre-Compact**: Automatically extracts high-salience content before context loss
- **Session End**: Captures remaining important content

All memories are stored locally in `~/.claude-cortex/memories.db` (SQLite).

## Optional: Dashboard

The plugin handles core memory. For the visual dashboard:

```bash
npx claude-cortex service install    # Auto-start on login
# Or manually:
npx claude-cortex --dashboard        # http://localhost:3030
```

## Optional: OpenClaw Integration

If you use OpenClaw (Clawdbot), install the hook separately:

```bash
npx claude-cortex clawdbot install
```

## Uninstall

```
/plugin uninstall claude-cortex
```

Database is preserved at `~/.claude-cortex/`. To remove everything:

```bash
npx claude-cortex uninstall
rm -rf ~/.claude-cortex
```
