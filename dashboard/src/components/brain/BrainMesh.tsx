'use client';

/**
 * Brain Mesh
 * Procedurally generated brain shape with cortex-like convolutions
 * Uses simplex noise to create organic surface folds (gyri and sulci)
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm3D, ridged3D } from '@/lib/simplex-noise';

interface BrainMeshProps {
  opacity?: number;
  showWireframe?: boolean;
  pulseIntensity?: number;
}

/**
 * Creates a brain-like geometry with cortex folds
 */
function createBrainGeometry(): THREE.BufferGeometry {
  // Start with icosahedron for smooth organic base
  const geo = new THREE.IcosahedronGeometry(3.5, 5);
  const positions = geo.attributes.position.array as Float32Array;
  const colors = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i];
    let y = positions[i + 1];
    let z = positions[i + 2];

    // Normalize to get direction
    const length = Math.sqrt(x * x + y * y + z * z);
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    // Multi-scale noise for cortex folds
    // Large folds (gyri)
    const largeNoise = fbm3D(nx * 2, ny * 2, nz * 2, 3, 2, 0.5) * 0.4;
    // Medium detail
    const mediumNoise = fbm3D(nx * 4, ny * 4, nz * 4, 2, 2, 0.5) * 0.15;
    // Fine sulci (ridged for sharp creases)
    const fineNoise = ridged3D(nx * 6, ny * 6, nz * 6, 2, 2, 0.5) * 0.08;

    const totalNoise = largeNoise + mediumNoise + fineNoise * 0.5;

    // Brain shape modifications:
    // 1. Elongate front-to-back (Z axis) - frontal lobe
    // 2. Slightly flatten top-bottom (Y axis)
    // 3. Hemisphere bulges on sides (X axis)
    const shapeX = 1.2 + Math.abs(nz) * 0.15; // Wider at sides
    const shapeY = 0.85 + Math.abs(nx) * 0.1;  // Slightly flat
    const shapeZ = 1.1 - Math.abs(ny) * 0.1;   // Elongated front-back

    // Central fissure (divide hemispheres)
    const centralFissure = Math.abs(nx) < 0.1 ? -0.15 * (1 - Math.abs(nx) / 0.1) : 0;

    // Temporal lobe bulge
    const temporalBulge = (Math.abs(nx) > 0.5 && nz < 0) ? 0.15 : 0;

    // Apply all modifications
    const radius = length * (1 + totalNoise + centralFissure + temporalBulge);

    positions[i] = nx * radius * shapeX;
    positions[i + 1] = ny * radius * shapeY;
    positions[i + 2] = nz * radius * shapeZ;

    // Color based on region (for visual depth)
    // Front (STM) = orange tint, Middle (Episodic) = purple, Back (LTM) = blue
    const normalizedZ = (nz + 1) / 2; // 0 to 1
    colors[i] = 0.1 + normalizedZ * 0.2;     // R: more red in front
    colors[i + 1] = 0.05 + (1 - normalizedZ) * 0.15; // G: more green in back
    colors[i + 2] = 0.2 + (1 - normalizedZ) * 0.3;   // B: more blue in back
  }

  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return geo;
}

/**
 * Inner core glow geometry (simpler, smoother)
 */
function createCoreGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(2.5, 3);
  return geo;
}

export function BrainMesh({
  opacity = 0.25,
  showWireframe = true,
  pulseIntensity = 0.3,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  // Create geometries once
  const brainGeometry = useMemo(() => createBrainGeometry(), []);
  const coreGeometry = useMemo(() => createCoreGeometry(), []);

  // Memoized materials
  const brainMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a1a3a',
        transparent: true,
        opacity: opacity,
        metalness: 0.3,
        roughness: 0.7,
        emissive: '#0044aa',
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide,
        vertexColors: true,
      }),
    [opacity]
  );

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#00aaff',
        wireframe: true,
        transparent: true,
        opacity: 0.06,
      }),
    []
  );

  const coreMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#4466ff',
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    []
  );

  // Cleanup geometries and materials on unmount to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      brainGeometry.dispose();
      coreGeometry.dispose();
      brainMaterial.dispose();
      wireframeMaterial.dispose();
      coreMaterial.dispose();
    };
  }, [brainGeometry, coreGeometry, brainMaterial, wireframeMaterial, coreMaterial]);

  // Subtle pulsing animation
  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;

    // Gentle breathing
    const breathe = Math.sin(time * 0.5) * 0.015 * pulseIntensity + 1;
    meshRef.current.scale.setScalar(breathe);

    if (wireframeRef.current) {
      wireframeRef.current.scale.setScalar(breathe * 1.002);
    }

    // Core pulsing
    if (coreRef.current) {
      const corePulse = Math.sin(time * 1.5) * 0.1 + 0.9;
      coreRef.current.scale.setScalar(corePulse);
      (coreRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.05 + Math.sin(time * 2) * 0.03;
    }

    // Emissive intensity pulsing
    (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.08 + Math.sin(time * 0.8) * 0.04;
  });

  return (
    <group>
      {/* Inner glowing core */}
      <mesh ref={coreRef} geometry={coreGeometry} material={coreMaterial} />

      {/* Main brain surface */}
      <mesh ref={meshRef} geometry={brainGeometry} material={brainMaterial} />

      {/* Wireframe overlay for digital feel */}
      {showWireframe && (
        <mesh
          ref={wireframeRef}
          geometry={brainGeometry}
          material={wireframeMaterial}
        />
      )}
    </group>
  );
}

/**
 * Hemisphere highlight - shows active region
 */
export function HemisphereHighlight({
  side,
  intensity = 0.5,
}: {
  side: 'left' | 'right';
  intensity?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const position: [number, number, number] = side === 'left' ? [-1.5, 0, 0] : [1.5, 0, 0];

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 0.7;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = intensity * pulse * 0.2;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[2.5, 16, 16]} />
      <meshBasicMaterial
        color={side === 'left' ? '#ff6600' : '#00ff66'}
        transparent
        opacity={intensity * 0.15}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
