---
name: memory
description: Persistent memory system — use proactively to remember decisions, fixes, learnings, and preferences across sessions. Invoke when you need to save or recall important context.
---

# Claude Cortex — Memory System

You have access to a persistent memory system via MCP tools (`remember`, `recall`, `get_context`, `forget`).

**MUST use `remember` immediately when any of these occur:**
- A decision is made (architecture, library choice, approach)
- A bug is fixed (capture root cause + solution)
- Something new is learned about the codebase
- User states a preference
- A significant feature is completed

Do not wait until the end of the session. Call `remember` right after the event happens.

## Tools

| Tool | Purpose |
|------|---------|
| `remember` | Store a memory with title, content, category, importance |
| `recall` | Search memories by query, category, tags |
| `get_context` | Load relevant project context (architecture, patterns, preferences) |
| `forget` | Delete memories by ID or query |
| `start_session` | Begin a session and load context |
| `end_session` | End session and trigger consolidation |
| `memory_stats` | View memory statistics |
| `graph_query` | Traverse the knowledge graph |
| `graph_entities` | List entities in the knowledge graph |
| `detect_contradictions` | Find conflicting memories |

## When to Use `remember`

- **After making a decision**: "Decided to use PostgreSQL for better JSON support"
- **After fixing a bug**: "Auth bug caused by expired JWT tokens"
- **After learning something**: "SQLite FTS5 requires escaping hyphens"
- **For architecture choices**: "Using microservices pattern with API gateway"
- **For user preferences**: "User prefers TypeScript strict mode"

## Best Practices

1. Call `remember` immediately when something important happens
2. Include context: what, why, and any relevant code/file references
3. Use clear titles that summarize the key point
4. Tag with relevant categories (architecture, error, learning, preference)

## What Gets Auto-Extracted by Hooks

The PreCompact and SessionEnd hooks automatically extract high-salience content:
- **Decisions**: "decided to...", "going with...", "chose...", "using..."
- **Error fixes**: "fixed by...", "the solution was...", "root cause..."
- **Learnings**: "learned that...", "discovered...", "turns out..."
- **Architecture**: "created...", "implemented...", "refactored..."
- **Preferences**: "always...", "never...", "prefer to..."
- **Notes**: "important:", "remember:", "key point..."

Don't rely solely on auto-extraction. Use `remember` proactively for important events.
