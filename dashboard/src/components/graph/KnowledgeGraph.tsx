'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Memory, MemoryLink } from '@/types/memory';
import { getCategoryColor } from '@/lib/category-colors';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
  id: number;
  name: string;
  category: Memory['category'];
  type: Memory['type'];
  salience: number;
  decayedScore: number;
  val: number;
}

interface GraphLink {
  source: number;
  target: number;
  strength: number;
  relationship: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface KnowledgeGraphProps {
  memories: Memory[];
  links: MemoryLink[];
  selectedMemory: Memory | null;
  onSelectMemory: (m: Memory | null) => void;
}

export default function KnowledgeGraph({
  memories,
  links,
  selectedMemory,
  onSelectMemory,
}: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData: GraphData = useMemo(() => {
    const nodeIds = new Set(memories.map((m) => m.id));
    return {
      nodes: memories.map((m) => ({
        id: m.id,
        name: m.title,
        category: m.category,
        type: m.type,
        salience: m.salience,
        decayedScore: m.decayedScore ?? m.salience,
        val: m.salience * 10,
      })),
      links: links
        .filter((l) => nodeIds.has(l.source_id) && nodeIds.has(l.target_id))
        .map((l) => ({
          source: l.source_id,
          target: l.target_id,
          strength: l.strength,
          relationship: l.relationship,
        })),
    };
  }, [memories, links]);

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = (node as unknown as { x: number }).x;
      const y = (node as unknown as { y: number }).y;
      if (x == null || y == null) return;

      const radius = Math.max(3, node.salience * 8);
      const color = getCategoryColor(node.category);
      const opacity = Math.max(0.2, node.decayedScore);
      const isSelected = selectedMemory?.id === node.id;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
      ctx.fill();

      // Border style based on type
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeStyle = isSelected ? '#ffffff' : color;
      if (node.type === 'short_term') {
        ctx.setLineDash([3, 3]);
      } else if (node.type === 'episodic') {
        ctx.setLineDash([1, 2]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label when zoomed in enough
      if (globalScale > 1.5) {
        const maxChars = 40;
        const label = node.name.length > maxChars ? node.name.slice(0, maxChars) + '…' : node.name;
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const textWidth = ctx.measureText(label).width;
        const textY = y + radius + 3;
        const padding = 2;

        // Dark background pill behind text
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

        // White text with full opacity
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(label, x, textY);
      }
    },
    [selectedMemory],
  );

  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      const source = link.source as unknown as { x: number; y: number };
      const target = link.target as unknown as { x: number; y: number };
      if (!source?.x || !target?.x) return;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = link.strength * 3;
      ctx.stroke();
    },
    [],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const memory = memories.find((m) => m.id === node.id) ?? null;
      onSelectMemory(memory);
    },
    [memories, onSelectMemory],
  );

  const nodeLabel = useCallback(
    (node: GraphNode) =>
      `${node.name}\nCategory: ${node.category}\nSalience: ${node.salience.toFixed(2)}`,
    [],
  );

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {dimensions.width > 0 && (
        <ForceGraph2D
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={nodeCanvasObject as never}
          nodeLabel={nodeLabel as never}
          onNodeClick={handleNodeClick as never}
          linkCanvasObject={linkCanvasObject as never}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          warmupTicks={100}
          cooldownTicks={200}
        />
      )}
    </div>
  );
}
