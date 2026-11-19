// The PC800 as a rigid body on its tracks, its work equipment driven by the hydraulics.
//
// Body: 6-DOF rigid body (mass and centre of gravity follow the work equipment and the bucket load) resting on
// contact points: along each track (with the belt speed for traction and a bristle friction model so it holds on a
// slope), the belly, the hull corners (if it rolls over), and the bucket. The ground is the diggable terrain.
// Work equipment: swing, boom, arm and bucket are moved by the levers through the pumps: flow is shared between
// functions (two at once go slower), speed drops with pressure (power limit), and a joint stalls at its relief
// torque. Torques come from gravity, from cutting soil and from the bucket pushing on the ground — which, past what
// the cylinders can hold, back-drives the joint; below that it lifts the machine (self-lift, ditch crossing).
// Bucket: its edge cuts the cells it sweeps (resistance from the soil), fills by the swell of what it cut, spills when
// tipped, drops into a truck bed or onto the ground.
import * as THREE from 'three';
import { groundAt } from './colliders';
import { createProps, stepProps, type Prop, type ToolPoint } from './props';
import { BREAK_GOAL, CANAL, LOGS, LOG_STACK, LOWBED, POND_GOAL, POWERLINE, QUARRY, RACK, ROAD, RODEO, START, UTILS, design, pitDesign, shape, trenchDesign, type JobId } from './site';
import { ARMS, SHOES, SPEC, type ArmId, type ShoeId, type ToolId } from './spec';
import {
  CELL,
  N,
  SOIL,
  Soil,
  createTerrain,
  cutCell,
  dropAt,
  heightAt,
  idx,
  normalAt,
  relax,
  soilAt,
  surfaceSoil,
  toCell,
  type Terrain,
} from './terrain';
import { TRUCK, createTrucks, overBed, stepTrucks, truckHit, type Truck } from './trucks';

export type Engine = 'off' | 'starting' | 'running';
export type Pattern = 'ISO' | 'SAE';
export type WorkMode = 'P' | 'E' | 'L';
export type Fail = '' | 'tipped' | 'utility' | 'powerline' | 'truck';

const G = 9.81;
const V = () => new THREE.Vector3();

interface Contact {
  /** carrier-frame point (or upper-frame when upper) */
  p: THREE.Vector3;
  kind: 'track' | 'belly' | 'hull';
  side: number; // -1 right, 1 left, 0 none
  upper: boolean;
  /** tangential spring of the bristle friction (world) */
  s: THREE.Vector3;
  load: number;
}

export interface Exc {
  terrain: Terrain;
  // body: carrier origin, attitude, velocity of the CG, angular velocity (world)
  p: THREE.Vector3;
  q: THREE.Quaternion;
  v: THREE.Vector3;
  w: THREE.Vector3;
  // work equipment
  swing: number;
  boom: number;
  arm: number;
  bucket: number;
  swingV: number;
  boomV: number;
  armV: number;
  bucketV: number;
  // controls
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  trackL: number;
  trackR: number;
  pattern: Pattern;
  locked: boolean; // PPC lock lever up: no hydraulics
  travelHigh: boolean;
  dial: number; // fuel dial 0…1
  mode: WorkMode;
  swingPriority: boolean;
  pmT: number; // power max seconds left
  horn: boolean;
  // engine
  engine: Engine;
  startT: number;
  rpm: number;
  idleT: number;
  load: number;
  relief: boolean;
  fuelL: number;
  // setup
  armId: ArmId;
  shoe: ShoeId;
  tool: ToolId;
  gaugeWide: boolean;
  under: 'track' | 'pontoon';
  /** auxiliary hydraulics: breaker hammering (held), grapple jaws closed */
  aux: boolean;
  auxPrev: boolean;
  swapT: number;
  swapTo: ToolId;
  props: Prop[];
  rain: boolean;
  broken: number;
  rodeo: { start: number; ball: boolean; egg: boolean; tires: boolean; time: number };
  hammerT: number;
  // bucket contents (loose m³)
  vol: number;
  kind: Soil;
  stuck: number;
  // belts (m/s)
  belt: [number, number];
  contacts: Contact[];
  bucketS: THREE.Vector3[];
  // last step's torques on the joints from soil and ground (N·m, + = towards boom up / arm out / bucket dump)
  tau: { boom: number; arm: number; bucket: number };
  cutting: number; // cut depth (m) now
  blocked: boolean; // the edge meets rock or the bucket is full: it pushes instead of cutting
  cutSoil: Soil;
  prevTip: THREE.Vector3;
  // world
  trucks: Truck[];
  job: JobId;
  time: number;
  failed: Fail;
  msg: string;
  events: string[];
  spotter: '' | 'ok' | 'pelan' | 'stop';
  utilDist: number;
  lineDist: number;
  tilt: number;
  stats: { dugM3: number; truckKg: number; trucks: number; overload: number; spilledM3: number; hits: number; fuelAtStart: number };
}

// ---------- geometry ----------
export const armLen = (c: Exc) => ARMS[c.armId].len;
export const bucketCap = (c: Exc) => ARMS[c.armId].bucket;
const toolLen = (c: Exc) => (c.tool === 'breaker' ? 2.4 : c.tool === 'grapple' ? 2.2 : SPEC.bucketLen * Math.cbrt(bucketCap(c) / 3.1));
export const gauge = (c: Exc) => (c.gaugeWide ? SPEC.gauge : SPEC.gaugeRetracted);

const dir = (a: number, out = V()) => out.set(0, Math.sin(a), Math.cos(a));

/** Work equipment points in the upper frame. */
export function equipment(c: Exc) {
  const F = new THREE.Vector3(SPEC.boomFoot.x, SPEC.boomFoot.y, SPEC.boomFoot.z);
  const b = c.boom;
  const a = b + c.arm;
  const phi = a + c.bucket;
  const P1 = F.clone().addScaledVector(dir(b), SPEC.boomLen);
  const P2 = P1.clone().addScaledVector(dir(a), armLen(c));
  const L = toolLen(c);
  const T = P2.clone().addScaledVector(dir(phi), L);
  const H = P2.clone().addScaledVector(dir(phi + 0.95), L * 0.72); // heel: bottom of the bucket's back
  const B = P2.clone().addScaledVector(dir(phi + 0.55), L * 0.62); // centre of the load
  const mouthY = Math.sin(phi - Math.PI / 2); // up-component of the bucket's opening (upper frame)
  return { F, P1, P2, T, H, B, phi, mouthY };
}

const _m = new THREE.Matrix4();
const _mu = new THREE.Matrix4();
const _ry = new THREE.Matrix4();
/** carrier → world and upper → world matrices */
export function frames(c: Exc) {
  _m.compose(c.p, c.q, new THREE.Vector3(1, 1, 1));
  _ry.makeRotationY(c.swing);
  if (c.under === 'pontoon') _ry.setPosition(0, PONTOON.lift, 0);
  _mu.multiplyMatrices(_m, _ry);
  return { carrier: _m, upper: _mu };
}
export function upperToWorld(c: Exc, v: THREE.Vector3, out = V()) {
  return out.copy(v).applyMatrix4(frames(c).upper);
}
export function tipWorld(c: Exc) {
  return upperToWorld(c, equipment(c).T);
}
/** heading of the carrier (rad, 0 = +z) */
export function heading(c: Exc) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(c.q);
  return Math.atan2(f.x, f.z);
}

// ---------- create ----------
/** Custom amphibious undercarriage: two sealed pontoons with track chains round them, the upper raised on a frame. */
export const PONTOON = { x: 2.55, w: 2.6, len: 11, h: 2.0, lift: 1.05, kg: 18000 };

