'use client';

/**
 * Holographic Grid
 * Geodesic wireframe sphere surrounding the brain
 * Creates the iconic Jarvis-style holographic grid effect
 *
 * Features:
 * - IcosahedronGeometry with detail level 2 for geodesic look
 * - EdgesGeometry for clean wireframe rendering
 * - Subtle pulsing animation (opacity oscillation)
 * - Scan line effect (bright band moving vertically through the grid)
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HolographicGridProps {
  /** Radius of the geodesic sphere (default: 6) */
  radius?: number;
  /** Base color of the grid (default: #FFB347 - warm gold) */
  color?: string;
  /** Base opacity of the grid (default: 0.08) */
  opacity?: number;
  /** Enable pulsing animation (default: true) */
  enablePulse?: boolean;
  /** Enable scan line effect (default: true) */
  enableScanLine?: boolean;
  /** Speed of the scan line (default: 1) */
  scanLineSpeed?: number;
  /** Visibility toggle */
  visible?: boolean;
}

/**
 * Custom shader material for the holographic grid with scan line effect
 */
function createGridShaderMaterial(color: THREE.Color, baseOpacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uBaseOpacity: { value: baseOpacity },
      uPulseOpacity: { value: 0 },
      uScanLineY: { value: 0 },
      uScanLineWidth: { value: 0.5 },
      uScanLineIntensity: { value: 0.3 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPosition;

      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uBaseOpacity;
      uniform float uPulseOpacity;
      uniform float uScanLineY;
      uniform float uScanLineWidth;
      uniform float uScanLineIntensity;
      uniform float uTime;

      varying vec3 vPosition;

      void main() {
        // Base opacity with pulse
        float opacity = uBaseOpacity + uPulseOpacity;

        // Scan line effect - bright band at current Y position
        float scanLineDist = abs(vPosition.y - uScanLineY);
        float scanLineEffect = smoothstep(uScanLineWidth, 0.0, scanLineDist);

        // Add scan line brightness
        float finalOpacity = opacity + scanLineEffect * uScanLineIntensity;

        // Slight color shift for scan line (more white/bright)
        vec3 finalColor = mix(uColor, vec3(1.0, 0.95, 0.8), scanLineEffect * 0.5);

        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function HolographicGrid({
  radius = 6,
  color = '#FFB347',
  opacity = 0.08,
  enablePulse = true,
  enableScanLine = true,
  scanLineSpeed = 1,
  visible = true,
}: HolographicGridProps) {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Create the geodesic geometry and edges
  const { geometry, edgesGeometry } = useMemo(() => {
    // IcosahedronGeometry with detail level 2 creates a nice geodesic sphere
    const icosahedron = new THREE.IcosahedronGeometry(radius, 2);
    // EdgesGeometry extracts the edges for wireframe rendering
    const edges = new THREE.EdgesGeometry(icosahedron);

    return { geometry: icosahedron, edgesGeometry: edges };
  }, [radius]);

  // Create shader material
  const material = useMemo(() => {
    const colorObj = new THREE.Color(color);
    return createGridShaderMaterial(colorObj, opacity);
  }, [color, opacity]);

  // Sync materialRef with material (cannot update ref during render)
  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
      material.dispose();
    };
  }, [geometry, edgesGeometry, material]);

  // Animation loop
  useFrame((state) => {
    if (!materialRef.current || !visible) return;

    const time = state.clock.elapsedTime;
    const uniforms = materialRef.current.uniforms;

    // Update time uniform
    uniforms.uTime.value = time;

    // Subtle pulsing animation - opacity varies slightly
    if (enablePulse) {
      // Slow breathing effect with slight random flicker
      const breathe = Math.sin(time * 0.8) * 0.015;
      const flicker = Math.random() > 0.97 ? 0.02 : 0;
      uniforms.uPulseOpacity.value = breathe + flicker;
    } else {
      uniforms.uPulseOpacity.value = 0;
    }

    // Scan line effect - bright band moving vertically
    if (enableScanLine) {
      // Scan line moves from bottom (-radius) to top (+radius) and wraps
      const scanCycle = (time * scanLineSpeed * 0.3) % 1;
      // Smooth ease in/out for the scan position
      const eased = scanCycle < 0.5
        ? 2 * scanCycle * scanCycle
        : 1 - Math.pow(-2 * scanCycle + 2, 2) / 2;
      const scanY = (eased * 2 - 1) * radius;
      uniforms.uScanLineY.value = scanY;
    }
  });

  if (!visible) return null;

  return (
    <lineSegments ref={lineSegmentsRef} geometry={edgesGeometry} material={material} />
  );
}

/**
 * Alternative simpler version using LineBasicMaterial (no scan line effect)
 * Use this if you don't need the scan line or want better performance
 */
export function HolographicGridSimple({
  radius = 6,
  color = '#FFB347',
  opacity = 0.08,
  enablePulse = true,
  visible = true,
}: Omit<HolographicGridProps, 'enableScanLine' | 'scanLineSpeed'>) {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);

  // Create the geodesic geometry and edges
  const { geometry, edgesGeometry } = useMemo(() => {
    const icosahedron = new THREE.IcosahedronGeometry(radius, 2);
    const edges = new THREE.EdgesGeometry(icosahedron);
    return { geometry: icosahedron, edgesGeometry: edges };
  }, [radius]);

  // Create line material
  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [color, opacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
      material.dispose();
    };
  }, [geometry, edgesGeometry, material]);

  // Pulsing animation
  useFrame((state) => {
    if (!lineSegmentsRef.current || !visible || !enablePulse) return;

    const time = state.clock.elapsedTime;
    const mat = lineSegmentsRef.current.material as THREE.LineBasicMaterial;

    // Subtle breathing effect
    const breathe = Math.sin(time * 0.8) * 0.015;
    const flicker = Math.random() > 0.97 ? 0.02 : 0;
    mat.opacity = opacity + breathe + flicker;
  });

  if (!visible) return null;

  return (
    <lineSegments ref={lineSegmentsRef} geometry={edgesGeometry} material={material} />
  );
}

export default HolographicGrid;
