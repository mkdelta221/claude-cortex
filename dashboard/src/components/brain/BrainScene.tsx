'use client';

/**
 * Brain Scene
 * Main 3D visualization of the memory brain
 * Composes all brain visualization components into a cohesive scene
 */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Memory, MemoryLink } from '@/types/memory';
import { MemoryNode } from './MemoryNode';
import { MemoryLinks } from './MemoryLinks';
import { BrainMesh } from './BrainMesh';
import { BrainRegions } from './BrainRegions';
import { NeuralPathways } from './NeuralPathways';
import { SynapseNetwork } from './SynapseNodes';
import { ElectronFlow, SpiralFlow } from './ElectronFlow';
import { calculateMemoryPosition } from '@/lib/position-algorithm';

interface BrainSceneProps {
  memories: Memory[];
  links?: MemoryLink[];
  selectedMemory: Memory | null;
  onSelectMemory: (memory: Memory | null) => void;
}

function BrainContent({
  memories = [],
  links = [],
  selectedMemory,
  onSelectMemory,
}: BrainSceneProps) {
  // Calculate positions for all memories (guard against null/undefined)
  const memoryPositions = useMemo(() => {
    if (!memories || memories.length === 0) return [];
    return memories.map((memory) => ({
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

  // Count memories by type for region sizing
  const memoryCounts = useMemo(() => {
    const counts = { shortTerm: 0, episodic: 0, longTerm: 0 };
    memories.forEach((m) => {
      if (m.type === 'short_term') counts.shortTerm++;
      else if (m.type === 'episodic') counts.episodic++;
      else if (m.type === 'long_term') counts.longTerm++;
    });
    return counts;
  }, [memories]);

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={0.15} />
      <pointLight position={[10, 10, 10]} intensity={0.4} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.25} color="#4488ff" />
      <pointLight position={[0, 5, 0]} intensity={0.2} color="#aa66ff" />

      {/* Procedural brain mesh with cortex */}
      <BrainMesh opacity={0.2} showWireframe={true} pulseIntensity={0.4} />

      {/* Volumetric brain regions */}
      <BrainRegions
        shortTermCount={memoryCounts.shortTerm}
        episodicCount={memoryCounts.episodic}
        longTermCount={memoryCounts.longTerm}
        showLabels={false}
      />

      {/* Neural pathway network */}
      <NeuralPathways />

      {/* Synapse junction nodes */}
      <SynapseNetwork />

      {/* Electron flow particles */}
      <ElectronFlow count={120} speed={0.6} size={0.035} />

      {/* Decorative spiral flow */}
      <SpiralFlow count={40} radius={4.5} speed={0.2} color="#4466ff" />

      {/* Memory links (connections between related memories) */}
      <MemoryLinks
        memories={memories}
        links={links}
        memoryPositions={positionMap}
      />

      {/* Memory nodes */}
      {memoryPositions.map(({ memory, position }) => (
        <MemoryNode
          key={memory.id}
          memory={memory}
          position={[position.x, position.y, position.z]}
          onSelect={onSelectMemory}
          isSelected={selectedMemory?.id === memory.id}
        />
      ))}

      {/* Camera controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={25}
        autoRotate={!selectedMemory}
        autoRotateSpeed={0.2}
        dampingFactor={0.05}
        enableDamping
      />

      {/* Background stars */}
      <Stars
        radius={80}
        depth={60}
        count={1500}
        factor={3}
        saturation={0.1}
        fade
        speed={0.3}
      />

      {/* Post-processing effects */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          intensity={1.0}
          radius={0.9}
        />
        <Vignette
          darkness={0.4}
          offset={0.3}
        />
      </EffectComposer>
    </>
  );
}

export function BrainScene({
  memories = [],
  links = [],
  selectedMemory,
  onSelectMemory,
}: BrainSceneProps) {
  return (
    <div className="w-full h-full bg-slate-950">
      <Canvas
        camera={{ position: [0, 2, 12], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
        onClick={() => onSelectMemory(null)}
      >
        <Suspense fallback={null}>
          <BrainContent
            memories={memories}
            links={links}
            selectedMemory={selectedMemory}
            onSelectMemory={onSelectMemory}
          />
        </Suspense>
      </Canvas>

      {/* Legend overlay */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs backdrop-blur-sm">
        <h4 className="font-semibold text-white mb-2">Memory Regions</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-slate-300">Short-Term (Front)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-slate-300">Episodic (Middle)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-slate-300">Long-Term (Back)</span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-700">
          <p className="text-slate-400">
            {memories.length} memories • Click to select
          </p>
        </div>
      </div>

      {/* Neural activity indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-900/80 border border-slate-700 rounded-full px-3 py-1.5 backdrop-blur-sm">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-xs text-cyan-400 font-medium">Neural Activity</span>
      </div>
    </div>
  );
}
