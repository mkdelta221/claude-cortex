# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 3D-brain-centric dashboard with a multi-view app defaulting to a 2D knowledge graph, adding a card grid view and insights panels.

**Architecture:** The single-page `page.tsx` gets restructured into a nav-rail layout with four switchable views (Graph, Memories, Insights, Brain). Shared state lives in the existing Zustand store. Three new API endpoints support the Insights view. The existing 3D brain moves into its own view tab unchanged.

**Tech Stack:** Next.js 16 / React 19, react-force-graph-2d (new dep), Recharts (existing), Zustand (existing), Tailwind CSS, Framer Motion (existing), Lucide icons (existing).

---

## Phase 1: Nav Rail + Layout Shell

### Task 1: Install react-force-graph-2d

**Files:**
- Modify: `dashboard/package.json`

**Step 1: Install dependency**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npm install react-force-graph-2d`

**Step 2: Verify installation**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && node -e "require('react-force-graph-2d')"`
Expected: No error

**Step 3: Commit**

```bash
cd /Users/michael/Development/claude-cortex
git add dashboard/package.json dashboard/package-lock.json
git commit -m "chore: add react-force-graph-2d dependency"
```

---

### Task 2: Update Zustand store for multi-view

**Files:**
- Modify: `dashboard/src/lib/store.ts`

**Step 1: Update viewMode type**

In `dashboard/src/lib/store.ts`, change the `viewMode` type from `'3d' | 'list' | 'graph'` to `'graph' | 'memories' | 'insights' | 'brain'` and default to `'graph'`.

```typescript
// View mode
viewMode: 'graph' | 'memories' | 'insights' | 'brain';
setViewMode: (mode: 'graph' | 'memories' | 'insights' | 'brain') => void;
```

Default:
```typescript
viewMode: 'graph',
```

**Step 2: Verify build**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`

Note: Build may show errors from page.tsx still referencing old types — that's expected, we fix it in Task 3.

**Step 3: Commit**

```bash
git add dashboard/src/lib/store.ts
git commit -m "feat(dashboard): update store for multi-view navigation"
```

---

### Task 3: Create NavRail component

**Files:**
- Create: `dashboard/src/components/nav/NavRail.tsx`

**Step 1: Create the nav rail**

Create `dashboard/src/components/nav/NavRail.tsx`:

```tsx
'use client';

import { useDashboardStore } from '@/lib/store';
import { useStats } from '@/hooks/useMemories';
import { Network, LayoutGrid, BarChart3, Brain } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'graph' as const, label: 'Graph', icon: Network },
  { id: 'memories' as const, label: 'Memories', icon: LayoutGrid },
  { id: 'insights' as const, label: 'Insights', icon: BarChart3 },
  { id: 'brain' as const, label: 'Brain', icon: Brain },
];

export function NavRail() {
  const { viewMode, setViewMode } = useDashboardStore();
  const { data: stats } = useStats();

  const healthPercent = stats?.decayDistribution
    ? Math.round(
        (stats.decayDistribution.healthy /
          Math.max(1, stats.total)) *
          100
      )
    : null;

  return (
    <nav className="w-14 border-r border-slate-800 bg-slate-900/50 flex flex-col items-center py-3 shrink-0">
      <div className="flex-1 flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setViewMode(id)}
            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
              viewMode === id
                ? 'bg-cyan-600/20 text-cyan-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title={label}
          >
            <Icon size={18} />
            <span className="text-[9px] leading-none">{label}</span>
          </button>
        ))}
      </div>

      {/* Bottom stats */}
      <div className="flex flex-col items-center gap-1 text-[10px] text-slate-500">
        {stats && <span>{stats.total}</span>}
        {healthPercent !== null && <span>{healthPercent}%</span>}
      </div>
    </nav>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/src/components/nav/NavRail.tsx
