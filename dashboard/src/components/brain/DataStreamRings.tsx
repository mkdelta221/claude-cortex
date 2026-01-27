'use client';

/**
 * Data Stream Rings
 * Creates orbital rings around the brain with data particles flowing along them
 * Part of the Jarvis holographic aesthetic - particles flow around ring circumferences
 * Uses BufferGeometry with Float32Array for GPU efficiency
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RingConfig {
  radius: number;
  tiltX: number;
  tiltZ: number;
  particleCount: number;
  speed: number;
  colorIndex: number; // 0 = gold, 1 = warm gold, 2 = deep orange
}

// Ring configurations with different radii and tilts for visual variety
const RING_CONFIGS: RingConfig[] = [
  { radius: 4.0, tiltX: 0.3, tiltZ: 0.1, particleCount: 40, speed: 0.8, colorIndex: 0 },
  { radius: 4.5, tiltX: -0.2, tiltZ: 0.4, particleCount: 45, speed: 0.6, colorIndex: 1 },
  { radius: 5.0, tiltX: 0.5, tiltZ: -0.2, particleCount: 50, speed: 0.7, colorIndex: 2 },
  { radius: 5.5, tiltX: -0.4, tiltZ: -0.3, particleCount: 35, speed: 0.9, colorIndex: 0 },
  { radius: 6.0, tiltX: 0.1, tiltZ: 0.5, particleCount: 30, speed: 0.5, colorIndex: 1 },
];

// Golden color palette matching the Jarvis aesthetic
const COLORS = [
  { r: 1.0, g: 0.843, b: 0.0 },   // #FFD700 - Bright gold
  { r: 1.0, g: 0.702, b: 0.278 }, // #FFB347 - Warm gold
  { r: 1.0, g: 0.549, b: 0.0 },   // #FF8C00 - Deep orange
];

interface DataStreamRingProps {
  config: RingConfig;
}

/**
 * Single orbital ring with flowing particles
 */
function DataStreamRing({ config }: DataStreamRingProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Initialize particle positions and phases along the ring circumference
  const { positions, phases, colors } = useMemo(() => {
    const { radius, particleCount, colorIndex } = config;
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    const baseColor = COLORS[colorIndex];

    for (let i = 0; i < particleCount; i++) {
      // Distribute particles evenly around the ring with some randomness
      const baseAngle = (i / particleCount) * Math.PI * 2;
      const angleOffset = (Math.random() - 0.5) * 0.2; // Small random offset
      const angle = baseAngle + angleOffset;

      phases[i] = angle;

      // Position on ring circumference (XZ plane, will be tilted by group rotation)
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.1; // Slight Y variation
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Color with slight variation for visual interest
      const colorVariation = 0.9 + Math.random() * 0.2;
      colors[i * 3] = baseColor.r * colorVariation;
      colors[i * 3 + 1] = baseColor.g * colorVariation;
      colors[i * 3 + 2] = baseColor.b * colorVariation;
    }

    return { positions, phases, colors };
  }, [config]);

  // Animate particles flowing around the ring
  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const { radius, particleCount, speed } = config;
    const positionAttr = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < particleCount; i++) {
      // Update phase (angle) to create flow around the ring
      phases[i] += delta * speed;

      // Wrap angle
      if (phases[i] > Math.PI * 2) {
        phases[i] -= Math.PI * 2;
      }

      const angle = phases[i];

      // Add subtle wave motion to the radius for organic feel
      const radiusWave = radius + Math.sin(time * 2 + angle * 3) * 0.05;

      // Update position on ring circumference
      positions[i * 3] = Math.cos(angle) * radiusWave;
      positions[i * 3 + 1] = Math.sin(time * 1.5 + angle) * 0.08; // Gentle vertical oscillation
      positions[i * 3 + 2] = Math.sin(angle) * radiusWave;
    }

    positionAttr.needsUpdate = true;
  });

  return (
    <group ref={groupRef} rotation={[config.tiltX, 0, config.tiltZ]}>
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
          size={0.06}
          vertexColors
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

interface DataStreamRingsProps {
  visible?: boolean;
}

/**
 * All orbital data stream rings around the brain
 */
export function DataStreamRings({ visible = true }: DataStreamRingsProps) {
  if (!visible) return null;

  return (
    <group>
      {RING_CONFIGS.map((config, index) => (
        <DataStreamRing key={index} config={config} />
      ))}
    </group>
  );
}

export default DataStreamRings;
