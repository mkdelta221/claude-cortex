'use client';

/**
 * Relationship Graph Component - Focus Mode
 *
 * Clean visualization: click a memory to see its direct connections.
 * Unselected state shows all nodes dimmed, selected shows focus view.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useMemoryLinks, useMemories } from '@/hooks/useMemories';


interface Node {
  id: number;
  title: string;
  category: string;
  salience: number;
  x: number;
  y: number;
}

interface Edge {
  source: number;
  target: number;
  relationship: string;
  strength: number;
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  related: '#6366f1',
  extends: '#22c55e',
  references: '#3b82f6',
  contradicts: '#ef4444',
};

const CATEGORY_COLORS: Record<string, string> = {
  architecture: '#8b5cf6',
  pattern: '#3b82f6',
  error: '#ef4444',
  learning: '#22c55e',
  preference: '#f59e0b',
  context: '#6366f1',
  todo: '#ec4899',
  note: '#64748b',
  relationship: '#14b8a6',
  custom: '#64748b',
};

export function RelationshipGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [relationshipFilter, setRelationshipFilter] = useState<string | null>(null);

  const { data: links = [] } = useMemoryLinks();
  const { data: memories = [] } = useMemories({ limit: 200 });

  // Build graph data with stable positions
  const { nodes, edges, nodeMap } = useMemo(() => {
    const linkedIds = new Set<number>();
    for (const link of links) {
      linkedIds.add(link.source_id);
      linkedIds.add(link.target_id);
    }

    const linkedMemories = memories.filter((m) => linkedIds.has(m.id));

    // Create stable grid layout
    const cols = Math.ceil(Math.sqrt(linkedMemories.length));
    const cellWidth = 100;
    const cellHeight = 80;

    const nodes: Node[] = linkedMemories.map((m, i) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      salience: m.salience,
      x: (i % cols) * cellWidth + cellWidth / 2 + 50,
      y: Math.floor(i / cols) * cellHeight + cellHeight / 2 + 50,
    }));

    const edges: Edge[] = links.map((l) => ({
      source: l.source_id,
      target: l.target_id,
      relationship: l.relationship,
      strength: l.strength,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return { nodes, edges, nodeMap };
  }, [memories, links]);

  // Filter edges
  const filteredEdges = relationshipFilter
    ? edges.filter((e) => e.relationship === relationshipFilter)
    : edges;

  // Get connections for selected node
  const selectedConnections = useMemo(() => {
    if (!selectedNodeId) return { connectedIds: new Set<number>(), connectedEdges: [] };

    const connectedIds = new Set<number>();
    const connectedEdges: Edge[] = [];

    for (const edge of filteredEdges) {
      if (edge.source === selectedNodeId) {
        connectedIds.add(edge.target);
        connectedEdges.push(edge);
      } else if (edge.target === selectedNodeId) {
        connectedIds.add(edge.source);
        connectedEdges.push(edge);
      }
    }

    return { connectedIds, connectedEdges };
  }, [selectedNodeId, filteredEdges]);

  // Get unique relationship types
  const relationshipTypes = [...new Set(edges.map((e) => e.relationship))];

  // Get selected node details
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    if (nodes.length === 0) return;

    // Calculate layout to fit in canvas
    const padding = 60;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    const cellWidth = (width - padding * 2) / cols;
    const cellHeight = (height - padding * 2) / rows;

    // Update positions to fit canvas
    nodes.forEach((node, i) => {
      node.x = (i % cols) * cellWidth + cellWidth / 2 + padding;
      node.y = Math.floor(i / cols) * cellHeight + cellHeight / 2 + padding;
    });

    const { connectedIds, connectedEdges } = selectedConnections;

    // Draw edges (only for selected node, or all dimmed if none selected)
    if (selectedNodeId) {
      // Draw connected edges prominently
      ctx.lineWidth = 2;
      for (const edge of connectedEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        ctx.strokeStyle = RELATIONSHIP_COLORS[edge.relationship] || '#475569';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Draw relationship label at midpoint
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.font = '10px system-ui';
        ctx.fillStyle = RELATIONSHIP_COLORS[edge.relationship] || '#94a3b8';
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.fillText(edge.relationship, midX, midY - 4);
      }
    } else {
      // Show all edges very dimmed when nothing selected
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15;
      for (const edge of filteredEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        ctx.strokeStyle = RELATIONSHIP_COLORS[edge.relationship] || '#475569';
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Draw nodes
    for (const node of nodes) {
      const isSelected = node.id === selectedNodeId;
      const isConnected = connectedIds.has(node.id);
      const isHovered = node.id === hoveredNodeId;
      const isHighlighted = isSelected || isConnected || !selectedNodeId;

      const baseRadius = 6 + node.salience * 6;
      const radius = isSelected ? baseRadius + 4 : isHovered ? baseRadius + 2 : baseRadius;

      // Determine opacity
      const opacity = isHighlighted ? 1 : 0.2;

      // Draw node
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = CATEGORY_COLORS[node.category] || '#64748b';
      ctx.globalAlpha = opacity;
      ctx.fill();

      // Selection/hover ring
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#f472b6' : '#94a3b8';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // Draw label for highlighted nodes
      if (isHighlighted && (isSelected || isConnected || isHovered || node.salience > 0.5)) {
        ctx.globalAlpha = opacity;
        const label = node.title.length > 20 ? node.title.slice(0, 20) + '...' : node.title;
        ctx.font = isSelected ? 'bold 11px system-ui' : '10px system-ui';
        ctx.textAlign = 'center';

        // Background
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(node.x - textWidth / 2 - 4, node.y + radius + 4, textWidth + 8, 16);

        // Text
        ctx.fillStyle = isSelected ? '#f472b6' : isConnected ? '#e2e8f0' : '#94a3b8';
        ctx.fillText(label, node.x, node.y + radius + 16);
      }
    }

    ctx.globalAlpha = 1;
  }, [nodes, nodeMap, filteredEdges, selectedNodeId, hoveredNodeId, selectedConnections]);

  // Mouse handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getNodeAt = (x: number, y: number): Node | null => {
      for (const node of nodes) {
        const radius = 6 + node.salience * 6 + 4;
        const dx = node.x - x;
        const dy = node.y - y;
        if (dx * dx + dy * dy < radius * radius) {
          return node;
        }
      }
      return null;
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAt(x, y);

      if (node) {
        setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
      } else {
        setSelectedNodeId(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAt(x, y);
      setHoveredNodeId(node?.id || null);
      canvas.style.cursor = node ? 'pointer' : 'default';
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [nodes, selectedNodeId]);

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="p-2 border-b border-slate-700 flex items-center gap-3">
        <span className="text-xs text-slate-400">Filter:</span>
        <button
          onClick={() => setRelationshipFilter(null)}
          className={`px-2 py-0.5 text-xs rounded ${
            relationshipFilter === null
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          All
        </button>
        {relationshipTypes.map((type) => (
          <button
            key={type}
            onClick={() => setRelationshipFilter(type)}
            className={`px-2 py-0.5 text-xs rounded ${
              relationshipFilter === type ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
            style={{
              backgroundColor: relationshipFilter === type ? RELATIONSHIP_COLORS[type] : 'transparent',
            }}
          >
            {type}
          </button>
        ))}

        <div className="flex-1" />

        {/* Instructions */}
        <span className="text-xs text-slate-500">
          {selectedNodeId ? 'Click elsewhere to deselect' : 'Click a node to focus'}
        </span>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs border-l border-slate-700 pl-3">
          {Object.entries(RELATIONSHIP_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
              <span className="text-slate-500">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Selected Node Details */}
        {selectedNode && (
          <div className="absolute top-3 left-3 p-3 bg-slate-800/95 border border-slate-700 rounded-lg max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[selectedNode.category] }}
              />
              <span className="text-white font-medium text-sm">{selectedNode.title}</span>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>Category: {selectedNode.category}</div>
              <div>Salience: {(selectedNode.salience * 100).toFixed(0)}%</div>
              <div>Connections: {selectedConnections.connectedIds.size}</div>
            </div>
            {selectedConnections.connectedEdges.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Connected to:</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {selectedConnections.connectedEdges.map((edge, i) => {
                    const otherId = edge.source === selectedNodeId ? edge.target : edge.source;
                    const other = nodeMap.get(otherId);
                    return (
                      <div key={i} className="text-xs flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: RELATIONSHIP_COLORS[edge.relationship] }}
                        />
                        <span className="text-slate-400">{edge.relationship}:</span>
                        <span className="text-slate-300 truncate">{other?.title || 'Unknown'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            No relationships to display
          </div>
        )}
      </div>
    </div>
  );
}
