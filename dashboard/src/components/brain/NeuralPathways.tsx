'use client';

/**
 * Neural Pathways
 * Visualizes the main axon tracts and dendrite networks in the brain
 * - Major pathways: Glowing tubes connecting brain regions
 * - Dendrite network: Fine branching connections
 * - Electron flow along pathways
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

// Major pathway definitions
const MAJOR_PATHWAYS = [
  // Central axis: STM → Episodic → LTM
  {
    id: 'central-forward',
    points: [[0, 0, 3.5], [0, 0.5, 1.5], [0, 0.3, 0]],
    color: '#ff8800',
    intensity: 1.0,
    label: 'STM → Episodic',
  },
  {
    id: 'central-back',
    points: [[0, 0.3, 0], [0, 0.5, -1.5], [0, 0, -3.5]],
    color: '#8844ff',
    intensity: 0.9,
    label: 'Episodic → LTM',
  },
  // Left hemisphere tract
  {
    id: 'left-tract',
    points: [[-2, 0, 2.5], [-2.5, 0.3, 0], [-2, 0, -2.5]],
    color: '#00ff88',
    intensity: 0.7,
    label: 'Left Hemisphere',
  },
  // Right hemisphere tract
  {
    id: 'right-tract',
    points: [[2, 0, 2.5], [2.5, 0.3, 0], [2, 0, -2.5]],
    color: '#00ff88',
    intensity: 0.7,
    label: 'Right Hemisphere',
  },
  // Corpus callosum (cross-hemisphere)
  {
    id: 'corpus-callosum',
    points: [[-2.5, 0.2, 0], [0, 0.8, 0], [2.5, 0.2, 0]],
    color: '#ff00ff',
    intensity: 0.8,
    label: 'Cross-Hemisphere',
  },
  // Diagonal connections
  {
    id: 'left-frontal',
    points: [[-1.5, 0.5, 2.5], [-2, 0.3, 0.5]],
    color: '#ffaa00',
    intensity: 0.5,
    label: 'Left Frontal',
  },
  {
    id: 'right-frontal',
    points: [[1.5, 0.5, 2.5], [2, 0.3, 0.5]],
    color: '#ffaa00',
    intensity: 0.5,
    label: 'Right Frontal',
  },
  {
    id: 'left-occipital',
    points: [[-1.5, 0.3, -2.5], [-2, 0.2, -0.5]],
    color: '#4488ff',
    intensity: 0.5,
    label: 'Left Occipital',
  },
  {
    id: 'right-occipital',
    points: [[1.5, 0.3, -2.5], [2, 0.2, -0.5]],
    color: '#4488ff',
    intensity: 0.5,
    label: 'Right Occipital',
  },
];

interface PathwayProps {
  points: number[][];
  color: string;
  intensity: number;
  electronCount?: number;
}

/**
 * Electron particle traveling along a pathway
 */
function PathwayElectron({
  curve,
  color,
  speed,
  delay,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  speed: number;
  delay: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(delay);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    progressRef.current += delta * speed * 0.3;
    if (progressRef.current > 1) {
      progressRef.current = 0;
    }

    const point = curve.getPoint(progressRef.current);
    meshRef.current.position.copy(point);

    // Fade at endpoints
    const fadeIn = Math.min(progressRef.current * 5, 1);
    const fadeOut = Math.min((1 - progressRef.current) * 5, 1);
    const opacity = fadeIn * fadeOut;

    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.95;

    if (glowRef.current) {
      glowRef.current.position.copy(point);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.4;
    }
  });

  return (
    <>
      {/* Electron core */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/**
 * Single major pathway with tube geometry and electrons
 */
function MajorPathway({ points, color, intensity, electronCount = 3 }: PathwayProps) {
  const tubeRef = useRef<THREE.Mesh>(null);

  // Create smooth curve through points
  const { curve, tubeGeometry } = useMemo(() => {
    const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(vectors);
    const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.08, 8, false);
    return { curve, tubeGeometry };
  }, [points]);

  // Pulsing glow
  useFrame((state) => {
    if (!tubeRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.2 + 0.8;
    (tubeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      intensity * pulse * 0.6;
  });

  // Generate electron delays
  const electrons = useMemo(
    () =>
      Array.from({ length: electronCount }, (_, i) => ({
        delay: i / electronCount,
        speed: 0.8 + Math.random() * 0.4,
      })),
    [electronCount]
  );

  return (
    <group>
      {/* Tube pathway */}
      <mesh ref={tubeRef} geometry={tubeGeometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity * 0.5}
          transparent
          opacity={0.35}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* Electrons along pathway */}
      {electrons.map((e, i) => (
        <PathwayElectron
          key={i}
          curve={curve}
          color={color}
          speed={e.speed}
          delay={e.delay}
        />
      ))}
    </group>
  );
}

/**
 * Helper to convert spherical to cartesian coordinates
 */
function sphericalToCartesian(
  r: number,
  theta: number,
  phi: number
): [number, number, number] {
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Dendrite network - fine branching connections
 */
function DendriteNetwork({ count = 60 }: { count?: number }) {
  const dendrites = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6; // Avoid poles
      const r = 2.2 + Math.random() * 1.3;

      const start = sphericalToCartesian(r, theta, phi);
      const end = sphericalToCartesian(
        r + 0.3 + Math.random() * 0.5,
        theta + (Math.random() - 0.5) * 0.4,
        phi + (Math.random() - 0.5) * 0.3
      );

      // Color based on position (depth)
      const normalizedZ = (start[2] + 3.5) / 7;
      const color = normalizedZ > 0.6
        ? '#ff8844' // Front - orange
        : normalizedZ > 0.4
        ? '#aa66ff' // Middle - purple
        : '#4488ff'; // Back - blue

      return { start, end, color, opacity: 0.15 + Math.random() * 0.15 };
    });
  }, [count]);

  return (
    <group>
      {dendrites.map((d, i) => (
        <Line
          key={i}
          points={[d.start, d.end]}
          color={d.color}
          lineWidth={0.8}
          transparent
          opacity={d.opacity}
        />
      ))}
    </group>
  );
}

