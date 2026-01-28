# Memory Intelligence Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Claude Cortex from CRUD-with-decay into a system where subsystems feed back into each other — searches improve links, links improve search, access patterns update salience, contradictions get surfaced, and consolidation actually merges related memories.

**Architecture:** Seven focused tasks, each connecting a currently-isolated subsystem into a unified feedback loop. No new tables or breaking schema changes. All changes are backward-compatible. Each task has clear before/after behavior.

**Tech Stack:** TypeScript, SQLite FTS5, existing embedding pipeline.

---

## Task 1: Semantic Linking (replace metadata-only auto-links)

**Problem:** `detectRelationships()` in store.ts:1211-1272 only links by shared tags, project, and category. Two memories about the same topic with different tags never link.

**Files:**
- Modify: `src/memory/store.ts:1211-1272` (detectRelationships)
- Test: `src/__tests__/store.test.ts` (add semantic linking tests)

**Step 1: Write failing test**

```typescript
// In src/__tests__/store.test.ts
describe('detectRelationships - semantic linking', () => {
  it('should link memories with similar content even without shared tags', async () => {
    const mem1 = await addMemory({
      title: 'Database choice',
      content: 'We decided to use PostgreSQL for the user data store',
      category: 'architecture',
      tags: ['database'],
      project: 'test-project',
    });
    const mem2 = await addMemory({
      title: 'Data layer architecture',
      content: 'PostgreSQL was selected as our primary database for user data',
      category: 'architecture',
      tags: ['backend'],
      project: 'test-project',
    });

    const links = await getMemoryLinks(mem1.id);
    const linkedIds = links.map(l => l.target_id === mem1.id ? l.source_id : l.target_id);
    expect(linkedIds).toContain(mem2.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "semantic linking"`
Expected: FAIL — detectRelationships only checks tags, these memories have no shared tags.

**Step 3: Implement semantic linking in detectRelationships**

Replace the body of `detectRelationships` (store.ts:1211-1272):

```typescript
export function detectRelationships(
  memory: Memory,
  maxResults: number = 5
): { targetId: number; relationship: string; strength: number }[] {
  const db = getDb();
  const results: { targetId: number; relationship: string; strength: number }[] = [];

  // 1. Tag-based linking (existing, keep)
  const tagLinks = detectTagLinks(memory, db);
  results.push(...tagLinks);

  // 2. Embedding-based semantic linking (NEW)
  if (memory.embedding) {
    const candidates = db.prepare(`
      SELECT id, title, content, embedding, category, project
      FROM memories
      WHERE id != ? AND embedding IS NOT NULL
      ORDER BY decayed_score DESC
      LIMIT 100
    `).all(memory.id) as Memory[];

    for (const candidate of candidates) {
      if (results.some(r => r.targetId === candidate.id)) continue;

      const similarity = cosineSimilarity(memory.embedding, candidate.embedding);
      if (similarity >= 0.6) {
        const strength = Math.min(0.9, similarity);
        const relationship = candidate.category === memory.category ? 'related' : 'references';
        results.push({ targetId: candidate.id, relationship, strength });
      }
    }
  }

  // 3. FTS content similarity fallback (when no embeddings)
  if (!memory.embedding && memory.content.length > 20) {
    const escaped = escapeFts5Query(memory.title + ' ' + memory.content.slice(0, 200));
    if (escaped.trim()) {
      const ftsMatches = db.prepare(`
        SELECT m.id, m.title, m.content, m.category
        FROM memories_fts fts
        JOIN memories m ON m.id = fts.rowid
        WHERE memories_fts MATCH ? AND m.id != ?
        ORDER BY rank
        LIMIT 10
      `).all(escaped, memory.id) as Memory[];

      for (const match of ftsMatches) {
        if (results.some(r => r.targetId === match.id)) continue;
        const sim = jaccardSimilarity(memory.content, match.content);
        if (sim >= 0.3) {
          results.push({
            targetId: match.id,
            relationship: 'related',
            strength: Math.min(0.7, sim + 0.2),
          });
        }
      }
    }
  }

  // Deduplicate and return top N
  const seen = new Set<number>();
  return results
    .filter(r => { if (seen.has(r.targetId)) return false; seen.add(r.targetId); return true; })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxResults);
}
```

