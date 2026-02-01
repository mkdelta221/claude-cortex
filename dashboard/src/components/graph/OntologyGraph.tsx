'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search, X } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Entity type color map
const ENTITY_COLORS: Record<string, string> = {
  tool: '#22d3ee',
  person: '#34d399',
  concept: '#f59e0b',
  language: '#a78bfa',
  file: '#64748b',
  service: '#f472b6',
  pattern: '#fb923c',
};

const DEFAULT_COLOR = '#94a3b8';

// Predicate colors for edges
const PREDICATE_COLORS: Record<string, string> = {
  uses: '#22d3ee',
  implements: '#34d399',
  depends_on: '#f59e0b',
  related_to: '#94a3b8',
  part_of: '#a78bfa',
  created_by: '#f472b6',
  extends: '#fb923c',
};

const DEFAULT_EDGE_COLOR = '#475569';

interface Entity {
  id: number;
  name: string;
  type: string;
  memoryCount: number;
  aliases: string[];
}

interface Triple {
  id: number;
  subject_id: number;
  object_id: number;
  predicate: string;
  subject_name: string;
  subject_type: string;
  object_name: string;
  object_type: string;
}

interface GraphNode {
  id: number;
  name: string;
  entityType: string;
  memoryCount: number;
  val: number;
}

interface GraphLink {
  source: number;
  target: number;
  predicate: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface LinkedMemory {
  id: number;
  title: string;
  type: string;
  category: string;
  salience: number;
  created_at: string;
}

interface EntityDetail {
  entity: Entity;
  triples: Triple[];
  memories: LinkedMemory[];
}

const ALL_TYPES = ['tool', 'person', 'concept', 'language', 'file', 'service', 'pattern'];

export default function OntologyGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [entities, setEntities] = useState<Entity[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(ALL_TYPES));

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDimensions({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch data
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [entRes, triRes] = await Promise.all([
          fetch(`${API_BASE}/api/graph/entities?limit=500`).then(r => r.json()),
          fetch(`${API_BASE}/api/graph/triples?limit=500`).then(r => r.json()),
        ]);
        if (cancelled) return;
        setEntities(entRes.entities || []);
        setTriples(triRes.triples || []);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Filter entities
  const filteredEntities = useMemo(() => {
    return entities.filter(e => {
      if (!activeTypes.has(e.type)) return false;
      if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [entities, activeTypes, searchQuery]);

  // Build graph data
  const graphData: GraphData = useMemo(() => {
    const nodeIds = new Set(filteredEntities.map(e => e.id));
    const maxCount = Math.max(1, ...filteredEntities.map(e => e.memoryCount));

    return {
      nodes: filteredEntities.map(e => ({
        id: e.id,
        name: e.name,
        entityType: e.type,
        memoryCount: e.memoryCount,
        val: 2 + (e.memoryCount / maxCount) * 10,
      })),
      links: triples
        .filter(t => nodeIds.has(t.subject_id) && nodeIds.has(t.object_id))
        .map(t => ({
          source: t.subject_id,
          target: t.object_id,
          predicate: t.predicate,
        })),
    };
  }, [filteredEntities, triples]);

  // Computed stats
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entities) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return ALL_TYPES
      .map(t => ({ type: t, count: counts[t] || 0 }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [entities]);

  const topEntities = useMemo(() => {
    return [...entities]
      .sort((a, b) => b.memoryCount - a.memoryCount)
      .slice(0, 15);
  }, [entities]);

  const predicateBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of triples) {
      counts[t.predicate] = (counts[t.predicate] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([predicate, count]) => ({ predicate, count }))
      .sort((a, b) => b.count - a.count);
  }, [triples]);

  const graphStats = useMemo(() => {
    const typesPresent = new Set(entities.map(e => e.type)).size;
    const connectionCounts: Record<number, number> = {};
    for (const t of triples) {
      connectionCounts[t.subject_id] = (connectionCounts[t.subject_id] || 0) + 1;
      connectionCounts[t.object_id] = (connectionCounts[t.object_id] || 0) + 1;
    }
    const connValues = Object.values(connectionCounts);
    const avgConnections = connValues.length > 0
      ? (connValues.reduce((a, b) => a + b, 0) / connValues.length).toFixed(1)
      : '0';
    let mostConnected: Entity | null = null;
    let maxConn = 0;
    for (const [idStr, count] of Object.entries(connectionCounts)) {
      if (count > maxConn) {
        maxConn = count;
        mostConnected = entities.find(e => e.id === Number(idStr)) || null;
      }
    }
    return { typesPresent, avgConnections, mostConnected, maxConn };
  }, [entities, triples]);

  // Fetch entity detail (triples + memories)
  const fetchEntityDetail = useCallback((entity: Entity) => {
    Promise.all([
      fetch(`${API_BASE}/api/graph/entities/${entity.id}/triples`).then(r => r.json()),
      fetch(`${API_BASE}/api/graph/entities/${entity.id}/memories`).then(r => r.json()),
    ])
      .then(([triData, memData]) => {
        setSelectedEntity({
          entity,
          triples: triData.triples || [],
          memories: memData.memories || [],
        });
      })
      .catch(() => {});
  }, []);

  // Click node -> fetch detail
  const handleNodeClick = useCallback((node: GraphNode) => {
    const entity = entities.find(e => e.id === node.id);
    if (entity) fetchEntityDetail(entity);
  }, [entities, fetchEntityDetail]);

  const handleEntityClick = useCallback((entity: Entity) => {
    fetchEntityDetail(entity);
  }, [fetchEntityDetail]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Canvas rendering
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = (node as unknown as { x: number }).x;
      const y = (node as unknown as { y: number }).y;
      if (x == null || y == null) return;

      const radius = Math.max(3, node.val);
      const color = ENTITY_COLORS[node.entityType] || DEFAULT_COLOR;
      const isSelected = selectedEntity?.entity.id === node.id;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      // Label when zoomed
      if (globalScale > 3) {
        const maxChars = 30;
        const label = node.name.length > maxChars ? node.name.slice(0, maxChars) + '...' : node.name;
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const textWidth = ctx.measureText(label).width;
        const textY = y + radius + 3;
        const padding = 2;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.beginPath();
        ctx.roundRect(
          x - textWidth / 2 - padding,
          textY - padding,
          textWidth + padding * 2,
          fontSize + padding * 2,
          3,
        );
        ctx.fill();

        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(label, x, textY);
      }
    },
    [selectedEntity],
  );

  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      const source = link.source as unknown as { x: number; y: number };
      const target = link.target as unknown as { x: number; y: number };
      if (!source?.x || !target?.x) return;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = PREDICATE_COLORS[link.predicate] || DEFAULT_EDGE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
    [],
  );

  const linkLabel = useCallback((link: GraphLink) => link.predicate, []);

  const nodeLabel = useCallback(
    (node: GraphNode) =>
      `${node.name}\nType: ${node.entityType}\nMemories: ${node.memoryCount}`,
    [],
  );

  // Recent entities for bottom panel (excluding files for readability)
  const recentEntities = useMemo(() => {
    return [...entities]
      .filter(e => e.type !== 'file')
      .sort((a, b) => b.memoryCount - a.memoryCount)
      .slice(0, 30);
  }, [entities]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading ontology graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-red-400">Failed to load ontology: {error}</div>
      </div>
    );
  }