git commit -m "feat(dashboard): add NavRail component"
```

---

### Task 4: Restructure page.tsx with layout shell

**Files:**
- Modify: `dashboard/src/app/page.tsx`

**Step 1: Rewrite page.tsx**

Replace the contents of `dashboard/src/app/page.tsx` with a layout shell that:
- Keeps the existing header (logo, project selector, search, filters, status)
- Replaces the left sidebar (StatsPanel + ControlPanel) with the NavRail
- Renders the active view in the center based on `viewMode`
- Keeps the right detail panel (MemoryDetail) sliding in on selection
- Removes the DebugPanel from the bottom (it moves into Insights later)

The center area switches between:
- `viewMode === 'graph'` → placeholder `<div>Graph view coming soon</div>`
- `viewMode === 'memories'` → placeholder `<div>Memories view coming soon</div>`
- `viewMode === 'insights'` → placeholder `<div>Insights view coming soon</div>`
- `viewMode === 'brain'` → the existing `<BrainScene>` component (unchanged)

Keep all existing hooks/state/imports that are still needed (search, filters, project selector, memories data, links, mutations, control status). Remove StatsPanel, ControlPanel, and DebugPanel imports — they'll return in later tasks.

Key structure:
```tsx
<div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
  {/* Header — same as before */}
  <header>...</header>

  {/* Filter bar — same as before */}
  {showFilters && <div>...</div>}

  {/* Main content */}
  <div className="flex-1 flex overflow-hidden">
    <NavRail />

    {/* Active view */}
    <div className="flex-1 relative overflow-hidden">
      {viewMode === 'brain' && <BrainScene ... />}
      {viewMode === 'graph' && <div className="flex items-center justify-center h-full text-slate-400">Graph view — Task 5</div>}
      {viewMode === 'memories' && <div className="flex items-center justify-center h-full text-slate-400">Memories view — Task 7</div>}
      {viewMode === 'insights' && <div className="flex items-center justify-center h-full text-slate-400">Insights view — Task 9</div>}
    </div>

    {/* Right detail panel */}
    {selectedMemory && <div className="w-80 border-l ..."><MemoryDetail ... /></div>}
  </div>
</div>
```

**Step 2: Verify build**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds. Nav rail renders, Brain tab works, other tabs show placeholders.

**Step 3: Commit**

```bash
git add dashboard/src/app/page.tsx
git commit -m "feat(dashboard): restructure layout with nav rail and multi-view shell"
```

---

## Phase 2: Knowledge Graph View

### Task 5: Create KnowledgeGraph component

**Files:**
- Create: `dashboard/src/components/graph/KnowledgeGraph.tsx`

**Step 1: Build the 2D force graph**

Create `dashboard/src/components/graph/KnowledgeGraph.tsx`:

This component:
- Uses `react-force-graph-2d` with dynamic import (SSR = false)
- Receives `memories: Memory[]`, `links: MemoryLink[]`, `selectedMemory: Memory | null`, `onSelectMemory: (m: Memory | null) => void`
- Converts memories to graph nodes: `{ id: memory.id, name: memory.title, category: memory.category, type: memory.type, salience: memory.salience, decayedScore: memory.decayedScore, val: memory.salience * 10 }`
- Converts links to graph edges: `{ source: link.source_id, target: link.target_id, strength: link.strength, relationship: link.relationship }`
- Node paint: circle filled with `getCategoryColor(node.category)`, opacity based on `decayedScore`, size based on `salience`
- Border style: solid for long_term, dashed for short_term, dotted for episodic
- Node hover: tooltip with title, category, salience
- Node click: calls `onSelectMemory` with the matching memory
- Link paint: line width = `link.strength * 3`, color = slate-600
- Use `d3AlphaDecay(0.02)` and `d3VelocityDecay(0.3)` for stable layout
- `warmupTicks={100}` and `cooldownTicks={200}` for initial layout settle
- Background color: transparent (parent provides dark bg)

Use `useCallback` for paint functions to avoid rerenders. Use `useMemo` to build graphData from memories + links.

**Step 2: Verify build**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add dashboard/src/components/graph/KnowledgeGraph.tsx
git commit -m "feat(dashboard): add 2D knowledge graph component"
```

---

### Task 6: Wire KnowledgeGraph into page.tsx

**Files:**
- Modify: `dashboard/src/app/page.tsx`

**Step 1: Replace graph placeholder**

- Add dynamic import for KnowledgeGraph (same SSR-false pattern as BrainScene)
- Replace the graph placeholder div with `<KnowledgeGraph memories={memories} links={links} selectedMemory={selectedMemory} onSelectMemory={handleSelectMemory} />`

**Step 2: Verify build + manual test**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds. Graph tab shows force-directed nodes when API server is running.

**Step 3: Commit**

```bash
git add dashboard/src/app/page.tsx
git commit -m "feat(dashboard): wire knowledge graph as default view"
```

---

## Phase 3: Memories Card Grid

### Task 7: Create MemoryCard component

**Files:**
- Create: `dashboard/src/components/memories/MemoryCard.tsx`

**Step 1: Build the card component**

Create `dashboard/src/components/memories/MemoryCard.tsx`:

Props: `memory: Memory`, `isSelected: boolean`, `onSelect: (m: Memory) => void`, `isChecked?: boolean`, `onCheck?: (id: number, checked: boolean) => void`