function makeContacts(c: Exc): Contact[] {
  const out: Contact[] = [];
  const g = gauge(c) / 2;
  if (c.under === 'pontoon') {
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++) out.push({ p: new THREE.Vector3(side * PONTOON.x, 0, -PONTOON.len / 2 + 0.8 + (i * (PONTOON.len - 1.6)) / 6), kind: 'track', side, upper: false, s: V(), load: 0 });
    for (const side of [-1, 1]) for (const z of [-PONTOON.len / 2, PONTOON.len / 2]) out.push({ p: new THREE.Vector3(side * PONTOON.x, 0.7, z), kind: 'track', side, upper: false, s: V(), load: 0 });
  }
  for (const side of c.under === 'pontoon' ? [] : [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = -SPEC.tumbler / 2 + (i * SPEC.tumbler) / 6;
      out.push({ p: new THREE.Vector3(side * g, 0, z), kind: 'track', side, upper: false, s: V(), load: 0 });
    }
    // sprocket and idler ends, a little up: they meet a step or a ramp first
    for (const z of [-SPEC.trackLen / 2 + 0.25, SPEC.trackLen / 2 - 0.25]) out.push({ p: new THREE.Vector3(side * g, 0.5, z), kind: 'track', side, upper: false, s: V(), load: 0 });
  }
  if (c.under === 'track') for (const z of [-1.4, 0, 1.4]) out.push({ p: new THREE.Vector3(0, 0.84, z), kind: 'belly', side: 0, upper: false, s: V(), load: 0 });
  // hull: counterweight, deck corners, cab and engine hood (only touch if it rolls over)
  const hull: [number, number, number][] = [
    [1.75, 1.6, -4.3],
    [-1.75, 1.6, -4.3],
    [1.8, 1.7, 1.4],
    [-1.8, 1.7, 1.4],
    [1.6, 4.0, 0.2],
    [-1.6, 3.6, -3.2],
    [0, 3.6, -4.2],
  ];
  for (const [x, y, z] of hull) out.push({ p: new THREE.Vector3(x, y, z), kind: 'hull', side: 0, upper: true, s: V(), load: 0 });
  return out;
}

export function create(): Exc {
  const terrain = createTerrain(shape);
  const c: Exc = {
    terrain,
    p: new THREE.Vector3(START.x, 0, START.z),
    q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), START.heading),
    v: V(),
    w: V(),
    swing: 0,
    boom: 0.35,
    arm: -2.3,
    bucket: -2.2,
    swingV: 0,
    boomV: 0,
    armV: 0,
    bucketV: 0,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    trackL: 0,
    trackR: 0,
    pattern: 'ISO',
    locked: false,
    travelHigh: false,
    dial: 0.85,
    mode: 'P',
    swingPriority: false,
    pmT: 0,
    horn: false,
    engine: 'off',
    startT: 0,
    rpm: 0,
    idleT: 0,
    load: 0,
    relief: false,
    fuelL: 980 * 0.8,
    armId: 'a36',
    shoe: 610,
    tool: 'bucket',
    gaugeWide: true,
    under: 'track',
    aux: false,
    auxPrev: false,
    swapT: 0,
    swapTo: 'bucket',
    props: [],
    rain: false,
    broken: 0,
    rodeo: { start: -1, ball: false, egg: false, tires: false, time: 0 },
    hammerT: 0,
    vol: 0,
    kind: Soil.Loose,
    stuck: 0,
    belt: [0, 0],
    contacts: [],
    bucketS: [V(), V(), V(), V()],
    tau: { boom: 0, arm: 0, bucket: 0 },
    cutting: 0,
    blocked: false,
    cutSoil: Soil.Topsoil,
    prevTip: V(),
    trucks: createTrucks(),
    job: 'truck',
    time: 0,
    failed: '',
    msg: '',
    events: [],
    spotter: '',
    utilDist: 99,
    lineDist: 99,
    tilt: 0,
    stats: { dugM3: 0, truckKg: 0, trucks: 0, overload: 0, spilledM3: 0, hits: 0, fuelAtStart: 0 },
  };
  c.contacts = makeContacts(c);
  c.props = createProps(terrain);
  // settle on the ground
  c.p.y = heightAt(terrain, c.p.x, c.p.z) + 0.02;
  c.prevTip.copy(tipWorld(c));
  c.stats.fuelAtStart = c.fuelL;
  return c;
}

export function setGauge(c: Exc, wide: boolean) {
  c.gaugeWide = wide;
  c.contacts = makeContacts(c);
}
export function setArm(c: Exc, a: ArmId) {
  if (c.vol > 0.05) return say(c, 'Kosongkan bucket dulu sebelum ganti arm.');
  c.armId = a;
  c.arm = Math.min(Math.max(c.arm, SPEC.armRange[0]), SPEC.armRange[1]);
}

export function say(c: Exc, m: string) {
  c.msg = m;
}

export function startEngine(c: Exc) {
  if (c.engine !== 'off' || c.failed) return;
  c.engine = 'starting';
  c.startT = c.time;
  c.events.push('start');
}
export function stopEngine(c: Exc) {
  if (c.engine === 'off') return;
  c.engine = 'off';
  c.events.push('stop');
}
export function powerMax(c: Exc) {
  if (c.engine !== 'running') return;
  c.pmT = SPEC.powerMax.seconds;
  c.events.push('powermax');
}

// ---------- masses ----------
export function machineMass(c: Exc) {
  return SPEC.mass.carrier + (c.under === 'pontoon' ? PONTOON.kg : SHOES[c.shoe].mass) + SPEC.mass.upper + SPEC.mass.boom + ARMS[c.armId].mass + TOOL_KG[c.tool] + bucketKg(c);
}
export const bucketKg = (c: Exc) => c.vol * (SOIL[c.kind].rho / SOIL[c.kind].swell) * 1000;

/** Centre of gravity in the carrier frame. */
function cgCarrier(c: Exc, e = equipment(c)) {
  const items: [number, THREE.Vector3][] = [
    [SPEC.mass.carrier + SHOES[c.shoe].mass, new THREE.Vector3(0, 0.75, 0)],
    [SPEC.mass.upper, new THREE.Vector3(0.1, 2.4, -1.75)],
    [SPEC.mass.boom, e.F.clone().lerp(e.P1, 0.45).add(new THREE.Vector3(0, 0.5, 0))],
    [ARMS[c.armId].mass, e.P1.clone().lerp(e.P2, 0.4)],
    [TOOL_KG[c.tool] + bucketKg(c), e.B],
  ];
  const cg = V();
  let m = 0;
  const ry = new THREE.Matrix4().makeRotationY(c.swing);
  if (c.under === 'pontoon') {
    ry.setPosition(0, PONTOON.lift, 0);
    items[0][0] += PONTOON.kg;
    items[0][1].y = 1.0;
  }
  items.forEach(([k, p], i) => {
    const w = i === 0 ? p : p.clone().applyMatrix4(ry);
    cg.addScaledVector(w, k);
    m += k;
  });
  return cg.divideScalar(m);
}

// ---------- the step ----------
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const approach = (v: number, t: number, r: number) => v + clamp(t - v, -r, r);

export function step(c: Exc, dt: number) {
  c.time += dt;
  engine(c, dt);
  for (const e of stepTrucks(c.trucks, dt, c.horn)) {
    c.events.push(e);
    if (e === 'truck-leave' || e === 'truck-overload') {
      const t = c.trucks.find((t) => t.state === 'leave' && t.s < 1)!;
      c.stats.trucks++;
      if (e === 'truck-overload') {
        c.stats.overload++;
        say(c, `Truk kelebihan muatan: ${Math.round(t.lastPct * 100)}% dari 55 t. Di tambang ini ditolak timbangan.`);
      } else say(c, `Truk berangkat: ${(t.lastPct * 55).toFixed(1)} t (${Math.round(t.lastPct * 100)}%).`);
    }
    if (e === 'truck-ready') say(c, 'Truk siap di bay: isi baknya. Klakson (B) untuk menyuruhnya berangkat.');
  }
  hydraulics(c, dt);
  const e = equipment(c);
  dig(c, dt, e);
  tools(c, dt, e);
  // body: two substeps for the stiff contacts
  for (let i = 0; i < 2; i++) body(c, dt / 2);
  hazards(c);
  // the ground settles
  relax(c.terrain, 2500);
}

