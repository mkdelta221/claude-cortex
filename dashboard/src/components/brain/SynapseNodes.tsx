'use client';

/**
 * Synapse Nodes
 * Glowing junction points where neural connections meet
 * Activity level affects glow intensity and pulsing speed
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Jarvis-style golden/orange color palette
const JARVIS_GOLD = '#FFD700';
const JARVIS_ORANGE = '#FF8C00';
const JARVIS_AMBER = '#FFB347';

// Shared geometries to prevent memory leaks (created once, reused by all nodes)
const SYNAPSE_OUTER_GEOMETRY = new THREE.SphereGeometry(1, 8, 8);
const SYNAPSE_INNER_GEOMETRY = new THREE.SphereGeometry(1, 12, 12);
const SYNAPSE_CORE_GEOMETRY = new THREE.SphereGeometry(1, 16, 16);
const SPARK_GEOMETRY = new THREE.SphereGeometry(1, 6, 6);

interface SynapseNodeProps {
  position: [number, number, number];
  activity?: number; // 0-1, affects visual intensity
  color?: string;
  size?: number;
  label?: string;
}

/**
 * Individual synapse junction point
 */
export function SynapseNode({
  position,
  activity = 0.5,
  color,
  size = 0.15,
}: SynapseNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);

  // Determine color based on activity if not specified - Jarvis golden theme
  const synapseColor = useMemo(() => {
    if (color) return color;
    if (activity > 0.7) return JARVIS_GOLD; // High activity - bright gold
    if (activity > 0.4) return JARVIS_AMBER; // Medium activity - warm gold
    return JARVIS_ORANGE; // Low activity - deep orange
  }, [color, activity]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;

    // Pulsing speed based on activity (more active = faster pulse)
    const pulseSpeed = 2 + activity * 4;
    const pulse = Math.sin(time * pulseSpeed) * 0.5 + 0.5;

    // Scale pulsing
    const scale = size * (1 + pulse * 0.3 * activity);
    meshRef.current.scale.setScalar(scale);

    // Helper to safely update material opacity
    const updateOpacity = (mesh: THREE.Mesh | null, opacity: number) => {
      if (!mesh) return;
      const mat = mesh.material;
      if (mat && 'opacity' in mat && typeof mat.opacity === 'number') {
        mat.opacity = opacity;
      }
    };

    // Core opacity
    updateOpacity(meshRef.current, 0.7 + pulse * 0.3);

    // Inner glow
    if (glowRef.current) {
      glowRef.current.scale.setScalar(scale * 2);
      updateOpacity(glowRef.current, (0.3 + pulse * 0.2) * activity);
    }

    // Outer glow (slower pulse)
    if (outerGlowRef.current) {
      const outerPulse = Math.sin(time * pulseSpeed * 0.5) * 0.5 + 0.5;
      outerGlowRef.current.scale.setScalar(scale * 3.5 * (1 + outerPulse * 0.2));
      updateOpacity(outerGlowRef.current, (0.1 + outerPulse * 0.1) * activity);
    }
  });

  // Materials are created per-node since color varies, but geometries are shared
  const outerMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: synapseColor,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
    [synapseColor]
  );

  const innerMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: synapseColor,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
    [synapseColor]
  );

  const coreMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: synapseColor,
      transparent: true,
      opacity: 0.9,
    }),
    [synapseColor]
  );

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      outerMaterial.dispose();
      innerMaterial.dispose();
      coreMaterial.dispose();
    };
  }, [outerMaterial, innerMaterial, coreMaterial]);

  return (
    <group position={position}>
      {/* Outer glow halo - uses shared geometry */}
      <mesh ref={outerGlowRef} geometry={SYNAPSE_OUTER_GEOMETRY} material={outerMaterial} />

      {/* Inner glow - uses shared geometry */}
      <mesh ref={glowRef} geometry={SYNAPSE_INNER_GEOMETRY} material={innerMaterial} />

      {/* Core node - uses shared geometry */}
      <mesh ref={meshRef} geometry={SYNAPSE_CORE_GEOMETRY} material={coreMaterial} />
    </group>
  );
}

