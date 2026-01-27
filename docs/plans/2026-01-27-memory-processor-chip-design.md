# Memory Processor Chip Visualization Design

**Date:** 2026-01-27

## Overview

Redesign of the Claude Cortex dashboard from an organic brain visualization to a clean CPU/motherboard-inspired Memory Processor Chip.

## Design Decisions

| Aspect | Decision |
|--------|----------|
| Style | Clean architecture diagram (schematic view) |
| Layout | Grid matrix in rectangular chip die |
| Sections | 3 horizontal banks: STM (top), Episodic (middle), LTM (bottom) |
| Focal point | Central "Cortex Core" with radiating data buses |
| Memory nodes | Rectangular cells, color-coded by category |
| Quantum cells | High-salience (>=70%) memories as rotating Bloch spheres |
| Animation | Access pulses travel along data bus traces |
| Aesthetic | Stylized tech - clean structure with subtle glows |

## Visual Architecture

```
+--------------------------------------------------------------+
|  o                      STM BANK (0/100)                  o  |
|      [--] [--] [--] [--] [--] [--] [--] [--] [--] [--]       |
|                            ||                                 |
+----------------------------||--------------------------------+
|                    +-------------+                            |
|   EPISODIC    ==== |   CORTEX    | ====   EPISODIC           |
|     BANK           |    CORE     |           BANK            |
|   [--] [--]        |      *      |        [--] [--]          |
|                    +-------------+                            |
+----------------------------||--------------------------------+
|                            ||                                 |
|      [--] [--] [--] [--] [--] [--] [--] [--] [--] [--]       |
|  o                  LONG-TERM BANK (0/1000)               o  |
+--------------------------------------------------------------+
```

## Components Created

| Component | Purpose |
|-----------|---------|
| ChipSubstrate | Base silicon die with grid texture and borders |
| CortexCore | Central glowing processor element |
| DataBus | Trace lines connecting core to memory banks |
| MemoryCell | Standard rectangular memory nodes |
| QuantumCell | Bloch sphere visualization for high-salience memories |
| MemoryGrid | Grid layout manager for each section |
| SectionLabel | Bank labels with memory counts |
| ChipScene | Main scene orchestrator |

## Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Substrate | Dark charcoal | #1a1a2e |
| Traces | Golden copper | #FFB347 |
| Core | Bright gold | #FFD700 |
| Borders | Silver gray | #4a5568 |
| Labels | Light gray | #e2e8f0 |

## Memory Categories (Color Coding)

- architecture: cyan (#06b6d4)
- pattern: green (#22c55e)
- preference: yellow (#eab308)
- error: red (#ef4444)
- context: orange (#f97316)
- learning: lime (#84cc16)
- todo: purple (#a855f7)
- note: blue (#3b82f6)
- relationship: indigo (#6366f1)
- custom: pink (#ec4899)

## Features

1. **Grid Layout** - Memories arranged in clean rows/columns within each bank
2. **Quantum Cells** - High-salience memories (>=70%) rendered as Bloch spheres with:
   - Wireframe sphere
   - Rotating state vector arrow
   - Shimmering interference particles
3. **Access Pulses** - Visual feedback traveling along data buses when memories are accessed
4. **Cortex Core** - Central element with pulsing glow indicating activity level
5. **Section Labels** - Clear identification of each memory bank with counts