function engine(c: Exc, dt: number) {
  const E = SPEC.engine;
  if (c.engine === 'starting' && c.time - c.startT > 1.3) c.engine = 'running';
  const neutral = Math.max(Math.abs(c.lx), Math.abs(c.ly), Math.abs(c.rx), Math.abs(c.ry), Math.abs(c.trackL), Math.abs(c.trackR)) < 0.05;
  c.idleT = neutral ? c.idleT + dt : 0;
  let target = 0;
  if (c.engine === 'running') {
    target = E.idle + c.dial * (E.highIdle - E.idle);
    if (c.idleT > 4) target = Math.min(target, E.decel); // auto deceleration
    if (c.idleT > 60) target = E.idle; // auto idle
    target -= 140 * c.load;
  } else if (c.engine === 'starting') target = 250;
  c.rpm = approach(c.rpm, target, dt * (target > c.rpm ? 900 : 1200));
  c.pmT = Math.max(0, c.pmT - dt);
  // fuel: ~215 g/kWh at load, plus idle
  if (c.engine === 'running') c.fuelL = Math.max(0, c.fuelL - (dt / 3600) * (6 + E.kw * c.load * 0.25));
}

/** Speed share the pumps can give, 0…1 of rated flow. */
function pumpAvail(c: Exc) {
  if (c.engine !== 'running') return 0;
  const k = c.mode === 'E' ? 0.86 : c.mode === 'L' ? 0.62 : 1;
  return k * clamp(c.rpm / SPEC.engine.rpm, 0, 1.08);
}

/** Lever commands from the pattern: swing (+ left), boom (+ up), arm (+ out), bucket (+ dump). */
export function commands(c: Exc) {
  if (c.locked || c.failed) return { swing: 0, boom: 0, arm: 0, bucket: 0 };
  if (c.pattern === 'ISO') return { swing: -c.lx, arm: c.ly, boom: -c.ry, bucket: c.rx };
  return { swing: -c.lx, boom: -c.ly, arm: c.ry, bucket: c.rx };
}

export function gravityTorques(c: Exc, e: ReturnType<typeof equipment>) {
  // about each joint axis (upper x); + raises (boom up / arm out / bucket dump)
  const g = (m: number, p: THREE.Vector3, piv: THREE.Vector3) => -m * G * (p.z - piv.z);
  const kB = SPEC.mass.bucket + bucketKg(c);
  const boomCg = e.F.clone().lerp(e.P1, 0.45);
  const armCg = e.P1.clone().lerp(e.P2, 0.4);
  const bucket = g(kB, e.B, e.P2);
  // the arm and bucket turn the other way round their pins: + is "out" / "dump", i.e. towards +angle
  const arm = g(ARMS[c.armId].mass, armCg, e.P1) + g(kB, e.B, e.P1);
  const boom = g(SPEC.mass.boom, boomCg, e.F) + g(ARMS[c.armId].mass, armCg, e.F) + g(kB, e.B, e.F);
  return { boom, arm, bucket };
}

function hydraulics(c: Exc, dt: number) {
  const cmd = commands(c);
  const S = SPEC;
  const avail = pumpAvail(c);
  const pm = c.pmT > 0 ? S.powerMax.gain : 1;
  const lift = c.mode === 'L' ? S.relief.heavyLift / S.relief.implement : 1;
  const e = equipment(c);
  const gr = gravityTorques(c, e);
  // total torque each joint works against, by direction (+ is towards up/out/dump)
  const tq = { boom: gr.boom + c.tau.boom, arm: gr.arm + c.tau.arm, bucket: gr.bucket + c.tau.bucket };
  const fn = [
    { k: 'boom' as const, c: cmd.boom, up: S.rate.boomUp, dn: S.rate.boomDown, fu: S.flow.boomUp, fd: S.flow.boomDown, cu: S.cap.boomUp * pm * lift, cd: S.cap.boomDown * pm },
    { k: 'arm' as const, c: cmd.arm, up: S.rate.armOut, dn: S.rate.armIn, fu: S.flow.armOut, fd: S.flow.armIn, cu: S.cap.armOut * pm, cd: S.cap.armIn * pm },
    { k: 'bucket' as const, c: cmd.bucket, up: S.rate.dump, dn: S.rate.curl, fu: S.flow.dump, fd: S.flow.curl, cu: S.cap.dump * pm, cd: S.cap.curl * pm },
  ];
  // flow demand
  const travelHi = c.travelHigh ? 1 : 0.67;
  const dSwing = Math.abs(cmd.swing) * S.flow.swing;
  const dTravel = (Math.abs(c.trackL) + Math.abs(c.trackR)) * S.flow.travel * (c.locked || c.failed ? 0 : 1);
  let dWork = 0;
  for (const f of fn) dWork += Math.abs(f.c) * (f.c > 0 ? f.fu : f.fd);
  let kSwing = 1;
  let kRest = 1;
  const total = dSwing + dTravel + dWork;
  if (total > avail) {
    if (c.swingPriority) {
      kSwing = Math.min(1, avail / Math.max(1e-6, dSwing));
      kRest = Math.max(0, avail - dSwing * kSwing) / Math.max(1e-6, dTravel + dWork);
    } else kSwing = kRest = avail / total;
  }
  if (avail <= 0) kSwing = kRest = 0;
  let power = 0;
  c.relief = false;
  // first pass: the speed each function would run at, and the power it takes against its load
  const rates: number[] = [];
  const pfs: number[] = [];
  let workW = 0;
  for (const f of fn) {
    const j = f.k;
    const want = f.c;
    const cap = want >= 0 ? f.cu : f.cd;
    const against = want >= 0 ? -tq[j] : tq[j];
    let pf = 1;
    if (Math.abs(want) > 0.02) {
      if (against >= cap) pf = 0;
      else pf = 1 - 0.45 * Math.max(0, against / cap);
      if (against < 0) pf = Math.min(1.25, 1 + (-against / cap) * 0.3);
    }
    const rate = want * (want >= 0 ? f.up : f.dn) * kRest * pf;
    rates.push(rate);
    pfs.push(pf);
    workW += Math.max(0, against) * Math.abs(rate);
  }
  // the engine can only give so much: ~80 % of its 363 kW reaches the cylinders
  const pMax = 0.8 * S.engine.kw * 1000 * (c.mode === 'E' ? 0.86 : 1) * pm * clamp(c.rpm / S.engine.rpm, 0, 1);
  const kPow = workW > pMax && workW > 0 ? pMax / workW : 1;
  let fi = 0;
  for (const f of fn) {
    const j = f.k;
    const want = f.c;
    const cap = want >= 0 ? f.cu : f.cd;
    // torque against the motion (positive = resisting)
    const against = want >= 0 ? -tq[j] : tq[j];
    let pf = pfs[fi] * (against > 0 ? kPow : 1);
    const rate0 = rates[fi++] * (against > 0 ? kPow : 1);
    if (Math.abs(want) > 0.02 && against >= cap) c.relief = true;
    if (kPow < 1 && against > 0) pf = Math.min(pf, 0.99);
    const rate = rate0;
    const vKey = (j + 'V') as 'boomV' | 'armV' | 'bucketV';
    // valve and oil response when speeding up; a load stops it at once (the oil does not compress much)
    if (Math.abs(rate) < Math.abs(c[vKey]) && Math.sign(rate) === Math.sign(c[vKey]) && pf < 1) c[vKey] = rate;
    else c[vKey] = approach(c[vKey], rate, dt * 6);
    power += Math.abs(want) * Math.max(0, against / cap) * (want >= 0 ? f.fu : f.fd);
    const range = j === 'boom' ? S.boomRange : j === 'arm' ? S.armRange : S.bucketRange;
    let a = c[j] + c[vKey] * dt;
    // cylinder end cushions
    if (a <= range[0] || a >= range[1]) c[vKey] = 0;
    a = clamp(a, range[0], range[1]);
    c[j] = a;
  }
  // swing: motor torque limited, holding brake when neutral
  const swTarget = cmd.swing * ((S.swingRpm * 2 * Math.PI) / 60) * kSwing;
  const inertia = 1 + (bucketKg(c) / 6000) * 0.4;
  const acc = Math.abs(swTarget) > Math.abs(c.swingV) && Math.sign(swTarget) === Math.sign(c.swingV || swTarget) ? 0.42 / inertia : 0.75 / inertia;
  c.swingV = approach(c.swingV, swTarget, acc * dt);
  if (Math.abs(cmd.swing) < 0.02 && Math.abs(c.swingV) < 0.01) c.swingV = 0;
  c.swing += c.swingV * dt;
  power += Math.abs(cmd.swing) * 0.25 * S.flow.swing;
  // tracks
  const vmax = ((c.travelHigh ? S.travelKmh[1] : S.travelKmh[0]) / 3.6) * (c.locked || c.failed ? 0 : 1);
  const tgt = [c.trackL * vmax * Math.min(1, kRest * 1.6), c.trackR * vmax * Math.min(1, kRest * 1.6)];
  for (let i = 0; i < 2; i++) c.belt[i] = approach(c.belt[i], c.engine === 'running' ? tgt[i] : 0, dt * 0.9);
  power += dTravel * 0.6 * travelHi;
  c.load = clamp(power + total * 0.15, 0, 1);
}