  const maxTypeCount = Math.max(1, ...typeBreakdown.map(t => t.count));

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/50 shrink-0">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter entities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 text-sm bg-slate-800 border border-slate-700 rounded text-white placeholder:text-slate-500 w-48 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-1">
          {ALL_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                activeTypes.has(type)
                  ? 'border-transparent text-white'
                  : 'border-slate-600 text-slate-500 bg-transparent'
              }`}
              style={activeTypes.has(type) ? { backgroundColor: ENTITY_COLORS[type] + '40', color: ENTITY_COLORS[type] } : {}}
            >
              {type}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 ml-auto">
          {filteredEntities.length} entities, {graphData.links.length} triples
        </span>
      </div>

      {/* Main content: graph + sidebar */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Force graph */}
        <div ref={containerRef} style={{ flex: 3, minHeight: 0, minWidth: 0, position: 'relative' }}>
          {dimensions.width > 0 && (
            <ForceGraph2D
              ref={graphRef as never}
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              backgroundColor="rgba(0,0,0,0)"
              nodeCanvasObject={nodeCanvasObject as never}
              nodeLabel={nodeLabel as never}
              onNodeClick={handleNodeClick as never}
              linkCanvasObject={linkCanvasObject as never}
              linkLabel={linkLabel as never}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={0.9}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              warmupTicks={100}
              cooldownTicks={200}
            />
          )}
        </div>

        {/* Right panel: detail or stats */}
        <div className="border-l border-slate-800 bg-slate-900/30 overflow-y-auto" style={{ flex: 2, minWidth: 240, maxWidth: 400 }}>
          {selectedEntity ? (
            /* Entity detail */
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white truncate">{selectedEntity.entity.name}</h3>
                <button onClick={() => setSelectedEntity(null)} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: (ENTITY_COLORS[selectedEntity.entity.type] || DEFAULT_COLOR) + '30', color: ENTITY_COLORS[selectedEntity.entity.type] || DEFAULT_COLOR }}
                >
                  {selectedEntity.entity.type}
                </span>
                <span className="text-xs text-slate-500">{selectedEntity.entity.memoryCount} memories</span>
              </div>

              {selectedEntity.entity.aliases.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-slate-400 mb-1">Aliases</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEntity.entity.aliases.map((a, i) => (
                      <span key={i} className="text-xs bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-400 mb-2">Relationships ({selectedEntity.triples.length})</div>
              <div className="space-y-2 mb-4">
                {selectedEntity.triples.map(t => (
                  <div key={t.id} className="text-xs bg-slate-800/50 rounded p-2">
                    <span className="text-cyan-400">{t.subject_name}</span>
                    <span className="text-slate-500 mx-1">{t.predicate}</span>
                    <span className="text-amber-400">{t.object_name}</span>
                  </div>
                ))}
                {selectedEntity.triples.length === 0 && (
                  <div className="text-xs text-slate-600">No relationships found</div>
                )}
              </div>

              <div className="text-xs text-slate-400 mb-2">Linked Memories ({selectedEntity.memories.length})</div>
              <div className="space-y-1.5">
                {selectedEntity.memories.map(m => (
                  <div key={m.id} className="text-xs bg-slate-800/50 rounded p-2">
                    <div className="text-slate-200 mb-1">{m.title}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{m.category}</span>
                      <span className="text-slate-600">{m.type.replace('_', '-')}</span>
                      <span className="text-slate-600 ml-auto">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {selectedEntity.memories.length === 0 && (
                  <div className="text-xs text-slate-600">No linked memories</div>
                )}
              </div>
            </div>
          ) : (
            /* Stats panels */
            <div className="p-4 space-y-6">
              {/* Graph Stats */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Overview</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/50 rounded p-2.5">
                    <div className="text-lg font-bold text-white">{entities.length}</div>
                    <div className="text-xs text-slate-500">Entities</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2.5">
                    <div className="text-lg font-bold text-white">{triples.length}</div>
                    <div className="text-xs text-slate-500">Triples</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2.5">
                    <div className="text-lg font-bold text-white">{graphStats.typesPresent}</div>
                    <div className="text-xs text-slate-500">Types</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2.5">
                    <div className="text-lg font-bold text-white">{graphStats.avgConnections}</div>
                    <div className="text-xs text-slate-500">Avg connections</div>
                  </div>
                </div>
                {graphStats.mostConnected && (
                  <div className="mt-2 text-xs text-slate-500">
                    Most connected: <span className="text-white">{graphStats.mostConnected.name}</span> ({graphStats.maxConn})
                  </div>
                )}
              </div>

              {/* Entity Type Breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Entity Types</h3>
                <div className="space-y-1.5">
                  {typeBreakdown.map(({ type, count }) => (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className="w-full flex items-center gap-2 group"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ENTITY_COLORS[type] || DEFAULT_COLOR, opacity: activeTypes.has(type) ? 1 : 0.3 }}
                      />
                      <span className={`text-xs flex-1 text-left ${activeTypes.has(type) ? 'text-slate-300' : 'text-slate-600'}`}>
                        {type}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(count / maxTypeCount) * 100}%`,
                            backgroundColor: ENTITY_COLORS[type] || DEFAULT_COLOR,
                            opacity: activeTypes.has(type) ? 0.7 : 0.2,
                          }}
                        />
                      </div>
                      <span className={`text-xs tabular-nums w-6 text-right ${activeTypes.has(type) ? 'text-slate-400' : 'text-slate-600'}`}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Predicate Breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Relationships</h3>
                {predicateBreakdown.length > 0 ? (
                  <div className="space-y-1.5">
                    {predicateBreakdown.map(({ predicate, count }) => (
                      <div key={predicate} className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PREDICATE_COLORS[predicate] || DEFAULT_EDGE_COLOR }}
                        />
                        <span className="text-xs text-slate-300 flex-1">{predicate}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-600">No relationships extracted yet</div>
                )}
              </div>

              {/* Top Entities */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Entities</h3>
                <div className="space-y-1">
                  {topEntities.map(entity => (
                    <button
                      key={entity.id}
                      onClick={() => handleEntityClick(entity)}
                      className="w-full flex items-center gap-2 py-1 px-1.5 rounded hover:bg-slate-800/50 transition-colors group"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ENTITY_COLORS[entity.type] || DEFAULT_COLOR }}
                      />
                      <span className="text-xs text-slate-300 flex-1 text-left truncate group-hover:text-white">
                        {entity.name}
                      </span>
                      <span className="text-xs text-slate-600 tabular-nums shrink-0">
                        {entity.memoryCount}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom panel: entity tags */}
      <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          <span className="text-xs text-slate-500 shrink-0">Known:</span>
          {recentEntities.map(entity => (
            <button
              key={entity.id}
              onClick={() => handleEntityClick(entity)}
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors hover:bg-slate-800"
              style={{ color: ENTITY_COLORS[entity.type] || DEFAULT_COLOR }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: ENTITY_COLORS[entity.type] || DEFAULT_COLOR }}
              />
              {entity.name}
              <span className="text-slate-600">{entity.memoryCount}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
