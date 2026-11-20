// Two rigid dump trucks (Komatsu HD465-7 class: 55 t payload, 34.2 m³ heaped) on a loop: queue, back into the bay
// beside the excavator, wait to be loaded, haul to the dump, tip, return. Loading too much or hitting the cab counts.
import { hitsSolid } from '../embed';
import { BAY, DUMP, ROUTE } from './site';

export const TRUCK = {
  payloadKg: 55000,
  heapedM3: 34.2,
  bed: { z0: -4.6, z1: 1.6, w: 4.1, floor: 2.25, rim: 3.75 }, // local: z forward from the truck's centre
  cab: { z0: 1.8, z1: 4.4, x0: 0.1, x1: 2.1, top: 4.35 },
  len: 10.3,
  width: 5.4,
};

export type TruckState = 'queue' | 'arrive' | 'wait' | 'leave' | 'dump' | 'return';

export interface Truck {
  id: number;
  x: number;
  z: number;
  heading: number;
  state: TruckState;
  /** distance along the path for the current leg */
  s: number;
  kg: number;
  m3: number;
  passes: number;
  tip: number; // body raise 0…1
  wait: number;
  loaded: number; // trucks this one has carried
  lastPct: number;
}

/** The leg from the route start to the bay (backing in for the last part). */
const LEG = ROUTE;
function legLen(p: [number, number][]) {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}
const LEG_LEN = legLen(LEG);
const BACK: [number, number][] = [
  [BAY.x, BAY.z],
  [-14, 44],
  [-6, 52],
  [DUMP.x, DUMP.z],
];
const BACK_LEN = legLen(BACK);
const RET: [number, number][] = [
  [DUMP.x, DUMP.z],
  [48, 70],
  [60, 66],
];
const RET_LEN = legLen(RET);

function along(p: [number, number][], s: number): [number, number, number] {
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0];
    const dz = p[i][1] - p[i - 1][1];
    const l = Math.hypot(dx, dz);
    if (s <= l || i === p.length - 1) {
      const k = Math.min(1, s / l);
      return [p[i - 1][0] + dx * k, p[i - 1][1] + dz * k, Math.atan2(dx, dz)];
    }
    s -= l;
  }
  return [p[0][0], p[0][1], 0];
}

export function createTrucks(): Truck[] {
  return [0, 1].map((id) => {
    const [x, z, h] = along(LEG, 0);
    return { id, x: x + id * 8, z: z + id * 2, heading: h, state: id === 0 ? 'arrive' : 'queue', s: 0, kg: 0, m3: 0, passes: 0, tip: 0, wait: 0, loaded: 0, lastPct: 0 };
  });
}

export const SPEED = 6; // m/s on the haul road (playable)

/** Advance the trucks. `release` sends the truck in the bay away (the operator's horn). Returns events. */
export function stepTrucks(trucks: Truck[], dt: number, release: boolean): string[] {
  const ev: string[] = [];
  const bayBusy = trucks.some((t) => t.state === 'arrive' || t.state === 'wait');
  for (const t of trucks) {
    // something of the Traknus World (its truck, someone on foot) on the haul road: wait until it is clear
    if ((t.state === 'arrive' || t.state === 'leave' || t.state === 'return') && hitsSolid({ x: t.x, z: t.z, hx: TRUCK.width / 2, hz: TRUCK.len / 2 + 3, yaw: t.heading, y0: 0, y1: 4.5 })) continue;
    if (t.state === 'queue') {
      if (!bayBusy) {
        t.state = 'arrive';
        t.s = 0;
      }
      continue;
    }
    if (t.state === 'arrive') {
      t.s = Math.min(LEG_LEN, t.s + SPEED * dt * (t.s > LEG_LEN - 12 ? 0.35 : 1));
      const [x, z, h] = along(LEG, t.s);
      // backs in on the last stretch: its rear (the bed) towards the hill
      t.x = x;
      t.z = z;
      t.heading = t.s > LEG_LEN - 12 ? h + Math.PI : h;
      if (t.s >= LEG_LEN) {
        t.state = 'wait';
        t.heading = BAY.heading;
        t.wait = 0;
        ev.push('truck-ready');
      }
    } else if (t.state === 'wait') {
      t.wait += dt;
      if (release && t.kg > 0) {
        t.state = 'leave';
        t.s = 0;
        t.lastPct = t.kg / TRUCK.payloadKg;
        t.loaded++;
        ev.push(t.kg > TRUCK.payloadKg * 1.1 ? 'truck-overload' : 'truck-leave');
      }
    } else if (t.state === 'leave') {
      t.s = Math.min(BACK_LEN, t.s + SPEED * dt);
      const [x, z, h] = along(BACK, t.s);
      Object.assign(t, { x, z, heading: h });
      if (t.s >= BACK_LEN) {
        t.state = 'dump';
        t.tip = 0;
      }
    } else if (t.state === 'dump') {
      t.tip = Math.min(1, t.tip + dt / 4);
      if (t.tip >= 1) {
        t.kg = 0;
        t.m3 = 0;
        t.passes = 0;
        t.state = 'return';
        t.s = 0;
      }
    } else if (t.state === 'return') {
      t.tip = Math.max(0, t.tip - dt / 3);
      t.s = Math.min(RET_LEN, t.s + SPEED * dt);
      const [x, z, h] = along(RET, t.s);
      Object.assign(t, { x, z, heading: h });
      if (t.s >= RET_LEN) {
        t.state = 'queue';
        t.s = 0;
      }
    }
  }
  return ev;
}

/** World point → truck local (x left, z forward). */
export function toLocal(t: Truck, x: number, z: number): [number, number] {
  const dx = x - t.x;
  const dz = z - t.z;
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Is a point over the bed opening (it would land in the body)? */
export function overBed(t: Truck, x: number, y: number, z: number) {
  if (t.state !== 'wait') return false;
  const [lx, lz] = toLocal(t, x, z);
  const b = TRUCK.bed;
  return Math.abs(lx) < b.w / 2 - 0.2 && lz > b.z0 + 0.2 && lz < b.z1 - 0.2 && y > b.floor;
}

/** Does a point hit the truck's steel: 'cab', 'body' or '' (inside the bed above the floor is fine). */
export function truckHit(t: Truck, x: number, y: number, z: number): '' | 'cab' | 'body' {
  const [lx, lz] = toLocal(t, x, z);
  const C = TRUCK.cab;
  if (lz > C.z0 && lz < C.z1 && lx > C.x0 && lx < C.x1 && y < C.top) return 'cab';
  const b = TRUCK.bed;
  if (Math.abs(lx) < b.w / 2 + 0.1 && lz > b.z0 - 0.1 && lz < b.z1 + 0.1) {
    const inside = Math.abs(lx) < b.w / 2 - 0.15 && lz > b.z0 + 0.15 && lz < b.z1 - 0.15;
    if (inside ? y < b.floor : y < b.rim + 0.3 * (1 - t.tip)) return 'body';
  }
  if (Math.abs(lx) < TRUCK.width / 2 && lz > -5 && lz < 5 && y < 1.6) return 'body';
  return '';
}