/**
 * Action potential burst - triggered when a memory is accessed
 */
interface ActionPotentialProps {
  position: [number, number, number];
  onComplete?: () => void;
  color?: string;
}

export function ActionPotential({
  position,
  onComplete,
  color = JARVIS_GOLD, // Changed from white to Jarvis gold
}: ActionPotentialProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    progressRef.current += delta * 2;

    if (progressRef.current >= 1) {
      onComplete?.();
      return;
    }

    // Expand and fade
    const scale = 0.1 + progressRef.current * 2;
    meshRef.current.scale.setScalar(scale);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
      (1 - progressRef.current) * 0.8;
  });

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
    [color]
  );

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  return (
    <mesh ref={meshRef} position={position} geometry={SYNAPSE_CORE_GEOMETRY} material={material} />
  );
}

/**
 * Synaptic spark - small burst effect
 */
export function SynapticSpark({
  position,
  direction,
  color = JARVIS_AMBER, // Changed from cyan to Jarvis amber
}: {
  position: [number, number, number];
  direction: [number, number, number];
  color?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    progressRef.current += delta * 3;

    if (progressRef.current >= 1) {
      meshRef.current.visible = false;
      return;
    }

    // Move in direction
    meshRef.current.position.set(
      position[0] + direction[0] * progressRef.current * 0.5,
      position[1] + direction[1] * progressRef.current * 0.5,
      position[2] + direction[2] * progressRef.current * 0.5
    );

    // Shrink and fade
    meshRef.current.scale.setScalar(0.1 * (1 - progressRef.current));
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
      (1 - progressRef.current) * 0.9;
  });

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
    }),
    [color]
  );

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  return (
    <mesh ref={meshRef} position={position} geometry={SPARK_GEOMETRY} material={material} />
  );
}

/**
 * Collection of synapse nodes for the brain visualization
 */
interface SynapseNetworkProps {
  nodes?: Array<{
    position: [number, number, number];
    activity: number;
    color?: string;
  }>;
}

type SynapseNodeData = {
  position: [number, number, number];
  activity: number;
  color?: string;
};

export function SynapseNetwork({ nodes }: SynapseNetworkProps) {
  // Default synapse positions throughout the brain
  const defaultNodes = useMemo<SynapseNodeData[]>(
    () => [
      // Frontal region (STM)
      { position: [0.5, 0.3, 2.5], activity: 0.8 },
      { position: [-0.5, 0.2, 2.3], activity: 0.7 },
      { position: [0, 0.5, 2.8], activity: 0.9 },

      // Middle region (Episodic)
      { position: [1, 0.3, 0.5], activity: 0.6 },
      { position: [-1, 0.2, 0.3], activity: 0.5 },
      { position: [0, 0.8, 0], activity: 0.7 },
      { position: [1.5, 0, -0.5], activity: 0.4 },
      { position: [-1.5, 0.1, -0.3], activity: 0.5 },

      // Back region (LTM)
      { position: [0.3, 0.2, -2.5], activity: 0.3 },
      { position: [-0.5, 0.3, -2.3], activity: 0.4 },
      { position: [0, 0.4, -2.8], activity: 0.3 },
      { position: [1, 0.1, -2], activity: 0.2 },
      { position: [-1, 0.2, -2.2], activity: 0.25 },
    ],
    []
  );

  const synapseNodes: SynapseNodeData[] = nodes || defaultNodes;

  return (
    <group name="synapse-network">
      {synapseNodes.map((node, i) => (
        <SynapseNode
          key={i}
          position={node.position}
          activity={node.activity}
          color={node.color}
          size={0.08 + node.activity * 0.04}
        />
      ))}
    </group>
  );
}
