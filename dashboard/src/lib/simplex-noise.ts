/**
 * Simplex Noise Implementation
 * Used for procedural brain mesh generation with organic cortex folds
 *
 * Based on Stefan Gustavson's simplex noise algorithm
 */

// Gradient vectors for 3D
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// Permutation table
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);

// Initialize with seed
function initPermutation(seed: number = 0): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
  }

  // Shuffle using seed
  let n = seed;
  for (let i = 255; i > 0; i--) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    const j = n % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
}

// Initialize with default seed
initPermutation(42);

// Skewing factors for 3D
const F3 = 1 / 3;
const G3 = 1 / 6;

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

/**
 * 3D Simplex Noise
 * Returns value in range [-1, 1]
 */
export function simplex3D(x: number, y: number, z: number): number {
  // Skew the input space
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;

  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;

  // Determine simplex
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 >= 0) {
    const gi0 = permMod12[ii + perm[jj + perm[kk]]];
    t0 *= t0;
    n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 >= 0) {
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    t1 *= t1;
    n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 >= 0) {
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    t2 *= t2;
    n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 >= 0) {
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
    t3 *= t3;
    n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3);
  }

  return 32 * (n0 + n1 + n2 + n3);
}

/**
 * Fractal Brownian Motion (fBm)
 * Adds multiple octaves of noise for more detail
 */
export function fbm3D(
  x: number,
  y: number,
  z: number,
  octaves: number = 4,
  lacunarity: number = 2,
  gain: number = 0.5
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex3D(x * frequency, y * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Ridged noise - creates sharp ridges
 * Useful for sulci (brain folds)
 */
export function ridged3D(
  x: number,
  y: number,
  z: number,
  octaves: number = 4,
  lacunarity: number = 2,
  gain: number = 0.5
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let weight = 1;

  for (let i = 0; i < octaves; i++) {
    let signal = simplex3D(x * frequency, y * frequency, z * frequency);
    signal = 1 - Math.abs(signal);
    signal *= signal * weight;
    weight = Math.min(1, Math.max(0, signal * 2));
    value += signal * amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value;
}

/**
 * Turbulence - absolute value of noise
 */
export function turbulence3D(
  x: number,
  y: number,
  z: number,
  octaves: number = 4
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * Math.abs(simplex3D(x * frequency, y * frequency, z * frequency));
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value;
}
