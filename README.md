# Claude Cortex → ShieldCortex 🧠🛡️

[![npm version](https://img.shields.io/npm/v/shieldcortex.svg)](https://www.npmjs.com/package/shieldcortex)
[![npm downloads](https://img.shields.io/npm/dm/shieldcortex.svg)](https://www.npmjs.com/package/shieldcortex)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mkdelta221/claude-cortex.svg)](https://github.com/mkdelta221/claude-cortex/stargazers)

**Claude Cortex has evolved into [ShieldCortex](https://github.com/Drakon-Systems-Ltd/ShieldCortex)** — same brain-like memory system, now with a 6-layer security pipeline that blocks memory poisoning attacks.

Everything you loved about Claude Cortex is still here. It's just smarter and safer.

## Install

```bash
npm install -g shieldcortex

# Set up for your agent
shieldcortex setup              # Claude Code / Cursor / VS Code
shieldcortex openclaw install   # OpenClaw

# Verify
shieldcortex doctor
```

## What's New in ShieldCortex

Everything from Claude Cortex, plus:

- 🛡️ **6-layer defence pipeline** — blocks memory poisoning, credential leaks, prompt injection
- 🧠 **Brain-like memory** — short-term, episodic, and long-term with temporal decay
- 📊 **Knowledge graphs** — entity relationships and contradiction detection
- ⚡ **Auto-extraction** — hooks capture decisions, fixes, and learnings before context compaction
- 🔍 **Semantic search** — ONNX embeddings with FTS fallback (worker thread, non-blocking)
- 🔑 **19 MCP tools** — remember, recall, search, knowledge graph, security audit, quarantine
- ☁️ **Cloud dashboard** — device management, fleet monitoring, team features

## Quick Links

- **GitHub:** [Drakon-Systems-Ltd/ShieldCortex](https://github.com/Drakon-Systems-Ltd/ShieldCortex)
- **npm:** [shieldcortex](https://www.npmjs.com/package/shieldcortex)
- **Website:** [shieldcortex.ai](https://shieldcortex.ai)
- **Docs:** [Full README](https://github.com/Drakon-Systems-Ltd/ShieldCortex#readme)

## Why the Rename?

Claude Cortex started as a memory system. But once your agent has persistent memory, that memory becomes an attack surface — poisoned web pages, malicious emails, and hidden instructions can persist across sessions. Security isn't optional, it's the other half of the product. ShieldCortex reflects what it actually is: a brain with armour.

## Migration

```bash
# Uninstall old package
npm uninstall -g claude-cortex

# Install ShieldCortex
npm install -g shieldcortex
shieldcortex setup
```

Your existing memory database is preserved. ShieldCortex reads the same SQLite store.

---

MIT Licensed. Free forever. Built by [Drakon Systems](https://drakonsystems.com).