// ---------- digging ----------
const _ax = V();
function dig(c: Exc, dt: number, e: ReturnType<typeof equipment>) {
  const t = c.terrain;
  const U = frames(c).upper;
  const T = e.T.clone().applyMatrix4(U);
  _ax.set(1, 0, 0).transformDirection(U); // across the bucket
  const cap = bucketCap(c);
  c.cutting = 0;
  // soil resistance on the joints (recomputed below)
  c.tau.boom = c.tau.arm = c.tau.bucket = 0;
  if (c.tool === 'bucket') {
    // sweep the cutting edge from where it was to where it is
    const W = SPEC.bucketW * Math.cbrt(cap / 3.1);
    const steps = Math.max(1, Math.ceil(c.prevTip.distanceTo(T) / (CELL * 0.7)));
    let bank = 0;
    let depth = 0;
    const bySoil = new Float32Array(7);
    let blocked = false;
    let rock = false;
    // soil goes into the bucket when the edge moves the way the mouth faces (a drag); pushed in edge-first it is
    // mostly shoved aside
    const v0 = edgeVelocity(c, e).normalize();
    const eff = 0.1 + 0.9 * Math.pow(clamp(v0.dot(dir(e.phi - Math.PI / 2)), 0, 1), 2);
    for (let s = 1; s <= steps; s++) {
      const P = c.prevTip.clone().lerp(T, s / steps);
      for (let u = -W / 2; u <= W / 2 + 1e-6; u += CELL * 0.7) {
        const x = P.x + _ax.x * u;
        const z = P.z + _ax.z * u;
        const i = Math.round(toCell(x));
        const j = Math.round(toCell(z));
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = idx(i, j);
        const h = t.h[k];
        if (h <= P.y) continue;
        depth = Math.max(depth, h - P.y);
        const soil = surfaceSoil(t, k);
        if (soil === Soil.Rock) {
          blocked = true;
          rock = true;
          continue;
        }
        const room = cap * 1.12 - c.vol - bank * SOIL[soil].swell * eff;
        if (room <= 0) {
          blocked = true;
          continue;
        }
        const maxCut = room / SOIL[soil].swell / eff / (CELL * CELL);
        const [dv, sl] = cutCell(t, i, j, Math.max(P.y, h - maxCut));
        bank += dv;
        bySoil[sl] += dv;
      }
    }
    if (bank > 0) {
      let best = 0;
      for (let i = 1; i < 7; i++) if (bySoil[i] > bySoil[best]) best = i;
      const kind = best as Soil;
      const loose = (bySoil as unknown as number[]).reduce((a, v, i) => a + v * SOIL[i].swell, 0);
      if (c.vol < 0.05) c.kind = kind;
      else if (bySoil[best] * SOIL[best].swell > c.vol) c.kind = kind;
        c.vol += loose * eff;
      c.stats.dugM3 += bank * eff;
      // the rest heaves up beside the cut
      const aside = loose * (1 - eff);
      if (aside > 1e-4)
        for (const sgn of [-1, 1]) dropAt(t, T.x + _ax.x * sgn * (W / 2 + 0.7), T.z + _ax.z * sgn * (W / 2 + 0.7), aside / 2, Soil.Loose, 0.7);
      c.stuck = Math.max(c.stuck, c.vol * SOIL[c.kind].sticky);
    }
    c.blocked = blocked;
    // how deep the edge is buried: the ground beside the bucket and ahead of it, above the tip
    if (depth > 0.005 || blocked) {
      const side = W / 2 + 0.45;
      const ahead = edgeVelocity(c, e).normalize().transformDirection(U);
      const hs = [
        heightAt(t, T.x + _ax.x * side, T.z + _ax.z * side),
        heightAt(t, T.x - _ax.x * side, T.z - _ax.z * side),
        heightAt(t, T.x + ahead.x * 0.6, T.z + ahead.z * 0.6),
      ];
      depth = Math.max(depth, (hs[0] + hs[1] + hs[2]) / 3 - T.y);
    }
    if (depth > 0.02) {
      const soil = soilAt(t, T.x, T.z);
      c.cutSoil = soil;
      c.cutting = depth;
      // resistance along the edge's motion: soil cut + a full bucket pushing (drag), capped by rock
      const kc = rock ? Math.max(SOIL[soil].kc, 350e3) : SOIL[soil].kc * (blocked ? 1.3 : 1);
      // edge velocity (upper frame) from the joint rates; pulling the edge up out of the soil meets little
      const vel = edgeVelocity(c, e);
      const upward = vel.lengthSq() > 1e-9 ? vel.y / vel.length() : 0;
      const into = clamp(1 - 1.4 * upward, 0.12, 1);
      const F = Math.min(900e3, (kc * W * Math.min(depth, 1.6) * (1 + 2 * (1 - eff)) + (c.vol / cap) * 220e3) * into);
      if (vel.lengthSq() > 1e-6) {
        const f = vel.normalize().multiplyScalar(-F); // force on the bucket, upper frame
        const r = (p: THREE.Vector3) => (e.T.y - p.y) * f.z - (e.T.z - p.z) * f.y; // torque about x
        // + torque is towards +angle in the frame where angles grow from +z to +y: τ_x = (r × f)_x = r_y f_z − r_z f_y
        c.tau.boom += -r(e.F);
        c.tau.arm += -r(e.P1);
        c.tau.bucket += -r(e.P2);
        // the soil pushes back only as hard as the cylinders push: past their relief the joint just stops
        const k = commands(c);
        const gr = gravityTorques(c, e);
        const pm = c.pmT > 0 ? SPEC.powerMax.gain : 1;
        let kf = 0;
        const joints: [number, number, number, number, number][] = [
          [k.boom, -r(e.F), gr.boom, SPEC.cap.boomUp, SPEC.cap.boomDown],
          [k.arm, -r(e.P1), gr.arm, SPEC.cap.armOut, SPEC.cap.armIn],
          [k.bucket, -r(e.P2), gr.bucket, SPEC.cap.dump, SPEC.cap.curl],
        ];
        for (const [cmd, tr, g, cu, cd] of joints) {
          if (Math.abs(cmd) < 0.02) continue;
          const push = (cmd > 0 ? cu : cd) * pm + Math.max(0, cmd > 0 ? g : -g); // cylinder + the weight helping
          kf = Math.max(kf, Math.min(1, push / Math.max(1, Math.abs(tr))));
        }
        resist.copy(f).transformDirection(U).multiplyScalar(F * kf);
        resistAt.copy(T);
      }
    } else resist.set(0, 0, 0);
    // spill when tipped, sticky soil holds a part
    // in the ground the soil holds the load in; out of it, it spills when tipped
    const Bw = e.B.clone().applyMatrix4(U);
    const buried = depth > 0.05 || Bw.y < heightAt(t, Bw.x, Bw.z) + 0.05;
    if (c.vol > 0 && !buried) {
      const mouth = e.mouthY;
      const hold = cap * clamp(0.45 + 0.75 * mouth, 0, 1.1);
      const keep = Math.max(hold, Math.min(c.vol, c.stuck));
      if (c.vol > keep + 1e-4) {
        const out = Math.min(c.vol - keep, (c.vol - keep + 0.1) * dt * 2);
        spill(c, out, T, e);
      }
      if (mouth < -0.3) c.stuck = Math.max(0, c.stuck - dt * 0.15); // shaking it off slowly
    }
  } else resist.set(0, 0, 0);
  c.prevTip.copy(T);
}
const resist = V();
const resistAt = V();

