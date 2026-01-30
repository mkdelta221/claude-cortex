# Dashboard Redesign — Design Document

**Date:** 2026-01-30
**Status:** Approved

## Problem

The current dashboard centers on a 3D brain visualization that looks impressive but isn't practical for day-to-day use. The dashboard lacks actionable insights, has no memory management UI, and needs visual polish.

## Goals

1. Replace the 3D brain as the default view with a practical 2D knowledge graph
2. Add insights: activity timeline, knowledge coverage, memory quality
3. Add a card grid view for browsing and managing memories
4. Preserve the 3D brain as an optional view
5. Clean up visual consistency with a proper design system

## Architecture

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Header: Logo | Search | Project Selector | Status   │
├────────┬─────────────────────────────────────────────┤
│  Nav   │                                             │
│  Rail  │  Main Content Area                          │
│        │  (switches based on nav selection)          │
│ Graph  │                                             │
│ List   │                                             │
│ Insights│                                            │
│ Brain  │                                             │
│        │                                             │
├────────┤                                             │
│ Stats  │                                             │
│ summary│                                             │
└────────┴─────────────────────────────────────────────┘
```

Four views accessible from the nav rail:

1. **Graph** (default) — 2D interactive knowledge graph
2. **Memories** — Card grid with search, filters, bulk actions
3. **Insights** — Activity timeline, knowledge coverage, memory quality
4. **Brain** — Existing 3D visualization (preserved, not default)

Right detail panel slides out when a memory is selected in any view.

### Nav Rail

- 56px wide, icons with labels below
- Active view highlighted with accent color
- Bottom section: compact stats (e.g., "247 memories · 92% healthy")

---

## View 1: Knowledge Graph (Default)

2D interactive node graph using force-directed layout.

### Nodes

- **Size** scales with salience (important = larger)
- **Color** by category: architecture=blue, error=red, pattern=green, preference=purple, learning=yellow, context=gray
- **Opacity** reflects decay (fading = translucent)
- **Border ring** for type: solid=long-term, dashed=short-term, dotted=episodic

### Edges

- Lines between linked memories, thickness = link strength
- Labels on hover showing relationship type (references, extends, contradicts, related)

### Interactions

- Pan & zoom (mouse drag + scroll)
- Click node → opens detail panel
- Hover node → tooltip with title, category, salience
- Drag nodes to rearrange
- Double-click → focus mode (zoom in, dim unrelated, highlight neighborhood)

### Clustering

- Nodes naturally cluster by category via inter-category links
- Toggle to force-group by category or by project

### Library

[react-force-graph-2d](https://github.com/vasturiano/react-force-graph) — lightweight, WebGL-accelerated, handles hundreds of nodes, built-in zoom/pan/drag.

---

## View 2: Memories (Card Grid)

Practical list/grid for browsing and managing memories.

### Card Layout

Masonry grid, responsive 1-3 columns.

Each card shows:
- Title (bold)
- Category badge + type badge (STM/LTM/episodic)
- Content preview (2-3 lines, truncated)
- Tags as small chips
- Salience bar (thin colored bar at top)
- Created date + last accessed date
- Project name (when viewing all projects)

### Controls

- Search with autocomplete (existing)
- Filter dropdowns: category, type, project, tag
- Sort by: salience, created date, last accessed, decay
- View toggle: grid / compact list

### Bulk Actions

- Checkbox per card
- "Select all" toggle
- Bulk delete, bulk re-tag (stretch)

---

## View 3: Insights

Three collapsible panels stacked vertically.

### Panel 1: Activity Timeline

- GitHub-style heatmap calendar (memory creation per day)
- Color intensity = number of memories created
- Click a day → filters to that date
- Line chart: memories created vs. decayed over past 30 days

### Panel 2: Knowledge Map

- Horizontal bar chart: memories per category
- Horizontal bar chart: memories per project
- Bars clickable → navigates to Memories view filtered to that category/project
- "Thin coverage" flag for categories with <3 memories

### Panel 3: Memory Quality

- **Never accessed** — created but never recalled (cleanup candidates)
- **Duplicates** — similar titles/content via FTS5 scoring
- **Stale** — decay <0.3, not accessed in 30+ days
- **Contradictions** — from existing `detect_contradictions` API
- Each section: count badge + expandable list + quick-action buttons (delete, reinforce, view)

---

## View 4: Brain (Existing 3D)

Existing 3D brain visualization moved to its own tab. No changes to functionality. All existing components preserved as-is.

---

## Design System

### Color Palette (Dark Theme Only)

- Background: consistent dark grays (no mixed shades)
- Accent: cyan/teal for primary actions
- Category colors consistent across all views (graph nodes, card badges, bar charts)

### Typography (Geist font)

- Page titles: 20px semibold
- Card titles: 14px semibold
- Body/content: 13px regular
- Badges/meta: 11px

### Transitions

- Smooth view switching (fade/slide)
- Panel expand/collapse via Framer Motion (already in deps)

### Detail Panel (Right)

- Existing MemoryDetail component, unchanged
- Slides in from right on memory selection in any view
- Close button + click-outside to dismiss

---

## New Dependencies

- `react-force-graph-2d` — 2D knowledge graph
- `react-calendar-heatmap` or similar — activity heatmap (or custom with SVG)
- `recharts` — already in deps, used for line charts and bar charts

---

## API Changes

New endpoints needed on the visualization server:

- `GET /api/memories/quality` — returns never-accessed, stale, duplicate counts + lists
- `GET /api/memories/activity` — returns daily memory creation counts for heatmap
- `GET /api/memories/duplicates` — returns groups of similar memories

Existing endpoints already cover everything else (memories, links, stats, contradictions).
