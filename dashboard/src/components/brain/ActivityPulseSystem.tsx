'use client';

/**
 * Activity Pulse System
 *
 * Creates visual pulses when memory events occur:
 * - memory_created: Green expanding pulse at memory position
 * - memory_accessed: Blue flash at memory position
 * - link_discovered: Cyan line connecting two memories
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Pulse {
  id: number;
  type: 'created' | 'accessed' | 'linked';
  position: [number, number, number];
  targetPosition?: [number, number, number]; // For links
  startTime: number;
  duration: number;
  color: string;
}

interface ActivityPulseSystemProps {
  pulses: Pulse[];
  onPulseComplete: (id: number) => void;
}

// Shared geometry
const PULSE_GEOMETRY = new THREE.RingGeometry(0.1, 0.15, 32);
const SPHERE_GEOMETRY = new THREE.SphereGeometry(0.1, 16, 16);

function CreatedPulse({
  pulse,
  onComplete,
}: {
  pulse: Pulse;
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTimeRef = useRef<number | null>(null);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Initialize start time on first frame
    if (startTimeRef.current === null) {
      startTimeRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startTimeRef.current;
    const progress = elapsed / (pulse.duration / 1000); // Convert ms to seconds

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Expanding ring that fades out
    const scale = 0.5 + progress * 3;
    const opacity = (1 - progress) * 0.8;

    meshRef.current.scale.setScalar(scale);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  return (
    <mesh
      ref={meshRef}
      position={pulse.position}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={PULSE_GEOMETRY}
    >
      <meshBasicMaterial
        color={pulse.color}
        transparent
        opacity={0.8}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function AccessedPulse({
  pulse,
  onComplete,
}: {
  pulse: Pulse;
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTimeRef = useRef<number | null>(null);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Initialize start time on first frame
    if (startTimeRef.current === null) {
      startTimeRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startTimeRef.current;
    const progress = elapsed / (pulse.duration / 1000); // Convert ms to seconds

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Flash that expands slightly then fades
    const flash = Math.sin(progress * Math.PI);
    const scale = 0.8 + flash * 0.6;
    const opacity = flash * 0.9;

    meshRef.current.scale.setScalar(scale);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  return (
    <mesh ref={meshRef} position={pulse.position} geometry={SPHERE_GEOMETRY}>
      <meshBasicMaterial
        color={pulse.color}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </mesh>
  );
}

function LinkedPulse({
  pulse,
  onComplete,
}: {
  pulse: Pulse;
  onComplete: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startTimeRef = useRef<number | null>(null);
  const lineRef = useRef<THREE.Line | null>(null);

  // Create line object once
  const lineObject = useMemo(() => {
    const points = [
      new THREE.Vector3(...pulse.position),
      new THREE.Vector3(...(pulse.targetPosition || pulse.position)),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: pulse.color,
      transparent: true,
      opacity: 0.8,
    });
    return new THREE.Line(geometry, material);
  }, [pulse.position, pulse.targetPosition, pulse.color]);

  useFrame((state) => {
    if (!lineRef.current) {
      // Add line to group on first render
      if (groupRef.current && !groupRef.current.children.length) {
        groupRef.current.add(lineObject);
        lineRef.current = lineObject;
      }
      return;
    }

    // Initialize start time on first frame
    if (startTimeRef.current === null) {
      startTimeRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startTimeRef.current;
    const progress = elapsed / (pulse.duration / 1000); // Convert ms to seconds

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Line that appears then fades
    const flash = Math.sin(progress * Math.PI);
    (lineRef.current.material as THREE.LineBasicMaterial).opacity = flash * 0.8;
  });

  return <group ref={groupRef} />;
}

export function ActivityPulseSystem({ pulses, onPulseComplete }: ActivityPulseSystemProps) {
  return (
    <group name="activity-pulses">
      {pulses.map((pulse) => {
        switch (pulse.type) {
          case 'created':
            return (
              <CreatedPulse
                key={pulse.id}
                pulse={pulse}
                onComplete={() => onPulseComplete(pulse.id)}
              />
            );
          case 'accessed':
            return (
              <AccessedPulse
                key={pulse.id}
                pulse={pulse}
                onComplete={() => onPulseComplete(pulse.id)}
              />
            );
          case 'linked':
            return (
              <LinkedPulse
                key={pulse.id}
                pulse={pulse}
                onComplete={() => onPulseComplete(pulse.id)}
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
}

// Type export for use in parent components
export type { Pulse };
