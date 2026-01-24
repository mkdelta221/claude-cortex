'use client';

/**
 * Electron Flow
 * GPU-efficient particle system showing electrical signals flowing through the brain
 * Uses buffer attributes for performant animation of many particles
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ElectronFlowProps {
  count?: number;
  speed?: number;
  color?: string;
  size?: number;
}

/**
 * Main electron flow through the brain
 * Particles flow from front (STM) to back (LTM) with some randomness
 */
export function ElectronFlow({
  count = 150,
  speed = 0.5,
  color = '#00ffff',
  size = 0.04,
}: ElectronFlowProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Initialize particle positions, velocities, and properties
  const { positions, velocities, phases, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Random position within brain volume
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
      const r = 1.5 + Math.random() * 2;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = -3 + Math.random() * 6;

      // Velocity - mostly flowing backward (STM to LTM direction)
      velocities[i * 3] = (Math.random() - 0.5) * 0.3;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      velocities[i * 3 + 2] = -0.5 - Math.random() * 0.5; // Backward flow

      // Random phase for varied animation
      phases[i] = Math.random() * Math.PI * 2;

      // Color gradient based on Z position (front=orange, middle=purple, back=blue)
      const normalizedZ = (positions[i * 3 + 2] + 3) / 6;
      if (normalizedZ > 0.6) {
        // Front - orange
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.5;
        colors[i * 3 + 2] = 0.2;
      } else if (normalizedZ > 0.4) {
        // Middle - purple
        colors[i * 3] = 0.7;
        colors[i * 3 + 1] = 0.3;
        colors[i * 3 + 2] = 1.0;
      } else {
        // Back - cyan/blue
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.8;
        colors[i * 3 + 2] = 1.0;
      }
    }

    return { positions, velocities, phases, colors };
  }, [count]);

  // Animate particles
  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const positionAttr = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const colorAttr = pointsRef.current.geometry.attributes
      .color as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      // Update position based on velocity
      positions[i * 3] += velocities[i * 3] * delta * speed;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta * speed;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta * speed;

      // Add some wave motion
      const phase = phases[i];
      positions[i * 3] += Math.sin(state.clock.elapsedTime * 2 + phase) * 0.002;
      positions[i * 3 + 1] += Math.cos(state.clock.elapsedTime * 1.5 + phase) * 0.002;

      // Wrap around when reaching back of brain
      if (positions[i * 3 + 2] < -3.5) {
        positions[i * 3 + 2] = 3.5;
        // Randomize X and Y on wrap
        const theta = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * 2;
        positions[i * 3] = r * Math.cos(theta);
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      }

      // Update color based on new Z position
      const normalizedZ = (positions[i * 3 + 2] + 3.5) / 7;
      if (normalizedZ > 0.6) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.5 + normalizedZ * 0.3;
        colors[i * 3 + 2] = 0.2;
      } else if (normalizedZ > 0.35) {
        colors[i * 3] = 0.6 + normalizedZ * 0.2;
        colors[i * 3 + 1] = 0.3;
        colors[i * 3 + 2] = 0.8 + normalizedZ * 0.2;
      } else {
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.6 + (1 - normalizedZ) * 0.3;
        colors[i * 3 + 2] = 1.0;
      }
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/**
 * Radial burst of electrons (for action potential visualization)
 */
interface ElectronBurstProps {
  origin: [number, number, number];
  count?: number;
  duration?: number;
  color?: string;
  onComplete?: () => void;
}

export function ElectronBurst({
  origin,
  count = 20,
  duration = 1,
  color = '#ffffff',
  onComplete,
}: ElectronBurstProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const progressRef = useRef(0);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Start at origin
      positions[i * 3] = origin[0];
      positions[i * 3 + 1] = origin[1];
      positions[i * 3 + 2] = origin[2];

      // Random outward velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 1 + Math.random() * 2;

      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.cos(phi) * speed;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
    }

    return { positions, velocities };
  }, [origin, count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    progressRef.current += delta / duration;

    if (progressRef.current >= 1) {
      onComplete?.();
      return;
    }

    const positionAttr = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      positions[i * 3] += velocities[i * 3] * delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }

    positionAttr.needsUpdate = true;

    // Fade out
    (pointsRef.current.material as THREE.PointsMaterial).opacity =
      0.9 * (1 - progressRef.current);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color={color}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Spiral flow around the brain (decorative)
 */
export function SpiralFlow({
  count = 50,
  radius = 4,
  speed = 0.3,
  color = '#4488ff',
}: {
  count?: number;
  radius?: number;
  speed?: number;
  color?: string;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      phases[i] = t * Math.PI * 4; // Multiple loops

      positions[i * 3] = Math.cos(phases[i]) * radius;
      positions[i * 3 + 1] = (t - 0.5) * 6;
      positions[i * 3 + 2] = Math.sin(phases[i]) * radius;
    }

    return { positions, phases };
  }, [count, radius]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const positionAttr = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const time = state.clock.elapsedTime * speed;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const phase = phases[i] + time;
      const r = radius + Math.sin(phase * 2) * 0.3;

      positions[i * 3] = Math.cos(phase) * r;
      positions[i * 3 + 1] = (t - 0.5) * 6 + Math.sin(time + t * Math.PI * 2) * 0.2;
      positions[i * 3 + 2] = Math.sin(phase) * r;
    }

    positionAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={color}
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
