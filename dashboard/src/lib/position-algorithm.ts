/**
 * Position Algorithm
 * Calculates 3D positions for memories in a brain-like visualization
 *
 * Brain anatomy mapping:
 * - Frontal lobe (front, +Z): Short-term memories, decisions, planning
 * - Temporal lobes (sides, ±X): Episodic memories, language, emotion
 * - Parietal lobe (top, +Y): Spatial awareness, context
 * - Occipital lobe (back, -Z): Long-term storage, patterns
 * - Hippocampus (center): Learning, memory formation
 */

import { Memory, Memory3DPosition, MemoryCategory } from '@/types/memory';

// Brain region definitions - where each category lives
const BRAIN_REGIONS: Record<MemoryCategory, {
  basePosition: { x: number; y: number; z: number };
  spread: number;
}> = {
  // Prefrontal cortex - planning and architecture decisions
  architecture: {
    basePosition: { x: 0, y: 1.2, z: 2.2 },
    spread: 1.0,
  },
  // Visual/pattern recognition area - occipital lobe
  pattern: {
    basePosition: { x: 0, y: 0.3, z: -2.2 },
    spread: 0.9,
  },
  // Limbic system - preferences and emotions
  preference: {
    basePosition: { x: 1.6, y: -0.3, z: 0 },
    spread: 0.7,
  },
  // Amygdala area - error/threat detection
  error: {
    basePosition: { x: -1.6, y: -0.3, z: 0.3 },
    spread: 0.8,
  },
  // Parietal lobe - context and spatial awareness
  context: {
    basePosition: { x: 0, y: 1.8, z: 0 },
    spread: 1.2,
  },
  // Hippocampus - learning and memory formation (central)
  learning: {
    basePosition: { x: 0, y: -0.3, z: 0 },
    spread: 0.8,
  },
  // Frontal lobe - task planning
  todo: {
    basePosition: { x: 0.6, y: 0.8, z: 1.8 },
    spread: 0.7,
  },
  // Temporal lobe - general notes and language
  note: {
    basePosition: { x: 1.8, y: 0, z: -0.3 },
    spread: 1.0,
  },
  // Social brain network - relationships
  relationship: {
    basePosition: { x: -1.8, y: 0.3, z: -0.3 },
    spread: 0.9,
  },
  // Distributed - custom memories
  custom: {
    basePosition: { x: 0, y: 0, z: 0 },
    spread: 1.5,
  },
};

// Memory type influences depth (surface vs inner brain)
const TYPE_DEPTH: Record<string, number> = {
  short_term: 0.6,   // Closer to surface (outer brain)
  episodic: 0,       // Middle layer
  long_term: -0.4,   // Deeper (inner brain, more permanent)
};

/**
 * Seeded random for consistent positions based on memory ID
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Calculate 3D position for a memory within brain anatomy
 */
export function calculateMemoryPosition(memory: Memory): Memory3DPosition {
  const region = BRAIN_REGIONS[memory.category] || BRAIN_REGIONS.custom;
  const typeDepth = TYPE_DEPTH[memory.type] || 0;

  // Use memory ID for consistent random offset
  const rand1 = seededRandom(memory.id);
  const rand2 = seededRandom(memory.id + 1000);
  const rand3 = seededRandom(memory.id + 2000);

  // Calculate position within brain region using spherical distribution
  const spread = region.spread;
  const theta = rand1 * Math.PI * 2; // Angle around Y axis
  const phi = (rand2 - 0.5) * Math.PI; // Angle from horizontal
  const r = rand3 * spread * 0.7 + spread * 0.3; // Distance from region center

  // Convert to cartesian
  const offsetX = r * Math.cos(phi) * Math.cos(theta);
  const offsetY = r * Math.sin(phi) * 0.6; // Flatten vertically
  const offsetZ = r * Math.cos(phi) * Math.sin(theta);

  // Base position from region + offset + type depth
  let x = region.basePosition.x + offsetX;
  let y = region.basePosition.y + offsetY;
  let z = region.basePosition.z + offsetZ + typeDepth;

  // Salience affects prominence (higher = closer to surface, more visible)
  const salienceBoost = memory.salience * 0.4;
  const distanceFromCenter = Math.sqrt(x * x + y * y + z * z);
  if (distanceFromCenter > 0.1) {
    const targetDistance = distanceFromCenter + salienceBoost;
    const scale = targetDistance / distanceFromCenter;
    x *= scale;
    y *= scale;
    z *= scale;
  }

  // Constrain to brain-like ellipsoid shape
  const brainWidth = 3.2;  // X axis
  const brainHeight = 2.5; // Y axis
  const brainDepth = 3.5;  // Z axis (front to back)

  // Keep within brain bounds
  const normalizedDist = Math.sqrt(
    (x / brainWidth) ** 2 +
    (y / brainHeight) ** 2 +
    (z / brainDepth) ** 2
  );

  if (normalizedDist > 0.95) {
    const scale = 0.95 / normalizedDist;
    x *= scale;
    y *= scale;
    z *= scale;
  }

  return { x, y, z };
}

/**
 * Calculate decay factor for visual effects
 */
export function calculateDecayFactor(memory: Memory): number {
  if (!memory.lastAccessed) return 1;

  const now = Date.now();
  const lastAccessed = new Date(memory.lastAccessed).getTime();
  const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60);

  const decayRates: Record<string, number> = {
    short_term: 0.995,
    long_term: 0.9995,
    episodic: 0.998,
  };

  const rate = decayRates[memory.type] || 0.995;
  return Math.pow(rate, hoursSinceAccess);
}

/**
 * Get region bounds for each memory type
 */
export function getRegionBounds() {
  return {
    short_term: { minZ: 1.0, maxZ: 3.0, color: '#F97316' },
    episodic: { minZ: -1.0, maxZ: 1.0, color: '#8B5CF6' },
    long_term: { minZ: -3.0, maxZ: -1.0, color: '#3B82F6' },
  };
}