Card layout:
- Thin colored salience bar at top (width = `salience * 100%`, color = category color)
- Title (14px semibold, truncated to 1 line)
- Category badge + type badge inline (small colored chips)
- Content preview (13px, 3 lines max, `line-clamp-3`)
- Tags as tiny chips (max 3, then "+N more")
- Footer: created date (relative, e.g. "3d ago") + last accessed date
- On click: calls `onSelect(memory)`
- Checkbox in top-right corner (only visible when `onCheck` provided)
- Highlight border when `isSelected`

Style: `bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-600 cursor-pointer transition-colors`

**Step 2: Commit**

```bash
git add dashboard/src/components/memories/MemoryCard.tsx
git commit -m "feat(dashboard): add MemoryCard component"
```

---

### Task 8: Create MemoriesView component and wire into page

**Files:**
- Create: `dashboard/src/components/memories/MemoriesView.tsx`
- Modify: `dashboard/src/app/page.tsx`

**Step 1: Build the memories grid view**

Create `dashboard/src/components/memories/MemoriesView.tsx`:

Props: `memories: Memory[]`, `selectedMemory: Memory | null`, `onSelectMemory: (m: Memory | null) => void`

Features:
- Sort dropdown: salience (default), created date, last accessed, decay — uses local state, sorts in-memory
- View toggle: grid (default) / compact list — grid uses CSS grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`, list uses single column with smaller cards
- Bulk select: checkbox toggle at top, "Select all" button, "Delete selected" button (calls `DELETE /api/memories/:id` for each)
- Renders `<MemoryCard>` for each memory
- Scrollable with `overflow-y-auto`

**Step 2: Wire into page.tsx**

Replace the memories placeholder with `<MemoriesView memories={memories} selectedMemory={selectedMemory} onSelectMemory={handleSelectMemory} />`

**Step 3: Verify build**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add dashboard/src/components/memories/MemoriesView.tsx dashboard/src/app/page.tsx
git commit -m "feat(dashboard): add memories card grid view"
```

---

## Phase 4: Insights View

### Task 9: Add API endpoints for insights

**Files:**
- Modify: `src/api/visualization-server.ts`

**Step 1: Add activity endpoint**

Add `GET /api/memories/activity` — returns daily memory creation counts for the last 365 days.

