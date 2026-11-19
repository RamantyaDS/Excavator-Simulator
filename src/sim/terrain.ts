// Diggable ground: one height field over the whole site with the soil it is made of. Every cell knows its surface
// height, how high the undisturbed natural ground still stands (below that it is natural soil, above it loose spoil),
// where the bedrock starts, and its zone (field clay, sand, peat). Cutting lowers cells; spoil dropped from the bucket
// raises them; slopes steeper than the material's angle of repose slump, natural walls too (and sooner under a load).

export const CELL = 0.3125; // m
export const N = 512; // cells per side: 160 m
export const HALF = (N * CELL) / 2;

export const enum Soil {
  Topsoil = 0,
  Clay = 1,
  Sand = 2,
  Peat = 3, // wet peat / mud of the plantation
  Rock = 4, // unbroken bedrock: cannot be dug, must be broken
  Broken = 5, // blasted / broken rock
  Loose = 6, // dug spoil (its kind in looseKind)
}

export interface SoilProps {
  name: string;
  /** cutting resistance per m² of cut cross section (N/m²) */
  kc: number;
  /** bank density t/m³ */
  rho: number;
  /** swell: loose volume per bank volume */
  swell: number;
  /** angle of repose of the loose material (deg) */
  repose: number;
  /** steepest natural wall that stands (deg) */
  wall: number;
  /** track friction */
  mu: number;
  /** how far tracks sink before it bears (m) */
  sink: number;
  /** sticks in the bucket (fraction that stays when dumping fast) */
  sticky: number;
  color: [number, number, number];
}

export const SOIL: SoilProps[] = [
  { name: 'Tanah atas', kc: 55e3, rho: 1.45, swell: 1.25, repose: 36, wall: 55, mu: 0.75, sink: 0.04, sticky: 0.02, color: [0.36, 0.27, 0.18] },
  { name: 'Lempung', kc: 150e3, rho: 1.9, swell: 1.3, repose: 38, wall: 72, mu: 0.7, sink: 0.02, sticky: 0.08, color: [0.62, 0.42, 0.26] },
  { name: 'Pasir', kc: 45e3, rho: 1.7, swell: 1.12, repose: 33, wall: 36, mu: 0.65, sink: 0.05, sticky: 0, color: [0.8, 0.68, 0.46] },
  { name: 'Gambut basah / lumpur', kc: 25e3, rho: 1.15, swell: 1.05, repose: 14, wall: 22, mu: 0.32, sink: 0.55, sticky: 0.3, color: [0.3, 0.24, 0.16] },
  { name: 'Batu (belum dipecah)', kc: 5e6, rho: 2.6, swell: 1.6, repose: 40, wall: 89, mu: 0.8, sink: 0, sticky: 0, color: [0.52, 0.5, 0.47] },
  { name: 'Batu pecah', kc: 120e3, rho: 1.8, swell: 1.0, repose: 40, wall: 40, mu: 0.8, sink: 0.01, sticky: 0, color: [0.6, 0.57, 0.52] },
  { name: 'Tanah galian', kc: 30e3, rho: 1.5, swell: 1.0, repose: 35, wall: 35, mu: 0.6, sink: 0.08, sticky: 0.05, color: [0.5, 0.36, 0.24] },
];

export const enum Zone {
  Field = 0,
  Sand = 1,
  Peat = 2,
  Quarry = 3,
}

export interface Terrain {
  h: Float32Array; // surface
  nat: Float32Array; // top of undisturbed natural ground (≤ h)
  orig: Float32Array; // initial surface (natural layering is measured from it)
  rock: Float32Array; // bedrock top
  zone: Uint8Array;
  loose: Uint8Array; // kind of the loose material on top (a Soil)
  load: Uint8Array; // under a track this step: walls near it slump sooner
  /** changed region since the renderer last looked: [x0, z0, x1, z1] in cells, or x0 > x1 when clean */
  dirty: [number, number, number, number];
  /** cells waiting to be checked for slumping */
  active: Set<number>;
  /** water table per zone (m) */
  water: number[];
  /** rain: wet soil slumps at flatter angles */
  wet: boolean;
}

