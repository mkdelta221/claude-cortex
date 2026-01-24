'use client';

/**
 * Brain Regions
 * Volumetric cloud-like regions representing different memory types
 * - Short-term (front/orange): Active working memory
 * - Episodic (middle/purple): Session and event memories
 * - Long-term (back/blue): Consolidated stable memories
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface MemoryRegionProps {
  type: 'short_term' | 'episodic' | 'long_term';
  position: [number, number, number];
  color: string;
  memoryCount?: number;
  label: string;
  showLabel?: boolean;
}

/**
 * Single volumetric memory region
 * Uses multiple overlapping transparent spheres for cloud effect
 */
function MemoryRegion({
  type,
  position,
  color,
  memoryCount = 0,
  label,
  showLabel = true,
}: MemoryRegionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  // Scale based on memory count (more memories = larger region)
  const scale = useMemo(() => {
    const baseScale = 1;
    const countScale = Math.min(memoryCount / 30, 0.5); // Max 50% increase
    return baseScale + countScale;
  }, [memoryCount]);

  // Create multiple sphere layers for volumetric effect
  const layers = useMemo(() => {
    return [
      { radius: 1.8, opacity: 0.03, offset: [0, 0, 0] },
      { radius: 1.5, opacity: 0.04, offset: [0.2, 0.1, 0.1] },
      { radius: 1.2, opacity: 0.05, offset: [-0.1, 0.15, -0.1] },
      { radius: 0.9, opacity: 0.06, offset: [0.1, -0.1, 0.15] },
      { radius: 0.6, opacity: 0.08, offset: [0, 0.05, 0] },
    ];
  }, []);

  // Animation
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime;
    const typeOffset = type === 'short_term' ? 0 : type === 'episodic' ? 1 : 2;

    // Gentle floating motion
    groupRef.current.position.y =
      position[1] + Math.sin(time * 0.3 + typeOffset) * 0.15;

    // Subtle rotation
    groupRef.current.rotation.y = Math.sin(time * 0.2 + typeOffset) * 0.1;

    // Inner core pulsing
    if (innerRef.current) {
      const pulse = Math.sin(time * 1.5 + typeOffset * 2) * 0.15 + 0.85;
      innerRef.current.scale.setScalar(pulse);
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.15 + pulse * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Volumetric cloud layers */}
      {layers.map((layer, i) => (
        <mesh
          key={i}
          position={[
            layer.offset[0] * scale,
            layer.offset[1] * scale,
            layer.offset[2] * scale,
          ]}
          scale={scale}
        >
          <sphereGeometry args={[layer.radius, 24, 24]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={layer.opacity}
            emissive={color}
            emissiveIntensity={0.15}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Bright inner core */}
      <mesh ref={innerRef} scale={scale * 0.4}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>

      {/* Region label */}
      {showLabel && (
        <Html position={[0, 2.2 * scale, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap backdrop-blur-sm"
            style={{
              backgroundColor: `${color}25`,
              color: color,
              border: `1px solid ${color}40`,
              boxShadow: `0 0 20px ${color}30`,
            }}
          >
            {label}
            {memoryCount > 0 && (
              <span className="ml-2 opacity-70">({memoryCount})</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Energy field connecting regions
 */
function EnergyField() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;

    // Slow rotation
    meshRef.current.rotation.y = time * 0.05;
    meshRef.current.rotation.x = Math.sin(time * 0.1) * 0.1;

    // Pulsing opacity
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
      0.02 + Math.sin(time * 0.5) * 0.01;
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[3.5, 0.8, 8, 48]} />
      <meshBasicMaterial
        color="#6366f1"
        transparent
        opacity={0.025}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Orbital ring around the brain
 */
function OrbitalRing({ radius = 4.5, color = '#4488ff' }: { radius?: number; color?: string }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = state.clock.elapsedTime * 0.1;
  });

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.015, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} />
    </mesh>
  );
}

interface BrainRegionsProps {
  shortTermCount?: number;
  episodicCount?: number;
  longTermCount?: number;
  showLabels?: boolean;
}

/**
 * All brain regions combined
 */
export function BrainRegions({
  shortTermCount = 0,
  episodicCount = 0,
  longTermCount = 0,
  showLabels = false,
}: BrainRegionsProps) {
  return (
    <group name="brain-regions">
      {/* Short-term memory region (front) */}
      <MemoryRegion
        type="short_term"
        position={[0, 0, 2.8]}
        color="#F97316"
        memoryCount={shortTermCount}
        label="Short-Term"
        showLabel={showLabels}
      />

      {/* Episodic memory region (middle) */}
      <MemoryRegion
        type="episodic"
        position={[0, 0.3, 0]}
        color="#8B5CF6"
        memoryCount={episodicCount}
        label="Episodic"
        showLabel={showLabels}
      />

      {/* Long-term memory region (back) */}
      <MemoryRegion
        type="long_term"
        position={[0, 0, -2.8]}
        color="#3B82F6"
        memoryCount={longTermCount}
        label="Long-Term"
        showLabel={showLabels}
      />

      {/* Energy field connecting regions */}
      <EnergyField />

      {/* Orbital rings for sci-fi effect */}
      <OrbitalRing radius={4.2} color="#3B82F6" />
      <group rotation={[0, 0, Math.PI / 6]}>
        <OrbitalRing radius={4.5} color="#8B5CF6" />
      </group>
      <group rotation={[0, 0, -Math.PI / 6]}>
        <OrbitalRing radius={4.8} color="#F97316" />
      </group>
    </group>
  );
}