function edgeVelocity(c: Exc, e: ReturnType<typeof equipment>) {
  // ω × r for each joint about the upper x axis (angle grows from +z towards +y)
  const v = V();
  const add = (w: number, piv: THREE.Vector3) => {
    const ry = e.T.y - piv.y;
    const rz = e.T.z - piv.z;
    v.y += w * rz;
    v.z -= w * ry;
  };
  add(c.boomV, e.F);
  add(c.armV + c.boomV, e.P1);
  add(c.bucketV + c.armV + c.boomV, e.P2);
  // command intent when stalled: keep a direction
  if (v.lengthSq() < 1e-6) {
    const k = commands(c);
    add(k.boom * 0.1, e.F);
    add((k.arm + k.boom) * 0.1, e.P1);
    add((k.bucket + k.arm + k.boom) * 0.1, e.P2);
  }
  return v;
}

function spill(c: Exc, vol: number, T: THREE.Vector3, e: ReturnType<typeof equipment>) {
  const kind = c.kind;
  const kg = vol * (SOIL[kind].rho / SOIL[kind].swell) * 1000;
  c.vol -= vol;
  if (c.vol < 1e-3) {
    c.vol = 0;
    c.stuck = 0;
  }
  c.stuck = Math.min(c.stuck, c.vol);
  // falls from the lip (between the tip and the load centre)
  const P = T.clone().lerp(e.B.clone().applyMatrix4(frames(c).upper), 0.4);
  for (const tr of c.trucks) {
    if (overBed(tr, P.x, P.y, P.z)) {
      tr.kg += kg;
      tr.m3 += vol;
      c.stats.truckKg += kg;
      if (vol > 0.3) tr.passes++;
      c.events.push('truck-load');
      return;
    }
  }
  c.stats.spilledM3 += vol;
  dropAt(c.terrain, P.x, P.z, vol, kind === Soil.Rock ? Soil.Broken : kind === Soil.Broken ? Soil.Broken : Soil.Loose, 0.6 + Math.min(1.2, vol));
  if (vol > 0.2) c.events.push('dump');
}

// ---------- body ----------
const I_BODY = new THREE.Vector3(850e3, 900e3, 320e3);
const _rot = new THREE.Matrix3();
const _f = V();
const _tq = V();
const _pw = V();
const _r = V();
const _vp = V();
const _n = V();
const _vt = V();
const _belt = V();
const _fw = V();
const _tmp = V();

function contactForce(
  c: Exc,
  pw: THREE.Vector3,
  cg: THREE.Vector3,
  s: THREE.Vector3,
  k: number,
  damp: number,
  mu: number,
  beltSpeed: number | null,
  sinkScale: number,
  dt: number,
): number {
  const t = c.terrain;
  const gr = groundAt(t, pw.x, pw.z);
  const d = gr.h - pw.y;
  if (d <= 0) {
    s.set(0, 0, 0);
    return 0;
  }
  const soil = gr.mu === null ? soilAt(t, pw.x, pw.z) : Soil.Rock;
  const P = SOIL[soil];
  const [nx, ny, nz] = gr.n;
  _n.set(nx, ny, nz);
  _r.subVectors(pw, cg);
  _vp.crossVectors(c.w, _r).add(c.v);
  const vn = _vp.dot(_n);
  const sink = gr.mu === null ? P.sink * sinkScale : 0;
  const pen = d * ny;
  const elastic = pen < sink ? k * 0.035 * pen : k * (0.035 * sink + (pen - sink));
  const Fn = Math.max(0, elastic - damp * vn * (pen < sink ? 0.3 : 1));
  if (Fn <= 0) return 0;
  // tangential: bristle friction against the belt
  _vt.copy(_vp).addScaledVector(_n, -vn);
  if (beltSpeed !== null) {
    _belt.copy(_fw).multiplyScalar(beltSpeed);
    _belt.addScaledVector(_n, -_belt.dot(_n));
    _vt.sub(_belt);
  }
  const ks = k * 0.9;
  const ct = damp * 1.1;
  s.addScaledVector(_vt, dt);
  s.addScaledVector(_n, -s.dot(_n));
  _tmp.copy(s).multiplyScalar(-ks).addScaledVector(_vt, -ct);
  const lim = mu * (gr.mu ?? P.mu) * (c.rain && gr.mu === null ? 0.78 : 1) * Fn;
  const ft = _tmp.length();
  if (ft > lim) {
    _tmp.multiplyScalar(lim / ft);
    // the spring holds what static friction can
    s.copy(_tmp).multiplyScalar(-1).addScaledVector(_vt, -ct).divideScalar(ks);
  }
  _f.copy(_n).multiplyScalar(Fn).add(_tmp);
  return Fn;
}