```typescript
app.get('/api/memories/activity', (req: Request, res: Response) => {
  try {
    const project = typeof req.query.project === 'string' ? req.query.project : undefined;
    const db = getDatabase();

    const query = project
      ? `SELECT date(created_at) as date, COUNT(*) as count
         FROM memories WHERE project = ?
         GROUP BY date(created_at)
         ORDER BY date DESC
         LIMIT 365`
      : `SELECT date(created_at) as date, COUNT(*) as count
         FROM memories
         GROUP BY date(created_at)
         ORDER BY date DESC
         LIMIT 365`;

    const rows = project
      ? db.prepare(query).all(project) as { date: string; count: number }[]
      : db.prepare(query).all() as { date: string; count: number }[];

    res.json({ activity: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

**Step 2: Add quality endpoint**

Add `GET /api/memories/quality` — returns counts and lists for never-accessed, stale, and duplicate groups.

```typescript
app.get('/api/memories/quality', (req: Request, res: Response) => {
  try {
    const project = typeof req.query.project === 'string' ? req.query.project : undefined;
    const db = getDatabase();

    const projectClause = project ? 'WHERE project = ?' : '';
    const params = project ? [project] : [];

    // Never accessed (access_count = 0, excluding very recent)
    const neverAccessed = db.prepare(`
      SELECT id, title, category, type, created_at, salience
      FROM memories ${projectClause ? projectClause + ' AND' : 'WHERE'} access_count = 0
      AND created_at < datetime('now', '-1 day')
      ORDER BY created_at DESC LIMIT 50
    `).all(...params) as Array<Record<string, unknown>>;

    // Stale (low decay, not accessed in 30+ days)
    const stale = db.prepare(`
      SELECT id, title, category, type, last_accessed, decayed_score, salience
      FROM memories ${projectClause ? projectClause + ' AND' : 'WHERE'} decayed_score < 0.3
      AND last_accessed < datetime('now', '-30 days')
      ORDER BY decayed_score ASC LIMIT 50
    `).all(...params) as Array<Record<string, unknown>>;

    // Potential duplicates (same title, different IDs)
    const duplicates = db.prepare(`
      SELECT m1.id as id1, m1.title as title1, m2.id as id2, m2.title as title2
      FROM memories m1
      JOIN memories m2 ON m1.title = m2.title AND m1.id < m2.id
      ${projectClause ? (project ? 'WHERE m1.project = ?' : '') : ''}
      LIMIT 50
    `).all(...params) as Array<Record<string, unknown>>;

    res.json({
      neverAccessed: { count: neverAccessed.length, items: neverAccessed },
      stale: { count: stale.length, items: stale },
      duplicates: { count: duplicates.length, items: duplicates },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

**Step 3: Build backend**

Run: `cd /Users/michael/Development/claude-cortex && npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/api/visualization-server.ts
git commit -m "feat(api): add activity and quality endpoints for insights"
```

---

### Task 10: Add frontend hooks for insights data

**Files:**
- Modify: `dashboard/src/hooks/useMemories.ts`

**Step 1: Add fetch functions and hooks**

Add to `dashboard/src/hooks/useMemories.ts`:

```typescript
// Activity data for heatmap
export interface ActivityDay {
  date: string;
  count: number;
}

async function fetchActivity(project?: string): Promise<{ activity: ActivityDay[] }> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/memories/activity${params}`);
  if (!response.ok) throw new Error('Failed to fetch activity');
  return response.json();
}

export function useActivity(project?: string) {
  return useQuery({
    queryKey: ['activity', project],
    queryFn: () => fetchActivity(project),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

// Memory quality data
export interface QualityData {
  neverAccessed: { count: number; items: Array<Record<string, unknown>> };
  stale: { count: number; items: Array<Record<string, unknown>> };
  duplicates: { count: number; items: Array<Record<string, unknown>> };
}

async function fetchQuality(project?: string): Promise<QualityData> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/memories/quality${params}`);
  if (!response.ok) throw new Error('Failed to fetch quality');
  return response.json();
}

export function useQuality(project?: string) {
  return useQuery({
    queryKey: ['quality', project],
    queryFn: () => fetchQuality(project),
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 2: Commit**

```bash
git add dashboard/src/hooks/useMemories.ts
git commit -m "feat(dashboard): add hooks for activity and quality data"
```

---

### Task 11: Create ActivityHeatmap component

**Files:**
- Create: `dashboard/src/components/insights/ActivityHeatmap.tsx`

**Step 1: Build heatmap**

Create `dashboard/src/components/insights/ActivityHeatmap.tsx`:

A GitHub-style contribution heatmap built with plain SVG (no extra dependency needed):
- 52 columns (weeks) × 7 rows (days)
- Each cell is a rounded rect, colored from slate-800 (0 memories) to cyan-500 (max)
- Tooltip on hover showing date + count
- Month labels across the top
- Day labels on the left (Mon, Wed, Fri)
- Props: `activity: ActivityDay[]`

Use `useMemo` to transform the activity array into a 52×7 grid keyed by date.

**Step 2: Commit**

```bash
git add dashboard/src/components/insights/ActivityHeatmap.tsx
git commit -m "feat(dashboard): add activity heatmap component"
```

---

### Task 12: Create KnowledgeMapPanel component

**Files:**
- Create: `dashboard/src/components/insights/KnowledgeMapPanel.tsx`

**Step 1: Build knowledge map panel**

Create `dashboard/src/components/insights/KnowledgeMapPanel.tsx`:

Props: `stats: MemoryStats`, `onNavigate: (filter: { category?: string; project?: string }) => void`

Uses Recharts `<BarChart>` (already in deps):
- Horizontal bar chart of memories per category, colored by category color
- Horizontal bar chart of memories per project (from stats or a separate query)
- Bars are clickable — calls `onNavigate({ category })` which switches to Memories view with that filter
- Categories with <3 memories get a "thin coverage" warning badge

**Step 2: Commit**

```bash
git add dashboard/src/components/insights/KnowledgeMapPanel.tsx
git commit -m "feat(dashboard): add knowledge map panel"
```

---

### Task 13: Create QualityPanel component

**Files:**
- Create: `dashboard/src/components/insights/QualityPanel.tsx`

**Step 1: Build quality panel**

Create `dashboard/src/components/insights/QualityPanel.tsx`:

Props: `project?: string`

Fetches quality data using `useQuality(project)`. Three collapsible sections:
- **Never accessed** — count badge, expandable list of memory titles with delete + reinforce buttons
- **Stale** — same layout, shows decayed_score as a warning indicator
- **Duplicates** — shows pairs with option to delete one

Each section header has a count badge and chevron toggle. Use `useState` for expand/collapse. Use Framer Motion `AnimatePresence` for smooth expand.

Also fetches contradictions using existing `GET /api/contradictions` endpoint. Fourth section:
- **Contradictions** — pairs of memories that contradict, with score and shared topics

**Step 2: Commit**

```bash
git add dashboard/src/components/insights/QualityPanel.tsx
git commit -m "feat(dashboard): add memory quality panel"
```

---

### Task 14: Create InsightsView and wire into page

**Files:**
- Create: `dashboard/src/components/insights/InsightsView.tsx`
- Modify: `dashboard/src/app/page.tsx`

**Step 1: Build insights view**

Create `dashboard/src/components/insights/InsightsView.tsx`:

Composes the three panels vertically with scroll:
```tsx
<div className="h-full overflow-y-auto p-6 space-y-6">
  <section>
    <h2>Activity</h2>
    <ActivityHeatmap activity={activityData} />
  </section>
  <section>
    <h2>Knowledge Coverage</h2>
    <KnowledgeMapPanel stats={stats} onNavigate={handleNavigate} />
  </section>
  <section>
    <h2>Memory Quality</h2>
    <QualityPanel project={selectedProject} />
  </section>
</div>
```

Props: `selectedProject?: string`, `stats: MemoryStats`

The `handleNavigate` function should switch to Memories view and set the appropriate filter in the Zustand store.

**Step 2: Wire into page.tsx**

Replace insights placeholder with `<InsightsView selectedProject={selectedProject} stats={stats} />`

**Step 3: Verify build**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add dashboard/src/components/insights/ dashboard/src/app/page.tsx
git commit -m "feat(dashboard): add insights view with activity, coverage, and quality"
```

---

## Phase 5: Polish

### Task 15: Visual consistency pass

**Files:**
- Modify: `dashboard/src/app/globals.css` (if needed)
- Modify: Various components for color/spacing consistency

**Step 1: Audit and fix**

Review all new components for:
- Consistent background shades (slate-900, slate-950)
- Consistent border colors (slate-800)
- Consistent text sizes (titles 20px, cards 14px/13px, badges 11px)
- Accent color is cyan-400/cyan-500 throughout
- Framer Motion transitions on view switches (fade, 150ms)
- Category colors use `getCategoryColor()` everywhere (not hardcoded)

**Step 2: Add view transition animation**

In `page.tsx`, wrap the view content area with Framer Motion `AnimatePresence` and `motion.div` with `key={viewMode}`:
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={viewMode}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    className="flex-1 relative overflow-hidden"
  >
    {/* view content */}
  </motion.div>
</AnimatePresence>
```

**Step 3: Verify build + manual test**

Run: `cd /Users/michael/Development/claude-cortex/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds. All four views render correctly.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): visual consistency and view transitions"
```

---

### Task 16: Version bump, changelog, release

**Files:**
- Modify: `package.json` (bump version)
- Modify: `CHANGELOG.md`

**Step 1: Bump version**

Bump to `1.11.0` in `package.json`.

**Step 2: Update CHANGELOG.md**

Add entry:
```markdown
## [1.11.0] - 2026-01-30

### Added
- **Dashboard redesign**: Multi-view layout with nav rail
- **2D Knowledge Graph**: Interactive force-directed graph as default view (react-force-graph-2d)
- **Memories card grid**: Browseable card view with sort, bulk select, and delete
- **Insights view**: Activity heatmap, knowledge coverage charts, memory quality analysis
- **API endpoints**: `/api/memories/activity` and `/api/memories/quality` for insights data
- **View transitions**: Smooth fade animations between views (Framer Motion)
- 3D Brain visualization preserved as optional "Brain" tab
```

**Step 3: Build backend**

Run: `cd /Users/michael/Development/claude-cortex && npm run build`

**Step 4: Commit, tag, publish**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat: dashboard redesign with multi-view layout (v1.11.0)"
git tag v1.11.0
git push && git push --tags
npm publish
gh release create v1.11.0 --title "v1.11.0 — Dashboard Redesign" --notes "..."
```

---

## Summary

| Phase | Tasks | What ships |
|-------|-------|-----------|
| 1 | 1–4 | Nav rail, layout shell, Brain tab works |
| 2 | 5–6 | 2D knowledge graph as default view |
| 3 | 7–8 | Memory card grid with sort + bulk actions |
| 4 | 9–14 | Insights: heatmap, coverage, quality, contradictions |
| 5 | 15–16 | Polish, transitions, release v1.11.0 |

Each phase is independently shippable. Phase 1 is the prerequisite for all others, but Phases 2–4 are independent of each other.
