// Solid things on the ground that the tracks (and props) stand on: the lowbed trailer with its rear ramp, deck and
// gooseneck. groundAt() is the terrain or the top of whatever stands there, with its surface normal and friction.
import { LOWBED } from './site';
import { heightAt, normalAt, type Terrain } from './terrain';

export interface Ground {
  h: number;
  n: [number, number, number];
  /** friction against steel tracks on a steel deck (null: the soil's own) */
  mu: number | null;
}

function lowbedTop(x: number, z: number): Ground | null {
  const L = LOWBED;
  const c = Math.cos(L.yaw);
  const s = Math.sin(L.yaw);
  const dx = x - L.x;
  const dz = z - L.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  if (Math.abs(lx) > L.w / 2) return null;
  const rot = (nx: number, ny: number, nz: number): [number, number, number] => [nx * c + nz * s, ny, -nx * s + nz * c];
  if (lz >= L.z0 && lz <= L.z1) return { h: L.deck, n: [0, 1, 0], mu: 0.5 };
  if (lz < L.z0 && lz >= L.z0 - L.ramp) {
    const k = L.deck / L.ramp;
    const l = Math.hypot(1, k);
    return { h: (L.deck * (lz - (L.z0 - L.ramp))) / L.ramp, n: rot(0, 1 / l, -k / l), mu: 0.55 };
  }
  if (lz > L.z1 && lz <= L.z1 + L.neck) return { h: L.neckTop, n: [0, 1, 0], mu: 0.5 };
  return null;
}

export function groundAt(t: Terrain, x: number, z: number): Ground {
  const h = heightAt(t, x, z);
  const lb = lowbedTop(x, z);
  if (lb && lb.h > h) return lb;
  return { h, n: normalAt(t, x, z), mu: null };
}