function body(c: Exc, dt: number) {
  const { carrier, upper } = frames(c);
  const e = equipment(c);
  const cgB = cgCarrier(c, e);
  const cg = cgB.clone().applyMatrix4(carrier);
  const M = machineMass(c);
  const F = new THREE.Vector3(0, -M * G, 0);
  const Tq = V();
  _fw.set(0, 0, 1).transformDirection(carrier);
  const sinkScale = 122 / SHOES[c.shoe].kpa;
  const t = c.terrain;
  // clear the track-load marks
  for (const ct of c.contacts) {
    _pw.copy(ct.p).applyMatrix4(ct.upper ? upper : carrier);
    let belt: number | null = null;
    let k = 3.6e6;
    let damp = 1.5e5;
    let mu = 1;
    if (ct.kind === 'track') belt = c.belt[ct.side > 0 ? 0 : 1];
    else if (ct.kind === 'belly') {
      k = 2e6;
      mu = 0.9;
    } else {
      k = 2.5e6;
      damp = 1.2e5;
      mu = 0.6;
    }
    const fn = contactForce(c, _pw, cg, ct.s, k, damp, mu, belt, ct.kind === 'track' ? (c.under === 'pontoon' ? 0.05 : sinkScale) : sinkScale * 0.5, dt);
    ct.load = fn;
    if (c.under === 'pontoon' && ct.kind === 'track' && ct.p.y < 0.1) floatAt(c, _pw, cg, belt ?? 0, F, Tq);
    if (fn > 0) {
      F.add(_f);
      _r.subVectors(_pw, cg);
      Tq.add(_tmp.crossVectors(_r, _f));
      if (ct.kind === 'track') {
        // the wall under a loaded track gives way sooner
        const i = Math.round(toCell(_pw.x));
        const j = Math.round(toCell(_pw.z));
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= N || b >= N) continue;
            const q = idx(a, b);
            if (!t.load[q]) {
              t.load[q] = 1;
              loaded.push(q);
            }
            if (Math.random() < 0.02) t.active.add(q);
          }
      }
    }
  }
  // the bucket on the ground: teeth (when they cannot cut), heel, back, the arm's nose
  const pts = c.tool === 'bucket' ? [e.T, e.H, e.B, e.P2] : [e.T, e.P2];
  let tauB = 0;
  let tauA = 0;
  let tauK = 0;
  const inv = _inv.copy(upper).invert();
  const inCut = c.cutting > 0.02 && !c.blocked; // the bucket's body follows its edge through the cut
  pts.forEach((p, i) => {
    if (inCut && i <= 2) {
      c.bucketS[i].set(0, 0, 0);
      return;
    }
    _pw.copy(p).applyMatrix4(upper);
    const fn = contactForce(c, _pw, cg, c.bucketS[i], 3.2e6, 1.4e5, 0.9, null, 0.15, dt);
    if (fn <= 0) return;
    F.add(_f);
    _r.subVectors(_pw, cg);
    Tq.add(_tmp.crossVectors(_r, _f));
    // the same force on the joints, in the upper frame
    const f = _f.clone().transformDirection(inv).multiplyScalar(_f.length());
    const tx = (piv: THREE.Vector3) => (p.y - piv.y) * f.z - (p.z - piv.z) * f.y;
    tauB += -tx(e.F);
    tauA += -tx(e.P1);
    tauK += -tx(e.P2);
  });
  // cutting resistance acts on the machine too
  if (resist.lengthSq() > 0) {
    F.add(resist);
    _r.subVectors(resistAt, cg);
    Tq.add(_tmp.crossVectors(_r, resist));
  }
  // joints carry the ground force; past their holding relief they give way (and stop lifting the machine)
  yieldJoint(c, 'boom', tauB, dt);
  yieldJoint(c, 'arm', tauA, dt);
  yieldJoint(c, 'bucket', tauK, dt);
  c.tau.boom += tauB * 0.5;
  c.tau.arm += tauA * 0.5;
  c.tau.bucket += tauK * 0.5;
  // integrate
  c.v.addScaledVector(F, dt / M);
  _rot.setFromMatrix4(carrier);
  // world inertia I = R Ib Rᵀ  →  ω̇ = R Ib⁻¹ Rᵀ τ
  const tl = Tq.clone().applyMatrix3(_rot.clone().transpose());
  tl.set(tl.x / I_BODY.x, tl.y / I_BODY.y, tl.z / I_BODY.z).multiplyScalar(74500 / M);
  c.w.addScaledVector(tl.applyMatrix3(_rot), dt);
  c.w.multiplyScalar(1 - dt * 0.4);
  c.v.multiplyScalar(1 - dt * 0.05);
  // origin velocity = v + ω × (p − cg)
  _vp.subVectors(c.p, cg);
  const vo = _tmp.crossVectors(c.w, _vp).add(c.v);
  c.p.addScaledVector(vo, dt);
  const wq = new THREE.Quaternion(c.w.x * dt * 0.5, c.w.y * dt * 0.5, c.w.z * dt * 0.5, 0).multiply(c.q);
  c.q.set(c.q.x + wq.x, c.q.y + wq.y, c.q.z + wq.z, c.q.w + wq.w).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.q);
  c.tilt = Math.acos(clamp(up.y, -1, 1));
}
const loaded: number[] = [];
const _inv = new THREE.Matrix4();

function yieldJoint(c: Exc, j: 'boom' | 'arm' | 'bucket', tau: number, dt: number) {
  const S = SPEC.cap;
  const pm = c.pmT > 0 ? SPEC.powerMax.gain : 1;
  // the cylinder side that holds against this torque, its relief a little above the working relief
  const cap = 1.1 * pm * (j === 'boom' ? (tau > 0 ? S.boomDown : S.boomUp) : j === 'arm' ? (tau > 0 ? S.armIn : S.armOut) : tau > 0 ? S.curl : S.dump);
  if (Math.abs(tau) <= cap) return;
  const range = j === 'boom' ? SPEC.boomRange : j === 'arm' ? SPEC.armRange : SPEC.bucketRange;
  const rate = Math.sign(tau) * Math.min(0.6, ((Math.abs(tau) - cap) / cap) * 0.8);
  c[j] = clamp(c[j] + rate * dt, range[0], range[1]);
  c.relief = true;
}