export const idx = (i: number, j: number) => j * N + i;
export const toCell = (x: number) => (x + HALF) / CELL;
export const cellX = (i: number) => i * CELL - HALF;

export function createTerrain(shape: (x: number, z: number) => { h: number; rock: number; zone: Zone }): Terrain {
  const n = N * N;
  const t: Terrain = {
    h: new Float32Array(n),
    nat: new Float32Array(n),
    orig: new Float32Array(n),
    rock: new Float32Array(n),
    zone: new Uint8Array(n),
    loose: new Uint8Array(n).fill(Soil.Loose),
    load: new Uint8Array(n),
    dirty: [0, 0, N - 1, N - 1],
    active: new Set(),
    water: [-3.2, -9, -0.45, -20],
    wet: false,
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const s = shape(cellX(i), cellX(j));
      const k = idx(i, j);
      t.h[k] = t.nat[k] = t.orig[k] = s.h;
      t.rock[k] = Math.min(s.rock, s.h);
      t.zone[k] = s.zone;
      if (s.rock >= s.h) t.loose[k] = Soil.Broken; // a rock outcrop: anything piled on it is broken rock
    }
  return t;
}

/** What the surface of a cell is made of. */
export function surfaceSoil(t: Terrain, k: number): Soil {
  const h = t.h[k];
  if (h > t.nat[k] + 0.02) return t.loose[k] as Soil;
  if (h <= t.rock[k] + 0.005) return Soil.Rock;
  const z = t.zone[k];
  if (z === Zone.Peat) return Soil.Peat;
  if (z === Zone.Quarry) return Soil.Broken;
  if (t.orig[k] - h < 0.35) return Soil.Topsoil;
  return z === Zone.Sand ? Soil.Sand : Soil.Clay;
}

function inRange(i: number, j: number) {
  return i >= 0 && j >= 0 && i < N && j < N;
}

/** Bilinear surface height (outside the field: the edge value). */
export function heightAt(t: Terrain, x: number, z: number) {
  const fx = Math.min(N - 1.001, Math.max(0, toCell(x)));
  const fz = Math.min(N - 1.001, Math.max(0, toCell(z)));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const a = t.h[idx(i, j)];
  const b = t.h[idx(i + 1, j)];
  const c = t.h[idx(i, j + 1)];
  const d = t.h[idx(i + 1, j + 1)];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function soilAt(t: Terrain, x: number, z: number): Soil {
  const i = Math.round(toCell(x));
  const j = Math.round(toCell(z));
  if (!inRange(i, j)) return Soil.Topsoil;
  return surfaceSoil(t, idx(i, j));
}

export function normalAt(t: Terrain, x: number, z: number): [number, number, number] {
  const e = CELL;
  const dx = heightAt(t, x + e, z) - heightAt(t, x - e, z);
  const dz = heightAt(t, x, z + e) - heightAt(t, x, z - e);
  const nx = -dx / (2 * e);
  const nz = -dz / (2 * e);
  const l = Math.hypot(nx, 1, nz);
  return [nx / l, 1 / l, nz / l];
}

export function markDirty(t: Terrain, i: number, j: number) {
  const d = t.dirty;
  if (d[0] > d[2]) {
    d[0] = d[2] = i;
    d[1] = d[3] = j;
  } else {
    d[0] = Math.min(d[0], i);
    d[1] = Math.min(d[1], j);
    d[2] = Math.max(d[2], i);
    d[3] = Math.max(d[3], j);
  }
}

function touch(t: Terrain, i: number, j: number) {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const a = i + di;
      const b = j + dj;
      if (inRange(a, b)) t.active.add(idx(a, b));
    }
  markDirty(t, i, j);
}