/**
 * Junction nodes where pathways meet
 */
function PathwayJunction({
  position,
  color,
  size = 0.15,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 0.7;
    meshRef.current.scale.setScalar(size * (1 + pulse * 0.2));
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.9;

    if (glowRef.current) {
      glowRef.current.scale.setScalar(size * 2.5 * (1 + pulse * 0.3));
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.3;
    }
  });

  return (
    <group position={position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// Junction positions where pathways meet
const JUNCTIONS = [
  { position: [0, 0.5, 1.5] as [number, number, number], color: '#ff8800' },
  { position: [0, 0.3, 0] as [number, number, number], color: '#aa44ff' },
  { position: [0, 0.5, -1.5] as [number, number, number], color: '#4488ff' },
  { position: [-2.5, 0.3, 0] as [number, number, number], color: '#00ff88' },
  { position: [2.5, 0.3, 0] as [number, number, number], color: '#00ff88' },
  { position: [0, 0.8, 0] as [number, number, number], color: '#ff00ff' },
];

/**
 * Main neural pathways component
 */
export function NeuralPathways() {
  return (
    <group name="neural-pathways">
      {/* Major axon tracts */}
      {MAJOR_PATHWAYS.map((pathway) => (
        <MajorPathway
          key={pathway.id}
          points={pathway.points}
          color={pathway.color}
          intensity={pathway.intensity}
          electronCount={pathway.intensity > 0.7 ? 4 : 2}
        />
      ))}

      {/* Junction nodes */}
      {JUNCTIONS.map((junction, i) => (
        <PathwayJunction
          key={i}
          position={junction.position}
          color={junction.color}
          size={0.12}
        />
      ))}

      {/* Fine dendrite network */}
      <DendriteNetwork count={80} />
    </group>
  );
}

/**
 * Dynamic pathway that connects two memory nodes
 */
export function MemoryConnection({
  startPos,
  endPos,
  strength = 0.5,
  relationship,
}: {
  startPos: { x: number; y: number; z: number };
  endPos: { x: number; y: number; z: number };
  strength: number;
  relationship: string;
}) {
  const COLORS: Record<string, string> = {
    references: '#00d4ff',
    extends: '#00ff88',
    contradicts: '#ff6b6b',
    related: '#b388ff',
  };

  const color = COLORS[relationship] || COLORS.related;

  const { curve, points } = useMemo(() => {
    const start = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    const end = new THREE.Vector3(endPos.x, endPos.y, endPos.z);

    // Create organic curve
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    const direction = new THREE.Vector3().subVectors(end, start);
    const perpendicular = new THREE.Vector3(
      -direction.y,
      direction.x,
      direction.z * 0.3
    ).normalize();

    const curveAmount = direction.length() * 0.2 * strength;
    mid.add(perpendicular.multiplyScalar(curveAmount));

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    return { curve, points: curve.getPoints(24) };
  }, [startPos, endPos, strength]);

  const electronCount = strength > 0.7 ? 3 : strength > 0.4 ? 2 : 1;

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={1 + strength * 2}
        transparent
        opacity={0.4 + strength * 0.4}
      />
      {Array.from({ length: electronCount }).map((_, i) => (
        <PathwayElectron
          key={i}
          curve={curve}
          color={color}
          speed={0.8 + strength * 0.5}
          delay={i / electronCount}
        />
      ))}
    </group>
  );
}
