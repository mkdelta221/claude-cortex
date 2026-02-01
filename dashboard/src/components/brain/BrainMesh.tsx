'use client';

/**
 * Brain Mesh
 * Ghost wireframe outline of a brain shape for subtle context
 * Uses simplex noise to create organic cortex-like surface folds
 */

import { useMemo, useEffect, useRef } from 'react';
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
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

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

export function BrainMesh({
  opacity = 0.05,
  showWireframe = true,
}: BrainMeshProps) {
  // Use refs to track resources for proper cleanup
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Create geometry once
  const brainGeometry = useMemo(() => {
    const geo = createBrainGeometry();
    geometryRef.current = geo;
    return geo;
  }, []);

  // Ghost wireframe material - very faint gray
  const wireframeMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#333333',
      wireframe: true,
      transparent: true,
      opacity: opacity,
    });
    materialRef.current = mat;
    return mat;
  }, [opacity]);

  // Cleanup on unmount to prevent GPU memory leaks
  // Use refs to ensure we always dispose the actual resources
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
      if (materialRef.current) {
        materialRef.current.dispose();
        materialRef.current = null;
      }
    };
  }, []);

  // Only render wireframe - no solid surface, no core, no animation
  if (!showWireframe) return null;

  return (
    <mesh geometry={brainGeometry} material={wireframeMaterial} />
  );
}

