'use client';

/**
 * Memory Node
 * Individual memory rendered as a glowing neuron in 3D space
 *
 * Performance optimizations:
 * - Reduced polygon counts on spheres (8 segments for glow, 12 for main)
 * - Memoized geometries and materials to prevent recreation
 * - Lazy-loaded HTML tooltips (only on hover)
 * - Selection ring uses fewer segments
 */

import { useRef, useState, useMemo, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Memory } from '@/types/memory';
import { getCategoryColor } from '@/lib/category-colors';
import { calculateDecayFactor } from '@/lib/position-algorithm';
import { getAgeColor } from './TimelineControls';

// Holographic color palette (for holographic color mode)
const JARVIS_GOLD = '#FFD700';
const JARVIS_AMBER = '#FFB347';
const JARVIS_ORANGE = '#FF8C00';

interface MemoryNodeProps {
  memory: Memory;
  position: [number, number, number];
  onSelect: (memory: Memory) => void;
  isSelected: boolean;
  colorMode?: 'category' | 'health' | 'age' | 'holographic'; // category = by type, health = decay heat map, age = time-based, holographic = Jarvis-style golden
}

/**
 * Format memory age for display
 */
function formatAge(createdAt: string | Date): string {
  const age = Date.now() - new Date(createdAt).getTime();
  const hours = age / (60 * 60 * 1000);

  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  if (hours < 24 * 7) return `${Math.round(hours / 24)}d ago`;
  if (hours < 24 * 30) return `${Math.round(hours / (24 * 7))}w ago`;
  return `${Math.round(hours / (24 * 30))}mo ago`;
}

/**
 * Calculate holographic color based on salience - Jarvis-style golden
 * High salience = bright gold, low salience = deep orange
 */
function getHolographicColor(salience: number): string {
  if (salience > 0.7) return JARVIS_GOLD; // High salience - bright gold
  if (salience > 0.4) return JARVIS_AMBER; // Medium salience - warm gold
  return JARVIS_ORANGE; // Low salience - deep orange
}

/**
 * Calculate health color based on salience and decay
 * Green (healthy) → Yellow (moderate) → Red (at risk)
 */
function getHealthColor(salience: number, decayFactor: number): string {
  const health = salience * decayFactor;

  if (health > 0.6) {
    // Green - healthy
    return '#22c55e';
  } else if (health > 0.35) {
    // Yellow - moderate
    const t = (health - 0.35) / 0.25; // 0 to 1 within yellow range
    // Interpolate from orange to yellow
    const r = Math.round(245 - t * 11); // 245 to 234
    const g = Math.round(158 + t * 21); // 158 to 179
    return `rgb(${r}, ${g}, 66)`;
  } else {
    // Red/Orange - at risk
    const t = health / 0.35; // 0 to 1 within red range
    const r = Math.round(239); // red
    const g = Math.round(68 + t * 90); // 68 to 158
    return `rgb(${r}, ${g}, 68)`;
  }
}

// Shared geometries (created once, reused by all nodes)
const NODE_GEOMETRY = new THREE.SphereGeometry(1, 16, 16);
const RING_GEOMETRY = new THREE.RingGeometry(1, 1.15, 24);

function MemoryNodeInner({
  memory,
  position,
  onSelect,
  isSelected,
  colorMode = 'category',
}: MemoryNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();

  // Calculate visual properties (memoized)
  const decayFactor = useMemo(() => calculateDecayFactor(memory), [memory]);
  const categoryColor = useMemo(() => getCategoryColor(memory.category), [memory.category]);
  const healthColor = useMemo(
    () => getHealthColor(memory.salience, decayFactor),
    [memory.salience, decayFactor]
  );
  const ageColor = useMemo(() => getAgeColor(memory.createdAt), [memory.createdAt]);
  const holographicColor = useMemo(() => getHolographicColor(memory.salience), [memory.salience]);

  // Select color based on mode
  const baseColor = useMemo(() => {
    switch (colorMode) {
      case 'health': return healthColor;
      case 'age': return ageColor;
      case 'holographic': return holographicColor;
      default: return categoryColor;
    }
  }, [colorMode, healthColor, ageColor, holographicColor, categoryColor]);

  // Node size based on salience (0.2 to 0.4) - larger for better visibility
  const size = useMemo(() => 0.2 + memory.salience * 0.2, [memory.salience]);

  // Solid node material - no transparency for clarity
  const nodeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.3,
        metalness: 0.2,
        roughness: 0.5,
      }),
    [baseColor]
  );

  // Subtle animation - increase emissive on hover
  useFrame(() => {
    if (!meshRef.current) return;

    // Update emissive intensity on hover for highlight effect
    (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = hovered ? 0.8 : 0.3;
  });

  return (
    <group position={position}>
      {/* Main node - solid colored sphere */}
      <mesh
        ref={meshRef}
        geometry={NODE_GEOMETRY}
        material={nodeMaterial}
        scale={size}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(memory);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      />

      {/* Selection ring - only rendered when selected */}
      {isSelected && (
        <mesh geometry={RING_GEOMETRY} rotation={[Math.PI / 2, 0, 0]} scale={size + 0.15}>
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover tooltip - lazy loaded only on hover */}
      {hovered && !isSelected && (
        <Html
          distanceFactor={8}
          style={{
            pointerEvents: 'none',
            transform: 'translate(-50%, -120%)',
          }}
        >
          <div className="bg-slate-900/95 border border-slate-700 px-3 py-2 rounded-lg shadow-xl backdrop-blur-sm whitespace-nowrap">
            <div className="text-white font-medium text-sm">{memory.title}</div>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span
                className="px-1.5 py-0.5 rounded"
                style={{ backgroundColor: categoryColor + '30', color: categoryColor }}
              >
                {memory.category}
              </span>
              <span className="text-slate-400">
                {(memory.salience * 100).toFixed(0)}%
              </span>
              {colorMode === 'health' && (
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: healthColor + '30', color: healthColor }}
                >
                  {memory.salience * decayFactor > 0.6 ? 'Healthy' : memory.salience * decayFactor > 0.35 ? 'Moderate' : 'At Risk'}
                </span>
              )}
              {colorMode === 'age' && (
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: ageColor + '30', color: ageColor }}
                >
                  {formatAge(memory.createdAt)}
                </span>
              )}
              {colorMode === 'holographic' && (
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: holographicColor + '30', color: holographicColor }}
                >
                  {memory.salience > 0.7 ? 'High' : memory.salience > 0.4 ? 'Medium' : 'Low'}
                </span>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Memoize the component to prevent re-renders when other nodes change
export const MemoryNode = memo(MemoryNodeInner, (prev, next) => {
  return (
    prev.memory.id === next.memory.id &&
    prev.memory.salience === next.memory.salience &&
    prev.memory.category === next.memory.category &&
    prev.isSelected === next.isSelected &&
    prev.colorMode === next.colorMode &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2]
  );
});