Add import at top of store.ts:
```typescript
import { jaccardSimilarity } from './similarity.js';
```

Add `cosineSimilarity` helper (near top of store.ts):
```typescript
function cosineSimilarity(a: Buffer, b: Buffer): number {
  const vecA = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const vecB = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
```

Extract existing tag logic into `detectTagLinks()`:
```typescript
function detectTagLinks(memory: Memory, db: any): { targetId: number; relationship: string; strength: number }[] {
  // Move existing tag/project/category matching here unchanged
  // (lines 1220-1268 of current code)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "semantic linking"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/store.ts src/__tests__/store.test.ts
git commit -m "feat: semantic linking via embeddings and FTS content similarity"
```

---

## Task 2: Unified Feedback Loop (search → reinforce → link)

**Problem:** `softAccessMemory` (store.ts:440-444) only updates `last_accessed`. Searching a memory doesn't reinforce it, doesn't link co-found results, and doesn't grow the knowledge graph.

**Files:**
- Modify: `src/memory/store.ts:440-444` (softAccessMemory)
- Modify: `src/memory/store.ts:870-885` (post-search processing in searchMemories)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('search feedback loop', () => {
  it('should reinforce salience of memories returned by search', async () => {
    const mem = await addMemory({
      title: 'API design pattern',
      content: 'We use REST with JSON responses',
      category: 'pattern',
      project: 'test-project',
    });
    const originalSalience = mem.salience;

    // Search 3 times
    for (let i = 0; i < 3; i++) {
      await searchMemories({ query: 'API design', project: 'test-project' });
    }

    const updated = await getMemory(mem.id);
    expect(updated.salience).toBeGreaterThan(originalSalience);
  });

  it('should create links between memories co-returned in search results', async () => {
    const mem1 = await addMemory({
      title: 'JWT auth',
      content: 'Using JWT tokens for authentication',
      category: 'architecture',
      tags: ['auth'],
      project: 'test-project',
    });
    const mem2 = await addMemory({
      title: 'Token expiry',
      content: 'JWT tokens expire after 24 hours',
      category: 'architecture',
      tags: ['auth'],
      project: 'test-project',
    });

    await searchMemories({ query: 'JWT authentication tokens', project: 'test-project' });

    const links = await getMemoryLinks(mem1.id);
    const linkedIds = links.map(l => l.target_id === mem1.id ? l.source_id : l.target_id);
    expect(linkedIds).toContain(mem2.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "search feedback loop"`
Expected: FAIL — softAccessMemory doesn't boost salience, no search-based linking exists.

**Step 3: Replace softAccessMemory with reinforceFromSearch**

```typescript
// Replace softAccessMemory (store.ts:440-444)
function reinforceFromSearch(memoryId: number): void {
  const db = getDb();
  // Small salience boost per search appearance (diminishing returns)
  const memory = db.prepare('SELECT salience, access_count FROM memories WHERE id = ?').get(memoryId) as any;
  if (!memory) return;

  const boost = Math.max(0.005, 0.02 / (1 + memory.access_count * 0.1));
  const newSalience = Math.min(1.0, memory.salience + boost);

  db.prepare(`
    UPDATE memories
    SET last_accessed = CURRENT_TIMESTAMP,
        access_count = access_count + 1,
        salience = ?
    WHERE id = ?
  `).run(newSalience, memoryId);
}
```

Add search-result co-linking after the search scoring loop (after line ~878):

```typescript
// Link co-returned search results (top 5 only, to avoid noise)
const topResults = scored.slice(0, 5);
if (topResults.length >= 2) {
  for (let i = 0; i < topResults.length; i++) {
    for (let j = i + 1; j < topResults.length; j++) {
      const idA = topResults[i].memory.id;
      const idB = topResults[j].memory.id;
      const existing = db.prepare(
        'SELECT strength FROM memory_links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)'
      ).get(idA, idB, idB, idA) as any;

      if (existing) {
        // Strengthen existing link (cap 1.0)
        const newStrength = Math.min(1.0, existing.strength + 0.03);
        db.prepare(
          'UPDATE memory_links SET strength = ? WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)'
        ).run(newStrength, idA, idB, idB, idA);
      } else {
        // Create weak co-search link
        try {
          db.prepare(
            'INSERT INTO memory_links (source_id, target_id, relationship, strength) VALUES (?, ?, ?, ?)'
          ).run(idA, idB, 'related', 0.2);
        } catch { /* ignore duplicate */ }
      }
    }
  }
}
```

Update all `softAccessMemory` call sites to use `reinforceFromSearch`.

**Step 4: Run tests**

Run: `npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/memory/store.ts src/__tests__/store.test.ts
git commit -m "feat: search results reinforce salience and create co-search links"
```

---

## Task 3: Fix Salience — Make It Evolve Over Time

**Problem:** Salience is keyword-based, set once on insert, and `mentionCount` is always 1. Salience should update based on access patterns, link count, and contradictions.

**Files:**
- Modify: `src/memory/salience.ts:77-96` (computeSalienceScore)
- Modify: `src/memory/store.ts` (accessMemory)
- Modify: `src/memory/consolidate.ts:76-82` (salience update during consolidation)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('dynamic salience', () => {
  it('should increase salience for highly-linked memories during consolidation', async () => {
    const hub = await addMemory({
      title: 'Core API pattern',
      content: 'All API endpoints follow REST conventions',
      category: 'pattern',
      project: 'test-project',
    });

    // Create 5 memories linked to hub
    for (let i = 0; i < 5; i++) {
      const mem = await addMemory({
        title: `Endpoint ${i}`,
        content: `REST endpoint following API pattern ${i}`,
        category: 'pattern',
        project: 'test-project',
      });
      await createMemoryLink(hub.id, mem.id, 'related', 0.6);
    }

    const before = hub.salience;
    await consolidate();
    const after = (await getMemory(hub.id)).salience;

    expect(after).toBeGreaterThan(before);
  });
});
```

**Step 2: Run to verify failure**

Run: `npm test -- --grep "dynamic salience"`
Expected: FAIL — consolidation doesn't update salience based on links.

**Step 3: Add salience evolution to consolidation**

Add a new function in `consolidate.ts` after the main consolidation flow:

```typescript
/**
 * Adjust salience based on structural importance (link count, contradiction status).
 * Called during consolidation.
 */
function evolveSalience(db: any): number {
  let updated = 0;

  // Boost highly-linked memories (hub bonus)
  const hubs = db.prepare(`
    SELECT m.id, m.salience,
      (SELECT COUNT(*) FROM memory_links WHERE source_id = m.id OR target_id = m.id) as link_count
    FROM memories m
    WHERE m.type IN ('long_term', 'episodic')
  `).all() as { id: number; salience: number; link_count: number }[];

  for (const hub of hubs) {
    if (hub.link_count < 2) continue;
    // Logarithmic bonus: 2 links = +0.02, 5 links = +0.05, 10 links = +0.07
    const linkBonus = Math.min(0.1, Math.log2(hub.link_count) * 0.03);
    const newSalience = Math.min(1.0, hub.salience + linkBonus);
    if (newSalience > hub.salience) {
      db.prepare('UPDATE memories SET salience = ? WHERE id = ?').run(newSalience, hub.id);
      updated++;
    }
  }

  // Penalize contradicted memories slightly (both sides)
  const contradicted = db.prepare(`
    SELECT DISTINCT source_id, target_id
    FROM memory_links
    WHERE relationship = 'contradicts'
  `).all() as { source_id: number; target_id: number }[];

  for (const pair of contradicted) {
    for (const id of [pair.source_id, pair.target_id]) {
      const mem = db.prepare('SELECT salience FROM memories WHERE id = ?').get(id) as any;
      if (mem && mem.salience > 0.3) {
        // Small penalty for unresolved contradictions
        db.prepare('UPDATE memories SET salience = ? WHERE id = ?')
          .run(mem.salience - 0.02, id);
        updated++;
      }
    }
  }

  return updated;
}
```

Call it in `consolidate()` after `updateDecayScores()` (after line 88):

```typescript
// Evolve salience based on structural importance
const salienceUpdated = evolveSalience(db);
```

Also fix `mentionCount` in `salience.ts`. In `analyzeSalienceFactors` (line 68):

```typescript
// Replace: mentionCount: 1
// With actual count:
mentionCount: countMentions(text),
```

Add helper:
```typescript
function countMentions(text: string): number {
  // Count how many salience-relevant keywords appear
  const allKeywords = [
    ...ARCHITECTURE_KEYWORDS, ...ERROR_KEYWORDS,
    ...PREFERENCE_KEYWORDS, ...PATTERN_KEYWORDS
  ];
  let count = 0;
  const lower = text.toLowerCase();
  for (const kw of allKeywords) {
    if (lower.includes(kw)) count++;
  }
  return Math.max(1, count);
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/salience.ts src/memory/consolidate.ts src/__tests__/store.test.ts
git commit -m "feat: dynamic salience evolution via link count, contradictions, and mention count"
```

---

## Task 4: Surface Contradictions to Users

**Problem:** Contradictions are detected and linked but never shown to the user. The `recall` tool doesn't flag contradicting results.

**Files:**
- Modify: `src/memory/store.ts` (searchMemories return value)
- Modify: `src/server.ts` (recall tool response formatting)
- Modify: `src/memory/types.ts` (SearchResult type)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('contradiction surfacing', () => {
  it('should flag contradictions in search results', async () => {
    const mem1 = await addMemory({
      title: 'Use PostgreSQL',
      content: 'We decided to use PostgreSQL for the database',
      category: 'architecture',
      project: 'test-project',
    });
    const mem2 = await addMemory({
      title: 'Use MongoDB',
      content: 'We decided to use MongoDB for the database',
      category: 'architecture',
      project: 'test-project',
    });

    // Create contradiction link
    await createMemoryLink(mem1.id, mem2.id, 'contradicts', 0.8);

    const results = await searchMemories({ query: 'database', project: 'test-project' });
    const pgResult = results.find(r => r.memory.id === mem1.id);
    const mongoResult = results.find(r => r.memory.id === mem2.id);

    // At least one should have contradictions flagged
    const hasContradiction = results.some(r => r.contradictions && r.contradictions.length > 0);
    expect(hasContradiction).toBe(true);
  });
});
```

**Step 2: Run to verify failure**

Run: `npm test -- --grep "contradiction surfacing"`
Expected: FAIL — SearchResult doesn't have a `contradictions` field.

**Step 3: Add contradiction info to search results**

In `types.ts`, extend SearchResult:

```typescript
export interface SearchResult {
  memory: Memory;
  relevanceScore: number;
  contradictions?: { memoryId: number; title: string; score: number }[];
}
```

In `store.ts`, after search scoring, add contradiction lookup for top results:

```typescript
// After scoring, before return (around line 880)
for (const result of scored.slice(0, options.limit || 10)) {
  const contradictions = db.prepare(`
    SELECT ml.strength,
      CASE WHEN ml.source_id = ? THEN ml.target_id ELSE ml.source_id END as other_id
    FROM memory_links ml
    WHERE ml.relationship = 'contradicts'
      AND (ml.source_id = ? OR ml.target_id = ?)
  `).all(result.memory.id, result.memory.id, result.memory.id) as any[];

  if (contradictions.length > 0) {
    result.contradictions = contradictions.map(c => {
      const other = db.prepare('SELECT title FROM memories WHERE id = ?').get(c.other_id) as any;
      return { memoryId: c.other_id, title: other?.title || 'Unknown', score: c.strength };
    });
  }
}
```

In `server.ts`, update the recall tool response to include warnings:

```typescript
// In executeRecall response formatting
for (const result of results) {
  // ... existing formatting ...
  if (result.contradictions?.length) {
    output += `\n  WARNING: Contradicts: ${result.contradictions.map(c => `"${c.title}" (ID ${c.memoryId})`).join(', ')}`;
  }
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/types.ts src/memory/store.ts src/server.ts src/__tests__/store.test.ts
git commit -m "feat: surface contradictions in search results with warnings"
```

---

## Task 5: Enable Memory Enrichment (wire up the dead code)

**Problem:** `enrichMemory()` (store.ts:482-539) is implemented but never called. Memories should accumulate context from searches.

**Files:**
- Modify: `src/memory/store.ts:870-885` (post-search processing)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('memory enrichment', () => {
  it('should enrich a memory when search query adds relevant context', async () => {
    const mem = await addMemory({
      title: 'Auth system',
      content: 'We use JWT tokens for authentication',
      category: 'architecture',
      project: 'test-project',
    });

    // Simulate enrichment call
    const result = await enrichMemory(mem.id, 'Added rate limiting to JWT endpoints', 'search_context');

    expect(result.enriched).toBe(true);
    const updated = await getMemory(mem.id);
    expect(updated.content).toContain('rate limiting');
  });
});
```

**Step 2: Run to verify behavior**

Run: `npm test -- --grep "memory enrichment"`
Expected: Should pass since enrichMemory exists — this test validates the function works.

**Step 3: Wire enrichment into search flow**

In `searchMemories`, after the reinforcement loop, add enrichment for the top result when the query contains new information:

```typescript
// After reinforceFromSearch loop (post-search)
// Enrich top result if query contains context not in the memory
if (scored.length > 0 && options.query && options.query.length > 30) {
  const topResult = scored[0];
  const queryWords = new Set(options.query.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const contentWords = new Set(topResult.memory.content.toLowerCase().split(/\s+/));
  const newWords = [...queryWords].filter(w => !contentWords.has(w));

  // Only enrich if query has significant new content (>30% new words)
  if (newWords.length > queryWords.size * 0.3 && options.query.length > 50) {
    try {
      enrichMemory(topResult.memory.id, options.query, 'search_context');
    } catch { /* enrichment is best-effort */ }
  }
}
```

Also export `enrichMemory` so it's available to tests and tools.

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/store.ts src/__tests__/store.test.ts
git commit -m "feat: wire memory enrichment into search flow"
```

---

## Task 6: Real Consolidation — Merge Related Short-Term Memories

**Problem:** `mergeSimilarMemories` (consolidate.ts:164-212) only deduplicates by exact title + first 100 chars. Real consolidation should merge related STM memories into coherent LTM entries.

**Files:**
- Modify: `src/memory/consolidate.ts:164-212` (mergeSimilarMemories)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('real memory consolidation', () => {
  it('should merge related short-term memories into one long-term memory', async () => {
    await addMemory({
      title: 'JWT token setup',
      content: 'Set up JWT tokens with RS256 signing',
      type: 'short_term',
      category: 'architecture',
      project: 'test-project',
    });
    await addMemory({
      title: 'JWT expiry config',
      content: 'JWT tokens expire after 24 hours, refresh tokens after 7 days',
      type: 'short_term',
      category: 'architecture',
      project: 'test-project',
    });
    await addMemory({
      title: 'JWT middleware',
      content: 'Added JWT verification middleware to all protected routes',
      type: 'short_term',
      category: 'architecture',
      project: 'test-project',
    });

    const merged = await mergeSimilarMemories('test-project', 0.25);
    expect(merged).toBeGreaterThan(0);

    // Check that a consolidated memory exists
    const results = await searchMemories({ query: 'JWT', project: 'test-project', type: 'long_term' });
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Consolidated memory should contain info from all three
    const consolidated = results[0].memory;
    expect(consolidated.content).toContain('RS256');
    expect(consolidated.content).toContain('24 hours');
    expect(consolidated.content).toContain('middleware');
  });
});
```

**Step 2: Run to verify failure**

Run: `npm test -- --grep "real memory consolidation"`
Expected: FAIL — current merge only deduplicates exact matches, won't merge these.

**Step 3: Rewrite mergeSimilarMemories**

```typescript
export function mergeSimilarMemories(
  project?: string,
  similarityThreshold: number = 0.25
): number {
  const db = getDb();
  let merged = 0;

  // Get short-term memories grouped by project and category
  const stmMemories = db.prepare(`
    SELECT * FROM memories
    WHERE type = 'short_term'
    ${project ? 'AND project = ?' : ''}
    ORDER BY category, created_at DESC
  `).all(...(project ? [project] : [])) as Memory[];

  if (stmMemories.length < 2) return 0;

  // Group by category
  const groups = new Map<string, Memory[]>();
  for (const mem of stmMemories) {
    const key = `${mem.project}|${mem.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(mem);
  }

  for (const [, memories] of groups) {
    if (memories.length < 2) continue;

    // Find clusters of related memories using content similarity
    const clusters: Memory[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < memories.length; i++) {
      if (assigned.has(memories[i].id)) continue;

      const cluster: Memory[] = [memories[i]];
      assigned.add(memories[i].id);

      for (let j = i + 1; j < memories.length; j++) {
        if (assigned.has(memories[j].id)) continue;

        const sim = jaccardSimilarity(memories[i].content, memories[j].content);
        const titleSim = jaccardSimilarity(memories[i].title, memories[j].title);
        const combined = sim * 0.6 + titleSim * 0.4;

        if (combined >= similarityThreshold) {
          cluster.push(memories[j]);
          assigned.add(memories[j].id);
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    // Merge each cluster into a single long-term memory
    for (const cluster of clusters) {
      // Pick highest-salience memory as the base
      cluster.sort((a, b) => b.salience - a.salience);
      const base = cluster[0];

      // Merge content: base content + bullet points from others
      const otherContent = cluster.slice(1)
        .map(m => `- ${m.title}: ${m.content}`)
        .join('\n');
      const mergedContent = `${base.content}\n\nConsolidated context:\n${otherContent}`;

      // Merge tags
      const allTags = new Set<string>();
      for (const m of cluster) {
        const tags = typeof m.tags === 'string' ? JSON.parse(m.tags) : (m.tags || []);
        tags.forEach((t: string) => allTags.add(t));
      }

      // Update base memory to long-term with merged content
      db.prepare(`
        UPDATE memories
        SET type = 'long_term',
            content = ?,
            tags = ?,
            salience = ?,
            access_count = ?
        WHERE id = ?
      `).run(
        mergedContent.slice(0, 10000),
        JSON.stringify([...allTags]),
        Math.min(1.0, base.salience + 0.1),
        cluster.reduce((sum, m) => sum + m.access_count, 0),
        base.id
      );

      // Delete the others (they're now part of the base)
      const otherIds = cluster.slice(1).map(m => m.id);
      for (const id of otherIds) {
        db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      }

      merged += otherIds.length;
    }
  }

  return merged;
}
```

Add import:
```typescript
import { jaccardSimilarity } from './similarity.js';
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/consolidate.ts src/__tests__/store.test.ts
git commit -m "feat: real consolidation merges related STM into coherent LTM entries"
```

---

## Task 7: Prune Activation Cache & Increase Activation Weight

**Problem:** `pruneActivationCache()` is never called (cache grows unbounded). Activation weight in search is only 5% — too low to matter.

**Files:**
- Modify: `src/memory/activation.ts:34-37` (constants)
- Modify: `src/memory/activation.ts:171-183` (wire pruning)
- Modify: `src/memory/store.ts` (search scoring weights)
- Test: `src/__tests__/store.test.ts`

**Step 1: Write failing test**

```typescript
describe('activation impact', () => {
  it('should noticeably boost recently-activated memories in search', async () => {
    const mem1 = await addMemory({
      title: 'Database config',
      content: 'PostgreSQL configuration for production',
      category: 'architecture',
      project: 'test-project',
    });
    const mem2 = await addMemory({
      title: 'Database setup',
      content: 'PostgreSQL setup for production environment',
      category: 'architecture',
      project: 'test-project',
    });

    // Activate mem1 but not mem2
    activateMemory(mem1.id);

    const results = await searchMemories({ query: 'PostgreSQL production', project: 'test-project' });

    // mem1 should rank higher due to activation
    const idx1 = results.findIndex(r => r.memory.id === mem1.id);
    const idx2 = results.findIndex(r => r.memory.id === mem2.id);
    expect(idx1).toBeLessThan(idx2);
  });
});
```

**Step 2: Run to verify failure**

Run: `npm test -- --grep "activation impact"`
Expected: May fail if activation boost is too small to change ordering.

**Step 3: Increase activation weight and wire pruning**

In `activation.ts`, update constants:

```typescript
// Was: MAX_ACTIVATION_BOOST: 0.2
const MAX_ACTIVATION_BOOST = 0.3;
```

In `store.ts` search scoring, increase activation's share. Replace the current scoring formula with rebalanced weights:

```typescript
// Rebalanced scoring weights
const relevanceScore =
  ftsScore * 0.25 +           // Was 0.3
  vectorBoost +                // vectorSimilarity * 0.3 (unchanged)
  decayedScore * 0.2 +        // Was 0.25
  priorityScore * 0.05 +      // Was 0.1
  recencyBoost +               // Unchanged
  categoryBoost +              // Unchanged
  linkBoost +                  // Unchanged (max 0.15)
  tagBoost +                   // Unchanged
  activationBoost;             // Now max 0.3 (was 0.2 * 0.05 effective)
```

Wire pruning into consolidation. In `consolidate.ts`, after the main flow:

```typescript
import { pruneActivationCache } from './activation.js';

// At end of consolidate():
pruneActivationCache();
```

Also call prune after every 100th search (in store.ts):

```typescript
let searchCount = 0;

// Inside searchMemories, at the start:
if (++searchCount % 100 === 0) {
  pruneActivationCache();
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/activation.ts src/memory/store.ts src/memory/consolidate.ts src/__tests__/store.test.ts
git commit -m "feat: increase activation weight in search, wire cache pruning"
```

---

## Post-Implementation: Build & Smoke Test

After all 7 tasks:

```bash
npm run build
npm test
node dist/index.js service status
```

Verify manually:
1. `remember` a few related memories
2. `recall` them — check they're linked, no contradictions shown (unless you create conflicting ones)
3. `consolidate` — check STM merged into LTM
4. `memory_stats` — verify counts

---

## Summary of Changes

| Task | What Changes | Key Metric |
|------|-------------|-----------|
| 1. Semantic Linking | Links based on content, not just tags | Links per memory: 1-2 → 3-5 |
| 2. Feedback Loop | Search reinforces salience + creates links | Salience drift: static → evolving |
| 3. Dynamic Salience | Hub bonus, contradiction penalty, real mentionCount | Hub memories become more findable |
| 4. Surface Contradictions | Warnings in search results | User sees conflicts immediately |
| 5. Wire Enrichment | Memories accumulate search context | Content grows organically |
| 6. Real Consolidation | Merge related STM into coherent LTM | Fewer, richer long-term memories |
| 7. Activation Weight | Stronger priming effect, cache maintenance | Recent context matters more |
