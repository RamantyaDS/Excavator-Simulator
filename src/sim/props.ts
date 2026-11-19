// Loose objects the machine can push, scoop and grab: logs for the grapple, and the Rodeo pieces (a ball, an egg
// that breaks if knocked or dropped hard, tyres). Simple physics: spheres with gravity, ground and friction, pushed by
// the tool's points, carried in a bucket whose mouth faces up, held by a closed grapple.
import * as THREE from 'three';
import { groundAt } from './colliders';
import { LOGS, RODEO } from './site';
import type { Terrain } from './terrain';

export type PropKind = 'log' | 'ball' | 'egg' | 'tire';
export interface Prop {
  id: string;
  kind: PropKind;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
  held: '' | 'bucket' | 'grapple';
  off: THREE.Vector3;
  yaw: number;
  broken: boolean;
}

export function createProps(t: Terrain): Prop[] {
  const out: Prop[] = [];
  const add = (id: string, kind: PropKind, x: number, z: number, r: number, yaw = 0) =>
    out.push({ id, kind, p: new THREE.Vector3(x, groundAt(t, x, z).h + r, z), v: new THREE.Vector3(), r, held: '', off: new THREE.Vector3(), yaw, broken: false });
  for (let i = 0; i < LOGS.n; i++) add('log' + i, 'log', LOGS.x + (i % 3) * 0.9, LOGS.z + Math.floor(i / 3) * 0.9, 0.38, 0.1 * i);
  add('ball', 'ball', RODEO.x - 2, RODEO.z, 0.45);
  add('egg', 'egg', RODEO.x + 2, RODEO.z - 1, 0.35);
  for (let i = 0; i < 3; i++) add('tire' + i, 'tire', RODEO.x - 4 + i * 1.6, RODEO.z - 5, 0.55);
  return out;
}

/** Ground for props: terrain/lowbed, the pedestal top, the drum floor. */
export function propGround(t: Terrain, x: number, z: number) {
  let h = groundAt(t, x, z).h;
  const P = RODEO.pedestal;
  if (Math.hypot(x - P.x, z - P.z) < P.r) h = Math.max(h, groundAt(t, P.x, P.z).h + P.h);
  return h;
}

export interface ToolPoint {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
}

export interface PropCtx {
  t: Terrain;
  pts: ToolPoint[];
  /** bucket load centre (world) and how much its mouth faces up; null for other tools */
  bucket: { c: THREE.Vector3; mouthY: number } | null;
  /** grapple jaws (world) and whether closed; null for other tools */
  grapple: { c: THREE.Vector3; closed: boolean; justClosed: boolean } | null;
  dt: number;
}

const G = 9.81;
const _d = new THREE.Vector3();

export function stepProps(props: Prop[], x: PropCtx): string[] {
  const ev: string[] = [];
  for (const q of props) {
    if (q.held === 'bucket') {
      if (!x.bucket || x.bucket.mouthY < 0.05) {
        q.held = '';
        q.v.copy(x.pts[2]?.v ?? q.v);
      } else {
        const np = x.bucket.c.clone().add(q.off);
        q.v.copy(np).sub(q.p).divideScalar(Math.max(1e-3, x.dt));
        q.p.copy(np);
        continue;
      }
    }
    if (q.held === 'grapple') {
      if (!x.grapple || !x.grapple.closed) {
        q.held = '';
        ev.push('release');
      } else {
        const np = x.grapple.c.clone();
        q.v.copy(np).sub(q.p).divideScalar(Math.max(1e-3, x.dt));
        q.p.copy(np);
        continue;
      }
    }
    // free: gravity, ground, friction
    q.v.y -= G * x.dt;
    q.p.addScaledVector(q.v, x.dt);
    const g = propGround(x.t, q.p.x, q.p.z);
    if (q.p.y - q.r < g) {
      if (q.kind === 'egg' && -q.v.y > 2.4 && !q.broken) {
        q.broken = true;
        ev.push('egg');
      }
      q.p.y = g + q.r;
      q.v.y = Math.max(0, -q.v.y * (q.kind === 'ball' ? 0.35 : 0.1));
      const k = q.kind === 'ball' ? 0.6 : q.kind === 'tire' ? 2.5 : 4;
      q.v.x *= Math.max(0, 1 - k * x.dt);
      q.v.z *= Math.max(0, 1 - k * x.dt);
    }
    // pushed by the tool
    for (const tp of x.pts) {
      _d.subVectors(q.p, tp.p);
      const d = _d.length();
      const min = q.r + tp.r;
      if (d < min && d > 1e-4) {
        q.p.addScaledVector(_d, (min - d) / d);
        const rel = tp.v.distanceTo(q.v);
        if (q.kind === 'egg' && rel > 2.6 && !q.broken) {
          q.broken = true;
          ev.push('egg');
        }
        q.v.lerp(tp.v, 0.6);
        if (rel > 0.8) ev.push('bump');
      }
    }
    // caught
    if (x.bucket && x.bucket.mouthY > 0.35 && q.p.distanceTo(x.bucket.c) < 0.85 + q.r * 0.3 && q.kind !== 'log') {
      q.held = 'bucket';
      q.off.subVectors(q.p, x.bucket.c).multiplyScalar(0.5);
    } else if (x.grapple && x.grapple.justClosed && q.p.distanceTo(x.grapple.c) < 0.9 + q.r) {
      q.held = 'grapple';
      ev.push('grab');
    }
  }
  return ev;
}
