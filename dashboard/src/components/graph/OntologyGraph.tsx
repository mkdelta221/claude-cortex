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

interface EntityDetail {
  entity: Entity;
  triples: Triple[];
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
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API_BASE}/api/graph/entities?limit=500`).then(r => r.json()),
      fetch(`${API_BASE}/api/graph/triples?limit=500`).then(r => r.json()),
    ])
      .then(([entRes, triRes]) => {
        if (cancelled) return;
        setEntities(entRes.entities || []);
        setTriples(triRes.triples || []);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

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

  // Click node -> fetch detail
  const handleNodeClick = useCallback((node: GraphNode) => {
    fetch(`${API_BASE}/api/graph/entities/${node.id}/triples`)
      .then(r => r.json())
      .then(data => {
        const entity = entities.find(e => e.id === node.id);
        if (entity) {
          setSelectedEntity({ entity, triples: data.triples || [] });
        }
      })
      .catch(() => {});
  }, [entities]);

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

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* Graph area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Controls bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/50">
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

        {/* Force graph */}
        <div ref={containerRef} className="flex-1 min-h-0">
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
      </div>

      {/* Detail sidebar */}
      {selectedEntity && (
        <div className="w-72 border-l border-slate-800 bg-slate-900/50 overflow-y-auto">
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
            <div className="space-y-2">
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
          </div>
        </div>
      )}
    </div>
  );
}
