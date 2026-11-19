// The work site, 160 × 160 m: a clay field with a soil hill to load trucks from, a trench line with machine guidance
// and buried services, a peat plantation block for the drainage canal and its road, the genset house foundation, a
// rock face for the breaker, an overhead power line. Design surfaces for the guided jobs live here too.
import { Zone } from './terrain';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x: number, z: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = x - i;
  const v = z - j;
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

export const HILL = { x: -32, z: 30, r: 15, h: 5.5 };
export const QUARRY = { x0: -80, x1: -50, z0: 35, z1: 80 };
export const PEAT = { x0: -80, x1: -30, z0: -80, z1: -38 };

export function shape(x: number, z: number): { h: number; rock: number; zone: Zone } {
  let h = (noise(x * 0.05, z * 0.05) - 0.5) * 0.5 + (noise(x * 0.17, z * 0.17) - 0.5) * 0.12;
  let zone = Zone.Field;
  let rock = -7 + (noise(x * 0.03 + 5, z * 0.03) - 0.5) * 2;
  // soil hill for loading trucks
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  h += HILL.h * (1 - smooth(HILL.r * 0.35, HILL.r, dh));
  // peat block: low and flat, wet
  if (x < PEAT.x1 && z < PEAT.z1) {
    const k = smooth(0, 4, Math.min(PEAT.x1 - x, PEAT.z1 - z));
    h = h * (1 - k) + (-0.25 + (noise(x * 0.1, z * 0.1) - 0.5) * 0.15) * k;
    if (k > 0.5) zone = Zone.Peat;
    // the swamp pond: deep open water
    const kp = smooth(0, 5, Math.min(x - (-80), -50 - x, z - (-80), -66 - z));
    h += (-3.0 - h) * kp;
  }
  // rock face: a quarry bench rising to the north-west
  if (x < QUARRY.x1 && z > QUARRY.z0) {
    const k = smooth(0, 3, Math.min(QUARRY.x1 - x, z - QUARRY.z0));
    const face = 3.5 + smooth(-62, -70, x) * 4;
    h = h * (1 - k) + face * k + (noise(x * 0.4, z * 0.4) - 0.5) * 0.6 * k;
    rock = h * k + rock * (1 - k) - 0.15;
    if (k > 0.5) zone = Zone.Quarry;
  }
  // sand lens to the east
  if (x > 45 && z > -10 && z < 40) zone = Zone.Sand;
  return { h, rock, zone };
}

export const START = { x: 0, z: 2, heading: 0 };

// ---------- jobs ----------
export type JobId = 'truck' | 'trench' | 'canal' | 'foundation' | 'breaker' | 'logs' | 'lowbed' | 'amphib' | 'rodeo' | 'free';

/** Trench with 3D machine guidance: straight, 1 % fall, flat bottom 2.0 m wide. */
export const TRENCH = { x: 14, z0: -8, z1: -46, w: 2.0, d0: -2.6, d1: -2.98 };
/** Buried services next to and across the trench (depth of the top of pipe). */
export const UTILS = [
  { id: 'gas', name: 'Pipa gas 8"', a: [17.2, 0] as [number, number], b: [17.2, -60] as [number, number], y: -1.4, r: 0.11, color: '#f2c21c' },
  { id: 'fiber', name: 'Kabel fiber optik', a: [0, -27] as [number, number], b: [40, -27] as [number, number], y: -0.9, r: 0.05, color: '#ff7a1a' },
];
/** Drainage canal in the peat block, with a road embankment along its north bank from the spoil. */
export const CANAL = { x0: -76, x1: -40, z: -58, top: 6.0, bottom: 3.0, depth: 2.4 };
export const ROAD = { x0: -76, x1: -40, z0: -52.5, z1: -48.5, top: 0.6 };
/** Genset house foundation pit: flat bottom. */
export const PIT = { x: 38, z: -22, w: 7.0, l: 4.0, depth: 1.6 };
export const GENHOUSE = { x: 38, z: -32, w: 10, l: 6, h: 4.2 };
/** Overhead power line along the west side (20 kV). */
export const POWERLINE = { x: -40, z0: -80, z1: 80, y: 10.5, poles: [-75, -35, 5, 45] };
/** Truck loading: the bay beside the hill, the dump area and the route between. */
export const BAY = { x: -14, z: 34, heading: Math.PI };
export const DUMP = { x: 30, z: 66 };
export const ROUTE: [number, number][] = [
  [60, 66],
  [20, 62],
  [-6, 52],
  [-14, 44],
  [-14, 34],
];

/** Design bottom of the trench at z (null outside). */
export function trenchDesign(x: number, z: number) {
  const T = TRENCH;
  if (Math.abs(x - T.x) > T.w / 2 || z > T.z0 || z < T.z1) return null;
  return T.d0 + ((z - T.z0) / (T.z1 - T.z0)) * (T.d1 - T.d0);
}

/** Design surface of the canal (trapezoid) at a point, null outside its top width. */
export function canalDesign(x: number, z: number) {
  const C = CANAL;
  if (x < C.x0 || x > C.x1) return null;
  const d = Math.abs(z - C.z);
  if (d > C.top / 2) return null;
  const k = Math.min(1, (C.top / 2 - d) / ((C.top - C.bottom) / 2));
  return -0.25 - C.depth * k;
}

export function pitDesign(x: number, z: number) {
  if (Math.abs(x - PIT.x) > PIT.w / 2 || Math.abs(z - PIT.z) > PIT.l / 2) return null;
  return -PIT.depth;
}

export function roadDesign(x: number, z: number) {
  if (x < ROAD.x0 || x > ROAD.x1 || z < ROAD.z0 || z > ROAD.z1) return null;
  return ROAD.top;
}

/** The design surface the guidance shows at a point (the job's), null where there is none. */
export function design(job: JobId, x: number, z: number) {
  if (job === 'trench') return trenchDesign(x, z);
  if (job === 'canal') return canalDesign(x, z) ?? roadDesign(x, z);
  if (job === 'foundation') return pitDesign(x, z);
  return null;
}

// ---------- phase 2: tools, lowbed, swamp, Rodeo ----------
/** Quick-coupler tool rack: tools stand here; the coupler swaps within reach of it. */
export const RACK = { x: 10, z: 14 };
/** Lowbed trailer (rear ramp, deck, gooseneck) parked on the east side, heading north. */
export const LOWBED = { x: 54, z: -4, yaw: 0, w: 3.7, deck: 1.1, z0: -6.5, z1: 6.0, ramp: 4.5, neck: 2.6, neckTop: 1.7 };
/** A deep swamp pond inside the peat block for the amphibious undercarriage, with a landing on the far side. */
export const POND = { x0: -79, x1: -50, z0: -79, z1: -66, depth: -3.0 };
export const POND_GOAL = { x: -64, z: -76 };
/** Logs for the grapple and the stack area to bring them to. */
export const LOGS = { x: 26, z: 16, n: 6 };
export const LOG_STACK = { x: 34, z: 26, r: 4 };
/** Excavator Rodeo arena: a ball to drop into a drum, an egg to set on a pedestal, tyres to bring into the ring. */
export const RODEO = { x: 30, z: 46, drum: { x: 36, z: 50, r: 0.6, h: 1.0 }, pedestal: { x: 24, z: 52, r: 0.4, h: 1.2 }, ring: { x: 30, z: 56, r: 2.2 } };
/** Rock to break in the quarry (m³). */
export const BREAK_GOAL = 6;
