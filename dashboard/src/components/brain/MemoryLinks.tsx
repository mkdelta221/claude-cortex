'use client';

/**
 * Memory Links - Neural Synapse Visualization
 * Renders organic, neuron-like connections between related memories
 * with flowing electrical signals and synapse endpoints
 */

import { useMemo, useState, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, CatmullRomLine } from '@react-three/drei';
import * as THREE from 'three';
import { Memory, MemoryLink } from '@/types/memory';

interface MemoryLinksProps {
  memories: Memory[];
  links: MemoryLink[];
  memoryPositions: Map<number, { x: number; y: number; z: number }>;
  onLinkClick?: (link: MemoryLink) => void;
}

// Relationship colors - neural/synaptic colors
const RELATIONSHIP_STYLES: Record<string, { color: string; label: string }> = {
  references: { color: '#00d4ff', label: 'References' },  // Cyan - information flow
  extends: { color: '#00ff88', label: 'Extends' },        // Green - growth
  contradicts: { color: '#ff6b6b', label: 'Contradicts' }, // Red - conflict
  related: { color: '#b388ff', label: 'Related' },        // Purple - association
};

// Electrical signal that travels along the axon
function NeuralSignal({
  curve,
  color,
  speed = 1,
  delay = 0,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  speed?: number;
  delay?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(delay);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    progressRef.current += delta * speed * 0.3;
    if (progressRef.current > 1) {
      progressRef.current = 0;
    }

    // Get position along curve
    const point = curve.getPoint(progressRef.current);
    meshRef.current.position.copy(point);

    // Fade based on position (bright in middle, fade at ends)
    const fadeIn = Math.min(progressRef.current * 4, 1);
    const fadeOut = Math.min((1 - progressRef.current) * 4, 1);
    const opacity = fadeIn * fadeOut * 0.9;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;

    // Trail effect
    if (trailRef.current) {
      const trailT = Math.max(0, progressRef.current - 0.05);
      const trailPoint = curve.getPoint(trailT);
      trailRef.current.position.copy(trailPoint);
      (trailRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.4;
    }
  });

  return (
    <>
      {/* Main signal */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      {/* Trail */}
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </>
  );
}

// Synapse endpoint - glowing bulb where connections meet neurons
function SynapseEndpoint({
  position,
  color,
  isSource,
}: {
  position: THREE.Vector3;
  color: string;
  isSource: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Pulsing glow
    const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 0.7;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8;

    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + pulse * 0.3);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.3;
    }
  });

  return (
    <group position={position}>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* Core synapse */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// Single neural connection (axon) with organic curve
function NeuralConnection({
  link,
  sourcePos,
  targetPos,
  isHovered,
  onHover,
  onUnhover,
}: {
  link: MemoryLink;
  sourcePos: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  isHovered: boolean;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const style = RELATIONSHIP_STYLES[link.relationship] || RELATIONSHIP_STYLES.related;

  // Create organic curved path (like an axon)
  const { curve, points } = useMemo(() => {
    const start = new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z);
    const end = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

    // Calculate control points for organic curve
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    // Add perpendicular offset for curve (organic look)
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, direction.z * 0.5).normalize();
    const curveAmount = length * 0.15 * (link.strength + 0.5);

    // Create control points
    const cp1 = new THREE.Vector3().lerpVectors(start, mid, 0.33);
    cp1.add(perpendicular.clone().multiplyScalar(curveAmount));

    const cp2 = new THREE.Vector3().lerpVectors(start, mid, 0.66);
    cp2.add(perpendicular.clone().multiplyScalar(curveAmount * 0.5));

    const cp3 = new THREE.Vector3().lerpVectors(mid, end, 0.33);
    cp3.add(perpendicular.clone().multiplyScalar(-curveAmount * 0.5));

    const cp4 = new THREE.Vector3().lerpVectors(mid, end, 0.66);
    cp4.add(perpendicular.clone().multiplyScalar(-curveAmount));

    const curvePoints = [start, cp1, cp2, mid, cp3, cp4, end];
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const points = curve.getPoints(32);

    return { curve, points };
  }, [sourcePos, targetPos, link.strength]);

  const lineWidth = isHovered ? 3 : 1.5 + link.strength;

  return (
    <group>
      {/* Synapse endpoints */}
      <SynapseEndpoint
        position={new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z)}
        color={style.color}
        isSource={true}
      />
      <SynapseEndpoint
        position={new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)}
        color={style.color}
        isSource={false}
      />

      {/* Axon line (organic curve) */}
      <CatmullRomLine
        points={points}
        color={style.color}
        lineWidth={lineWidth}
        transparent
        opacity={isHovered ? 1 : 0.6 + link.strength * 0.3}
      />

      {/* Electrical signals traveling along axon */}
      <NeuralSignal curve={curve} color={style.color} speed={1 + link.strength} delay={0} />
      {link.strength > 0.5 && (
        <NeuralSignal curve={curve} color={style.color} speed={1 + link.strength} delay={0.5} />
      )}
      {link.strength > 0.7 && (
        <NeuralSignal curve={curve} color={style.color} speed={1.5 + link.strength} delay={0.25} />
      )}

      {/* Invisible hit area for hover */}
      <mesh
        position={[
          (sourcePos.x + targetPos.x) / 2,
          (sourcePos.y + targetPos.y) / 2,
          (sourcePos.z + targetPos.z) / 2,
        ]}
        onPointerEnter={onHover}
        onPointerLeave={onUnhover}
      >
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Hover tooltip */}
      {isHovered && (
        <Html
          position={[
            (sourcePos.x + targetPos.x) / 2,
            (sourcePos.y + targetPos.y) / 2 + 0.5,
            (sourcePos.z + targetPos.z) / 2,
          ]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-3 py-2 rounded-lg shadow-xl text-xs whitespace-nowrap backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: `2px solid ${style.color}`,
              color: 'white',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: style.color }}
              />
              <span className="font-semibold" style={{ color: style.color }}>
                {style.label}
              </span>
            </div>
            <div className="text-slate-300 text-[10px] space-y-0.5">
              <div className="truncate max-w-[180px]">
                {link.source_title || `Memory #${link.source_id}`}
              </div>
              <div className="text-slate-500">↓</div>
              <div className="truncate max-w-[180px]">
                {link.target_title || `Memory #${link.target_id}`}
              </div>
              <div className="mt-1 pt-1 border-t border-slate-700">
                Strength: <span style={{ color: style.color }}>{(link.strength * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export function MemoryLinks({ memories, links, memoryPositions }: MemoryLinksProps) {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  // Filter to only links where both memories exist and have positions
  const validLinks = useMemo(() => {
    const memoryIds = new Set(memories.map(m => m.id));
    return links.filter(link =>
      memoryIds.has(link.source_id) &&
      memoryIds.has(link.target_id) &&
      memoryPositions.has(link.source_id) &&
      memoryPositions.has(link.target_id)
    );
  }, [memories, links, memoryPositions]);

  const handleHover = useCallback((linkId: string) => {
    setHoveredLink(linkId);
  }, []);

  const handleUnhover = useCallback(() => {
    setHoveredLink(null);
  }, []);

  if (validLinks.length === 0) return null;

  return (
    <group name="neural-connections">
      {/* Connection count badge */}
      <Html position={[0, 5, 0]} center>
        <div style={{
          backgroundColor: 'rgba(0, 212, 255, 0.15)',
          border: '1px solid rgba(0, 212, 255, 0.5)',
          color: '#00d4ff',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
        }}>
          ⚡ {validLinks.length} synaptic connections
        </div>
      </Html>

      {validLinks.map((link) => {
        const sourcePos = memoryPositions.get(link.source_id)!;
        const targetPos = memoryPositions.get(link.target_id)!;
        const linkId = `${link.source_id}-${link.target_id}`;

        return (
          <NeuralConnection
            key={linkId}
            link={link}
            sourcePos={sourcePos}
            targetPos={targetPos}
            isHovered={hoveredLink === linkId}
            onHover={() => handleHover(linkId)}
            onUnhover={handleUnhover}
          />
        );
      })}
    </group>
  );
}