/** Lower one cell to y (not below rock); returns the bank volume (m³) taken and its soil. */
export function cutCell(t: Terrain, i: number, j: number, y: number): [number, Soil] {
  if (!inRange(i, j)) return [0, Soil.Topsoil];
  const k = idx(i, j);
  const soil = surfaceSoil(t, k);
  if (soil === Soil.Rock) return [0, soil];
  const floor = Math.max(y, t.rock[k]);
  if (t.h[k] <= floor) return [0, soil];
  const dv = (t.h[k] - floor) * CELL * CELL;
  t.h[k] = floor;
  if (t.nat[k] > floor) t.nat[k] = floor;
  touch(t, i, j);
  return [dv, soil];
}

/** Drop a loose volume (m³) on a cell. */
export function addCell(t: Terrain, i: number, j: number, vol: number, kind: Soil) {
  if (!inRange(i, j) || vol <= 0) return;
  const k = idx(i, j);
  t.h[k] += vol / (CELL * CELL);
  t.loose[k] = kind === Soil.Rock ? Soil.Broken : kind === Soil.Broken ? Soil.Broken : Soil.Loose;
  touch(t, i, j);
}

/** Spread a loose volume over a disc (spill from the bucket lip, a dumped load). */
export function dropAt(t: Terrain, x: number, z: number, vol: number, kind: Soil, r = 0.9) {
  const ci = toCell(x);
  const cj = toCell(z);
  const rc = Math.max(1, r / CELL);
  const cells: [number, number, number][] = [];
  let sum = 0;
  for (let j = Math.floor(cj - rc); j <= Math.ceil(cj + rc); j++)
    for (let i = Math.floor(ci - rc); i <= Math.ceil(ci + rc); i++) {
      const d = Math.hypot(i - ci, j - cj) / rc;
      if (d > 1 || !inRange(i, j)) continue;
      const w = 1 - d * d;
      cells.push([i, j, w]);
      sum += w;
    }
  for (const [i, j, w] of cells) addCell(t, i, j, (vol * w) / sum, kind);
}

const NB = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Let over-steep slopes slump: a few passes over the active cells. Natural ground that slides becomes loose. */
export function relax(t: Terrain, maxCells = 6000) {
  if (!t.active.size) return 0;
  const list = [...t.active];
  t.active.clear();
  let moved = 0;
  for (let n = 0; n < list.length && n < maxCells; n++) {
    const k = list[n];
    const i = k % N;
    const j = (k - i) / N;
    const soil = surfaceSoil(t, k);
    if (soil === Soil.Rock) continue;
    const loose = t.h[k] > t.nat[k] + 0.02;
    const p = SOIL[soil];
    let deg = (loose ? p.repose : p.wall) - (t.wet ? 7 : 0);
    if (t.load[k]) deg = Math.min(deg, loose ? 26 : 34); // a track's weight at the edge brings the wall down
    const tanA = Math.tan((deg * Math.PI) / 180);
    for (const [di, dj, dd] of NB) {
      const a = i + di;
      const b = j + dj;
      if (!inRange(a, b)) continue;
      const q = idx(a, b);
      const drop = t.h[k] - t.h[q];
      const lim = tanA * CELL * dd;
      if (drop <= lim + 1e-4) continue;
      // move half the excess, not below the rock
      let m = (drop - lim) * 0.45;
      const minH = Math.max(t.rock[k], t.h[q]);
      m = Math.min(m, t.h[k] - minH);
      if (m <= 1e-4) continue;
      const kind = loose ? (t.loose[k] as Soil) : soil;
      t.h[k] -= m;
      if (t.nat[k] > t.h[k]) t.nat[k] = t.h[k];
      t.h[q] += m;
      t.loose[q] = kind === Soil.Broken ? Soil.Broken : Soil.Loose;
      moved += m * CELL * CELL;
      touch(t, i, j);
      touch(t, a, b);
    }
  }
  // what was not processed stays active
  for (let n = maxCells; n < list.length; n++) t.active.add(list[n]);
  return moved;
}

/** Ground water level at a cell (open water shows where the surface is below it). */
export function waterLevel(t: Terrain, k: number) {
  return t.water[t.zone[k]];
}