// ---------- hazards ----------
function segDist(p: THREE.Vector3, a: [number, number], b: [number, number], y: number) {
  const ax = a[0];
  const az = a[1];
  const dx = b[0] - ax;
  const dz = b[1] - az;
  const k = clamp(((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(p.x - (ax + dx * k), p.y - y, p.z - (az + dz * k));
}

function hazards(c: Exc) {
  for (const i of loaded) c.terrain.load[i] = 0;
  loaded.length = 0;
  if (c.failed) return;
  const U = frames(c).upper;
  const e = equipment(c);
  const T = e.T.clone().applyMatrix4(U);
  const H = e.H.clone().applyMatrix4(U);
  const P2 = e.P2.clone().applyMatrix4(U);
  // buried services
  let dmin = 99;
  for (const u of UTILS) for (const p of [T, H]) dmin = Math.min(dmin, segDist(p, u.a, u.b, u.y) - u.r);
  c.utilDist = dmin;
  c.spotter = dmin < 1.0 ? 'stop' : dmin < 2.0 ? 'pelan' : dmin < 4 ? 'ok' : '';
  if (dmin < 0.08) {
    const u = UTILS.reduce((best, u) => (Math.min(segDist(T, u.a, u.b, u.y), segDist(H, u.a, u.b, u.y)) < Math.min(segDist(T, best.a, best.b, best.y), segDist(H, best.a, best.b, best.y)) ? u : best));
    fail(c, 'utility', u.id === 'gas' ? 'Bucket mengenai PIPA GAS. Gas menyembur: area dievakuasi.' : 'Bucket memutus KABEL FIBER OPTIK. Jaringan satu kawasan putus.');
  }
  // overhead line: three conductors 1 m apart, along z at x = POWERLINE.x
  const pts = [T, P2, e.P1.clone().applyMatrix4(U), e.F.clone().lerp(e.P1, 0.6).applyMatrix4(U)];
  let ld = 99;
  for (const p of pts)
    for (const dx of [-1, 0, 1]) if (p.z > POWERLINE.z0 && p.z < POWERLINE.z1) ld = Math.min(ld, Math.hypot(p.x - (POWERLINE.x + dx), p.y - POWERLINE.y));
  c.lineDist = ld;
  if (ld < 0.5) fail(c, 'powerline', 'Boom menyentuh kabel listrik 20 kV. Di lapangan ini fatal: jarak aman minimal 3 m.');
  // trucks
  for (const tr of c.trucks) {
    for (const p of [T, H, P2]) {
      const hit = truckHit(tr, p.x, p.y, p.z);
      if (hit === 'cab') fail(c, 'truck', 'Bucket menghantam kabin truk. Sopir di dalam: ini kecelakaan berat.');
      else if (hit === 'body' && c.time - lastHit > 1.2) {
        lastHit = c.time;
        c.stats.hits++;
        c.events.push('clang');
        say(c, 'Bucket membentur bak truk. Angkat lebih tinggi sebelum swing.');
      }
    }
  }
  if (c.tilt > (38 * Math.PI) / 180) fail(c, 'tipped', 'Excavator terguling. Beban terlalu jauh ke samping, atau tanah di bawah track runtuh.');
}
let lastHit = -9;

function fail(c: Exc, f: Fail, m: string) {
  if (c.failed) return;
  c.failed = f;
  c.events.push('fail-' + f);
  say(c, m);
}

// ---------- guidance and jobs ----------
/** The tooth tip against the job's design surface (positive = above the design). */
export function guidance(c: Exc) {
  const T = tipWorld(c);
  const d = design(c.job, T.x, T.z);
  return { tip: T, design: d, delta: d === null ? null : T.y - d };
}

export interface Progress {
  pct: number;
  good: number;
  over: number;
  todo: number;
  text: string;
}

/** Fraction of a design area dug to grade (±tol), over-dug cells, remaining. */
function gradeIn(c: Exc, x0: number, x1: number, z0: number, z1: number, f: (x: number, z: number) => number | null, tol = 0.06, fill = false) {
  const t = c.terrain;
  let n = 0;
  let good = 0;
  let over = 0;
  for (let j = Math.floor(toCell(z0)); j <= Math.ceil(toCell(z1)); j++)
    for (let i = Math.floor(toCell(x0)); i <= Math.ceil(toCell(x1)); i++) {
      const x = i * CELL - (N * CELL) / 2;
      const z = j * CELL - (N * CELL) / 2;
      const d = f(x, z);
      if (d === null) continue;
      n++;
      const h = t.h[idx(i, j)];
      if (fill ? h >= d - tol : Math.abs(h - d) <= tol) good++;
      else if (!fill && h < d - tol * 2) over++;
    }
  return { n, good, over };
}

export function progress(c: Exc): Progress {
  const p2 = phase2Progress(c);
  if (p2) return p2;
  if (c.job === 'truck') {
    const done = c.stats.trucks;
    const used = c.stats.fuelAtStart - c.fuelL;
    const t = c.stats.truckKg / 1000;
    return { pct: Math.min(1, done / 6), good: done, over: c.stats.overload, todo: Math.max(0, 6 - done), text: `${done}/6 truk · ${t.toFixed(0)} t dimuat · ${used > 0.05 ? (used / Math.max(0.1, t / 1.6)).toFixed(2) : '—'} L/m³ · benturan ${c.stats.hits}` };
  }
  if (c.job === 'trench') {
    const r = gradeIn(c, 12, 16, -47, -7, trenchDesign);
    return { pct: r.good / r.n, good: r.good, over: r.over, todo: r.n - r.good - r.over, text: `Dasar parit sesuai desain ±6 cm: ${Math.round((r.good / r.n) * 100)}% · terlalu dalam ${Math.round((r.over / r.n) * 100)}%` };
  }
  if (c.job === 'foundation') {
    const r = gradeIn(c, 33, 43, -25, -19, pitDesign, 0.05);
    return { pct: r.good / r.n, good: r.good, over: r.over, todo: r.n - r.good - r.over, text: `Dasar galian pondasi rata ±5 cm: ${Math.round((r.good / r.n) * 100)}% · terlalu dalam ${Math.round((r.over / r.n) * 100)}%` };
  }
  if (c.job === 'canal') {
    const k = gradeIn(c, CANAL.x0, CANAL.x1, CANAL.z - 4, CANAL.z + 4, (x, z) => {
      const C = CANAL;
      if (x < C.x0 || x > C.x1 || Math.abs(z - C.z) > C.bottom / 2) return null;
      return -0.25 - C.depth;
    }, 0.12);
    const r = gradeIn(c, ROAD.x0, ROAD.x1, ROAD.z0, ROAD.z1, (x, z) => (x < ROAD.x0 || x > ROAD.x1 || z < ROAD.z0 || z > ROAD.z1 ? null : ROAD.top), 0.12, true);
    const pct = (k.good / k.n) * 0.65 + (r.good / r.n) * 0.35;
    return { pct, good: k.good, over: k.over, todo: k.n - k.good, text: `Kanal ±12 cm: ${Math.round((k.good / k.n) * 100)}% · jalan kebun ditimbun: ${Math.round((r.good / r.n) * 100)}%` };
  }
  return { pct: 0, good: 0, over: 0, todo: 0, text: `Gali bebas · ${c.stats.dugM3.toFixed(0)} m³ tergali` };
}

// ---------- phase 2: tools, props, water, jobs ----------
export const TOOL_KG: Record<ToolId, number> = { bucket: SPEC.mass.bucket, breaker: 5600, grapple: 4200 };

/** Float the pontoons: buoyancy of each submerged column, water drag, the track cleats paddling. */
function floatAt(c: Exc, pw: THREE.Vector3, cg: THREE.Vector3, belt: number, F: THREE.Vector3, Tq: THREE.Vector3) {
  const t = c.terrain;
  const i = Math.round(toCell(pw.x));
  const j = Math.round(toCell(pw.z));
  if (i < 0 || j < 0 || i >= N || j >= N) return;
  const k = idx(i, j);
  const wl = t.water[t.zone[k]];
  if (t.h[k] >= wl || pw.y >= wl) return;
  const A = (PONTOON.len * PONTOON.w) / 7;
  const d = Math.min(PONTOON.h, wl - pw.y);
  _r.subVectors(pw, cg);
  _vp.crossVectors(c.w, _r).add(c.v);
  const f = new THREE.Vector3(0, 1000 * G * A * d - 3.5e4 * A * _vp.y, 0);
  const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(c.q);
  fw.y = 0;
  fw.normalize();
  const sub = d / PONTOON.h;
  // paddle thrust along the pontoon, drag against sideways and forward motion
  const vf = _vp.x * fw.x + _vp.z * fw.z;
  const thrust = 2.2e3 * A * sub * (belt * 0.45 - vf);
  f.x += fw.x * thrust - 900 * A * sub * (_vp.x - fw.x * vf);
  f.z += fw.z * thrust - 900 * A * sub * (_vp.z - fw.z * vf);
  F.add(f);
  Tq.add(new THREE.Vector3().crossVectors(_r, f));
}

export function setUnder(c: Exc, u: 'track' | 'pontoon') {
  if (c.under === u) return;
  c.under = u;
  c.contacts = makeContacts(c);
  c.p.y += u === 'pontoon' ? 0.5 : 0;
  say(c, u === 'pontoon' ? 'Undercarriage amfibi (kustom): dua ponton 11 m dengan rantai track, mesin naik 1 m. Bisa mengapung di rawa.' : 'Undercarriage track standar terpasang.');
}

export function setRain(c: Exc, on: boolean) {
  if (c.rain === on) return;
  c.rain = on;
  c.terrain.wet = on;
  for (let z = 0; z < c.terrain.water.length; z++) c.terrain.water[z] += on ? 0.45 : -0.45;
  c.terrain.dirty = [0, 0, N - 1, N - 1];
}

/** Quick coupler: swap the tool at the rack (the old one is set down, the new one picked up). */
export function swapTool(c: Exc, tool: ToolId) {
  if (c.tool === tool || c.swapT > 0) return;
  if (c.vol > 0.05) return say(c, 'Kosongkan bucket dulu.');
  const T = tipWorld(c);
  if (Math.hypot(T.x - RACK.x, T.z - RACK.z) > 4.5) return say(c, 'Ganti attachment di rak quick coupler (dekat titik awal): bawa ujung arm ke rak dulu.');
  c.swapT = 3;
  c.swapTo = tool;
  c.aux = false;
  c.events.push('coupler');
}

const _tp = V();
function tools(c: Exc, dt: number, e: ReturnType<typeof equipment>) {
  if (c.swapT > 0) {
    c.swapT -= dt;
    if (c.swapT <= 0) {
      c.tool = c.swapTo;
      c.events.push('coupler');
      say(c, c.tool === 'breaker' ? 'Breaker terpasang. Tekan ujung chisel ke batu, tahan R untuk memalu.' : c.tool === 'grapple' ? 'Grapple terpasang. R menutup / membuka capit.' : 'Bucket terpasang.');
    }
  }
  const U = frames(c).upper;
  const T = e.T.clone().applyMatrix4(U);
  const t = c.terrain;
  // breaker: hammering on rock breaks it up under the chisel
  if (c.tool === 'breaker' && c.aux && c.engine === 'running' && !c.locked) {
    c.hammerT += dt;
    const g = groundAt(t, T.x, T.z).h;
    if (T.y < g + 0.12) {
      const ci = toCell(T.x);
      const cj = toCell(T.z);
      for (let j = Math.floor(cj - 2); j <= Math.ceil(cj + 2); j++)
        for (let i = Math.floor(ci - 2); i <= Math.ceil(ci + 2); i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          if (Math.hypot(i - ci, j - cj) > 1.9) continue;
          const k = idx(i, j);
          if (t.h[k] - t.rock[k] < 0.25) {
            const dr = 0.22 * dt;
            t.rock[k] -= dr;
            c.broken += dr * CELL * CELL;
            t.dirty = [Math.min(t.dirty[0], i), Math.min(t.dirty[1], j), Math.max(t.dirty[2], i), Math.max(t.dirty[3], j)];
          }
        }
      if (c.hammerT > 0.09) {
        c.hammerT = 0;
        c.events.push('hammer');
      }
    }
  }
  // props
  const prev = (c as unknown as { _pp?: THREE.Vector3[] })._pp;
  const now = [e.T, e.H, e.B, e.P2].map((p) => p.clone().applyMatrix4(U));
  const pts: ToolPoint[] = now
    .filter((_, i) => c.tool === 'bucket' || i === 0 || i === 3)
    .map((p, i) => ({ p, v: prev ? p.clone().sub(prev[i] ?? p).divideScalar(dt) : V(), r: c.tool === 'bucket' ? 0.5 : 0.35 }));
  (c as unknown as { _pp?: THREE.Vector3[] })._pp = pts.map((q) => q.p);
  const justClosed = c.aux && !c.auxPrev;
  c.auxPrev = c.aux;
  for (const ev of stepProps(c.props, {
    t,
    pts,
    bucket: c.tool === 'bucket' ? { c: now[2], mouthY: e.mouthY } : null,
    grapple: c.tool === 'grapple' ? { c: _tp.copy(T), closed: c.aux, justClosed } : null,
    dt,
  })) {
    c.events.push(ev);
    if (ev === 'egg') say(c, 'Telurnya pecah. Coba lagi lebih halus (Mulai ulang Rodeo di tab Misi).');
  }
  rodeoCheck(c);
}

export function resetRodeo(c: Exc) {
  const fresh = createProps(c.terrain);
  c.props = c.props.filter((q) => q.kind === 'log').concat(fresh.filter((q) => q.kind !== 'log'));
  c.rodeo = { start: c.time, ball: false, egg: false, tires: false, time: 0 };
}

function rodeoCheck(c: Exc) {
  const R = c.rodeo;
  if (c.job !== 'rodeo') return;
  if (R.start < 0) R.start = c.time;
  const free = (q: Prop) => q.held === '';
  const ball = c.props.find((q) => q.kind === 'ball');
  const egg = c.props.find((q) => q.kind === 'egg');
  const D = RODEO.drum;
  const P = RODEO.pedestal;
  if (!R.ball && ball && free(ball) && Math.hypot(ball.p.x - D.x, ball.p.z - D.z) < D.r && ball.p.y < groundAt(c.terrain, D.x, D.z).h + D.h + 0.3) {
    R.ball = true;
    c.events.push('ding');
    say(c, 'Bola masuk drum!');
  }
  if (!R.egg && egg && free(egg) && !egg.broken && Math.hypot(egg.p.x - P.x, egg.p.z - P.z) < P.r && egg.p.y > groundAt(c.terrain, P.x, P.z).h + P.h && Math.abs(egg.v.y) < 0.05) {
    R.egg = true;
    c.events.push('ding');
    say(c, 'Telur di atas tiang, utuh!');
  }
  const tires = c.props.filter((q) => q.kind === 'tire');
  if (!R.tires && tires.every((q) => free(q) && Math.hypot(q.p.x - RODEO.ring.x, q.p.z - RODEO.ring.z) < RODEO.ring.r)) {
    R.tires = true;
    c.events.push('ding');
    say(c, 'Ketiga ban di dalam lingkaran!');
  }
  if (R.ball && R.egg && R.tires && !R.time) {
    R.time = c.time - R.start;
    say(c, `RODEO SELESAI dalam ${R.time.toFixed(0)} detik!`);
  }
}

export function phase2Progress(c: Exc): Progress | null {
  if (c.job === 'breaker') {
    const k = Math.min(1, c.broken / BREAK_GOAL);
    return { pct: k, good: 0, over: 0, todo: 0, text: `Batu dipecah ${c.broken.toFixed(1)} / ${BREAK_GOAL} m³ di tebing quarry (barat laut, x < ${QUARRY.x1}).` };
  }
  if (c.job === 'logs') {
    const n = c.props.filter((q) => q.kind === 'log' && q.held === '' && Math.hypot(q.p.x - LOG_STACK.x, q.p.z - LOG_STACK.z) < LOG_STACK.r).length;
    return { pct: n / LOGS.n, good: n, over: 0, todo: LOGS.n - n, text: `Kayu di area tumpukan: ${n}/${LOGS.n}` };
  }
  if (c.job === 'lowbed') {
    const L = LOWBED;
    const dx = c.p.x - L.x;
    const dz = c.p.z - L.z;
    const on = Math.abs(dx) < 0.6 && dz > L.z0 + 1.5 && dz < L.z1 - 1.5 && Math.abs(c.p.y - L.deck) < 0.2 && c.tilt < 0.06;
    const d = Math.hypot(dx, dz);
    return { pct: on ? 1 : Math.max(0, 1 - d / 60) * 0.8, good: on ? 1 : 0, over: 0, todo: 0, text: on ? 'Di atas lowbed, lurus dan rata. Siap diikat dan diangkut.' : `Jarak ke lowbed ${d.toFixed(0)} m · naik pelan lewat ramp belakang, track lurus.` };
  }
  if (c.job === 'amphib') {
    const d = Math.hypot(c.p.x - POND_GOAL.x, c.p.z - POND_GOAL.z);
    return { pct: d < 4 ? 1 : Math.max(0, 1 - d / 120), good: 0, over: 0, todo: 0, text: c.under !== 'pontoon' ? 'Pasang undercarriage amfibi (tab Setup), lalu seberangi rawa ke patok kuning.' : `Ke patok kuning di seberang rawa: ${d.toFixed(0)} m` };
  }
  if (c.job === 'rodeo') {
    const R = c.rodeo;
    const n = +R.ball + +R.egg + +R.tires;
    const time = R.time || (R.start >= 0 ? c.time - R.start : 0);
    return { pct: n / 3, good: n, over: 0, todo: 3 - n, text: `Bola ke drum ${R.ball ? '✓' : '·'} · telur ke tiang ${R.egg ? '✓' : '·'} · 3 ban ke lingkaran ${R.tires ? '✓' : '·'} · ${time.toFixed(0)} s` };
  }
  return null;
}
