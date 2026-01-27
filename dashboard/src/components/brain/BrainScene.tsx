'use client';

/**
 * Brain Scene
 * Main 3D visualization of the memory brain
 * Composes all brain visualization components into a cohesive scene
 *
 * Features:
 * - Real-time activity pulses on memory events
 * - Category region labels
 * - Color modes: category, health (decay), age
 * - Timeline filtering
 */

import { Suspense, useMemo, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
// Post-processing disabled for cleaner appearance
// import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { Memory, MemoryLink, MemoryCategory } from '@/types/memory';
import { MemoryNode } from './MemoryNode';
import { MemoryLinks } from './MemoryLinks';
import { BrainMesh } from './BrainMesh';
import { ActivityPulseSystem, Pulse } from './ActivityPulseSystem';
import { TimelineControls } from './TimelineControls';
// Removed for cleaner design: BrainRegions, Stars
import { calculateMemoryPosition } from '@/lib/position-algorithm';
import { useMemoryWebSocket } from '@/lib/websocket';

type ColorMode = 'category' | 'health' | 'age' | 'holographic';

interface BrainSceneProps {
  memories: Memory[];
  links?: MemoryLink[];
  selectedMemory: Memory | null;
  onSelectMemory: (memory: Memory | null) => void;
}

interface BrainContentProps extends BrainSceneProps {
  colorMode: ColorMode;
  pulses: Pulse[];
  onPulseComplete: (id: number) => void;
  memoryCategoryCounts: Record<string, number>;
}

function BrainContent({
  memories = [],
  links = [],
  selectedMemory,
  onSelectMemory,
  colorMode,
  pulses,
  onPulseComplete,
  memoryCategoryCounts,
}: BrainContentProps) {
  // Calculate positions for all memories (deduplicate by ID to prevent React key errors)
  const memoryPositions = useMemo(() => {
    if (!memories || memories.length === 0) return [];
    // Use Map to deduplicate by memory ID
    const uniqueMemories = new Map(memories.map(m => [m.id, m]));
    return Array.from(uniqueMemories.values()).map((memory) => ({
      memory,
      position: calculateMemoryPosition(memory),
    }));
  }, [memories]);

  // Create a map for quick position lookup by memory ID
  const positionMap = useMemo(() => {
    const map = new Map<number, { x: number; y: number; z: number }>();
    memoryPositions.forEach(({ memory, position }) => {
      map.set(memory.id, position);
    });
    return map;
  }, [memoryPositions]);

  return (
    <>
      {/* Simple, even lighting for maximum clarity */}
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight position={[5, 5, 5]} intensity={0.3} color="#ffffff" />

      {/* Ghost brain outline - barely visible context */}
      <BrainMesh opacity={0.05} showWireframe={true} pulseIntensity={0} />

      {/* Neural connections - the main visual feature */}
      <MemoryLinks
        memories={memories}
        links={links}
        memoryPositions={positionMap}
      />

      {/* Memory nodes - clear, colored spheres */}
      {memoryPositions.map(({ memory, position }) => (
        <MemoryNode
          key={memory.id}
          memory={memory}
          position={[position.x, position.y, position.z]}
          onSelect={onSelectMemory}
          isSelected={selectedMemory?.id === memory.id}
          colorMode={colorMode}
        />
      ))}

      {/* Activity pulses for real-time events */}
      <ActivityPulseSystem pulses={pulses} onPulseComplete={onPulseComplete} />

      {/* Camera controls - user controlled, no auto-rotate */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={25}
        autoRotate={false}
        dampingFactor={0.05}
        enableDamping
      />
    </>
  );
}

export function BrainScene({
  memories = [],
  links = [],
  selectedMemory,
  onSelectMemory,
}: BrainSceneProps) {
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [timeRange, setTimeRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const pulseIdRef = { current: 0 };

  // Calculate memory counts by category
  const memoryCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    memories.forEach((m) => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return counts;
  }, [memories]);

  // Filter memories by time range
  const filteredMemories = useMemo(() => {
    if (!timeRange.start && !timeRange.end) return memories;

    return memories.filter((m) => {
      const createdAt = new Date(m.createdAt).getTime();
      if (timeRange.start && createdAt < timeRange.start.getTime()) return false;
      if (timeRange.end && createdAt > timeRange.end.getTime()) return false;
      return true;
    });
  }, [memories, timeRange]);

  // Create position map for pulse positioning
  const positionMap = useMemo(() => {
    const map = new Map<number, { x: number; y: number; z: number }>();
    memories.forEach((memory) => {
      map.set(memory.id, calculateMemoryPosition(memory));
    });
    return map;
  }, [memories]);

  // Create a pulse for memory events
  const createPulse = useCallback(
    (type: Pulse['type'], memoryId: number, targetMemoryId?: number) => {
      const position = positionMap.get(memoryId);
      if (!position) return;

      const targetPosition = targetMemoryId ? positionMap.get(targetMemoryId) : undefined;

      const pulse: Pulse = {
        id: pulseIdRef.current++,
        type,
        position: [position.x, position.y, position.z],
        targetPosition: targetPosition
          ? [targetPosition.x, targetPosition.y, targetPosition.z]
          : undefined,
        startTime: Date.now(),
        duration: type === 'created' ? 2000 : type === 'accessed' ? 1000 : 1500,
        color: type === 'created' ? '#22c55e' : type === 'accessed' ? '#3b82f6' : '#a855f7',
      };

      setPulses((prev) => [...prev, pulse]);
    },
    [positionMap]
  );

  // Handle pulse completion
  const handlePulseComplete = useCallback((id: number) => {
    setPulses((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Listen for WebSocket events to trigger pulses
  useMemoryWebSocket({
    onMessage: (event) => {
      const data = event.data as Record<string, unknown> | undefined;
      switch (event.type) {
        case 'memory_created':
          if (data?.memoryId) createPulse('created', data.memoryId as number);
          break;
        case 'memory_accessed':
          if (data?.memoryId) createPulse('accessed', data.memoryId as number);
          break;
        case 'link_discovered':
          if (data?.sourceId && data?.targetId)
            createPulse('linked', data.sourceId as number, data.targetId as number);
          break;
      }
    },
  });

  return (
    <div className="w-full h-full bg-slate-950">
      <Canvas
        camera={{ position: [0, 2, 12], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
        onClick={() => onSelectMemory(null)}
      >
        <Suspense fallback={null}>
          <BrainContent
            memories={filteredMemories}
            links={links}
            selectedMemory={selectedMemory}
            onSelectMemory={onSelectMemory}
            colorMode={colorMode}
            pulses={pulses}
            onPulseComplete={handlePulseComplete}
            memoryCategoryCounts={memoryCategoryCounts}
          />
        </Suspense>
      </Canvas>

      {/* Simple info overlay */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs backdrop-blur-sm">
        <p className="text-slate-300">
          {filteredMemories.length} memories
        </p>
        <p className="text-slate-500 mt-1">
          Click to select • Drag to rotate
        </p>
      </div>

      {/* Timeline and color controls */}
      <TimelineControls
        memories={memories}
        onTimeRangeChange={setTimeRange}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
      />
    </div>
  );
}
