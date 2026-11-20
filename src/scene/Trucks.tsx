// Rigid dump trucks (HD465-7 class, the usual match for a PC800): yellow frame and front deck with handrails and a
// ladder, radiator grille and deck lamps, the cab on the left of the deck, OTR lug tyres (dual rear), hydropneumatic
// struts, fuel and hydraulic tanks, the rock body with ribs, rails and the canopy over the cab. The body tips at the
// dump on two telescopic hoist cylinders; the load heap grows as it is filled. Parts are merged per material.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SOIL } from '../sim/terrain';
import { TRUCK, type Truck } from '../sim/trucks';
import { ex } from '../store';
import { K } from './PC800';
import { Kit, KitMesh, TM } from './truckKit';

type V3 = [number, number, number];

const OTR = { R: 1.15, W: 0.66, rimR: 0.62 };
const HINGE: V3 = [0, 1.95, TRUCK.bed.z0 + 0.2];

function lathe(profile: [number, number][], seg: number) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, a]) => new THREE.Vector2(r, a)),
    seg,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** One off-the-road tyre on its rim (outer face toward +x), lugs on the tread; dual = two side by side. */
function otrWheel(k: Kit, p: V3, dual: boolean, side: 1 | -1) {
  const { R, W, rimR } = OTR;
  const w = W / 2;
  const crown = R - 0.06;
  const half: [number, number][] = [
    [rimR + 0.02, -w * 0.8],
    [rimR + 0.08, -w * 0.95],
    [rimR + (crown - rimR) * 0.45, -w * 1.02],
    [crown - 0.1, -w * 0.97],
    [crown - 0.02, -w * 0.82],
    [crown, -w * 0.6],
  ];
  const prof = [...half, ...half.slice().reverse().map(([r, a]) => [r, -a] as [number, number])];
  const rot: V3 = side > 0 ? [0, 0, 0] : [0, Math.PI, 0];
  const at = (o: number): V3 => [p[0] + side * o, p[1], p[2]];
  const offs = dual ? [0.34, -0.34] : [0];
  for (const o of offs) {
    k.add(TM.rubber, lathe(prof, 40), at(o), rot);
    // chevron lugs: a bar from each shoulder toward the centre, the sides staggered
    const n = 26;
    for (const s of [-1, 1])
      for (let i = 0; i < n; i++) {
        const a = ((i + (s > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
        const bar = new THREE.BoxGeometry(w * 0.95, 0.12, 0.17);
        bar.rotateY(s * 0.35);
        bar.translate(s * w * 0.5, crown + 0.04, 0);
        bar.rotateX(a);
        k.add(TM.rubber, bar, at(o), rot);
      }
  }
  // rim: flange, dish, hub with studs
  const o = offs[0];
  const rimProf: [number, number][] = [
    [rimR + 0.05, w * 0.85],
    [rimR, w * 0.8],
    [rimR - 0.02, w * 0.5],
    [rimR * 0.75, w * 0.42],
    [rimR * 0.45, w * 0.55],
    [rimR * 0.3, w * 0.7],
    [0.001, w * 0.7],
  ];
  k.add(K.under, lathe(rimProf, 32), at(o), rot);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = at(o + w * 0.72);
    k.cyl(TM.steel, 0.035, 0.08, [c[0], c[1] + Math.cos(a) * rimR * 0.38, c[2] + Math.sin(a) * rimR * 0.38], 'x', 6);
  }
  k.cyl(K.steel, 0.14, 0.1, at(o + w * 0.75), 'x', 16);
}

/** Chassis, front deck, cab, tanks and wheels — everything that does not tip. */
function buildChassis(k: Kit, head: THREE.Material) {
  const Y = K.yellow;
  const D = K.yellowDark;
  // main frame, cross members, rear axle housing with final drives and differential
  for (const s of [1, -1]) k.box(K.under, [0.32, 0.62, 8.8], [s * 0.62, 1.3, 0]);
  for (const z of [3.6, 1.6, -0.4, -2.6, -4.2]) k.box(K.under, [1.0, 0.4, 0.3], [0, 1.3, z]);
  k.cyl(K.under, 0.34, 3.1, [0, 1.12, -1.6], 'x', 18);
  k.add(K.under, new THREE.SphereGeometry(0.62, 18, 12), [0, 1.12, -1.6], [0, 0, 0], [0.8, 1, 1]);
  for (const s of [1, -1]) k.cyl(K.under, 0.5, 0.35, [s * 1.2, 1.12, -1.6], 'x', 20);
  // rear suspension struts and the front ones (hydropneumatic), front axle
  for (const s of [1, -1]) {
    k.cyl(K.steel, 0.13, 0.9, [s * 0.95, 1.75, -0.9], 'y', 12);
    k.cyl(K.rod, 0.08, 0.5, [s * 0.95, 1.3, -0.9], 'y', 10);
    k.cyl(D, 0.2, 0.8, [s * 1.55, 1.85, 2.9], 'y', 14);
    k.cyl(K.rod, 0.11, 0.6, [s * 1.55, 1.3, 2.9], 'y', 12);
    k.cyl(K.under, 0.36, 0.5, [s * 1.75, 1.1, 2.9], 'x', 16);
  }
  // radiator housing and grille, front bumper with tow hooks
  k.box(Y, [2.6, 1.35, 1.0], [-0.1, 1.68, 4.15], undefined, 0.06);
  k.box(K.black, [2.2, 1.05, 0.04], [-0.1, 1.68, 4.67]);
  for (let i = 0; i < 9; i++) k.box(K.steel, [2.2, 0.035, 0.05], [-0.1, 1.22 + i * 0.115, 4.7]);
  k.box(D, [3.8, 0.55, 0.45], [0, 1.0, 4.85], undefined, 0.06);
  for (const s of [1, -1]) k.add(K.steel, new THREE.TorusGeometry(0.12, 0.04, 8, 16), [s * 1.1, 0.9, 5.1], [Math.PI / 2, 0, 0]);
  // front deck with checker plate, handrails and kick plates
  k.box(Y, [5.1, 0.14, 2.7], [0, 2.38, 3.25]);
  k.box(TM.checker, [5.0, 0.02, 2.6], [0, 2.46, 3.25]);
  k.box(D, [5.1, 0.25, 0.08], [0, 2.25, 4.6]);
  const rail = (a: [number, number], b: [number, number]) => {
    const [ax, az] = a;
    const [bx, bz] = b;
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (const y of [2.95, 3.5]) {
      const g = new THREE.CylinderGeometry(0.03, 0.03, len, 8);
      g.rotateX(Math.PI / 2);
      g.rotateY(yaw);
      k.add(Y, g, [(ax + bx) / 2, y, (az + bz) / 2]);
    }
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) k.cyl(Y, 0.03, 1.05, [ax + ((bx - ax) * i) / (n - 1), 2.98, az + ((bz - az) * i) / (n - 1)], 'y', 8);
  };
  rail([-2.5, 4.55], [-0.05, 4.55]);
  rail([-2.5, 4.55], [-2.5, 2.0]);
  rail([2.15, 4.55], [2.5, 4.55]);
  // deck lamps under the front edge, side lamps
  for (const x of [-2.0, -1.4, 1.4, 2.0]) {
    k.box(K.black, [0.4, 0.26, 0.15], [x, 2.08, 4.58], undefined, 0.03);
    k.box(head, [0.32, 0.18, 0.02], [x, 2.08, 4.66], undefined, 0.01);
  }
  for (const s of [1, -1]) k.box(TM.amber, [0.06, 0.12, 0.2], [s * 2.56, 2.3, 4.3]);
  // access ladder at the front left
  for (const z of [4.45, 4.95]) k.box(Y, [0.06, 2.3, 0.06], [-2.42, 1.2, z], [0.18, 0, 0]);
  for (let i = 0; i < 6; i++) k.box(TM.checker, [0.06, 0.04, 0.5], [-2.42, 0.4 + i * 0.36, 4.75 - (0.4 + i * 0.36 - 1.2) * 0.18]);
  // cab (left of the deck, ROPS): body, glass, roof, door, wipers, mirrors, beacon
  const cx = 1.1;
  const cz = 3.1;
  k.box(Y, [2.0, 0.6, 2.6], [cx, 2.75, cz], undefined, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(Y, [0.12, 1.45, 0.12], [cx + sx * 0.94, 3.75, cz + sz * 1.24]);
  k.box(Y, [2.1, 0.16, 2.7], [cx, 4.5, cz], undefined, 0.04);
  k.box(TM.glass, [1.78, 1.36, 0.02], [cx, 3.75, cz + 1.27]);
  k.box(TM.glass, [1.78, 1.36, 0.02], [cx, 3.75, cz - 1.27]);
  for (const sx of [-1, 1]) k.box(TM.glass, [0.02, 1.36, 2.38], [cx + sx * 0.97, 3.75, cz]);
  k.box(K.black, [0.015, 1.4, 0.03], [cx + 0.985, 3.6, cz - 0.2]);
  k.box(K.black, [0.03, 0.05, 0.18], [cx + 1.0, 3.45, cz - 0.4]);
  k.box(K.black, [0.7, 0.025, 0.02], [cx - 0.3, 3.15, cz + 1.29], [0, 0, 0.3]);
  k.box(K.black, [1.6, 0.05, 0.3], [cx, 4.4, cz + 1.4]);
  for (const [x, z] of [
    [2.45, 4.4],
    [-2.3, 4.3],
  ]) {
    k.cyl(K.black, 0.03, 1.2, [x, 3.3, z], 'y', 8);
    k.box(K.black, [0.1, 0.55, 0.4], [x, 4.0, z], undefined, 0.03);
    k.box(TM.mirror, [0.08, 0.5, 0.01], [x, 4.0, z - 0.21]);
  }
  // air cleaners and muffler on the deck left, fuel tank (left) and hydraulic tank (right) between the wheels
  for (const z of [3.9, 3.2]) {
    k.cyl(K.grey, 0.28, 0.9, [-1.5, 2.95, z], 'y', 16);
    k.cyl(K.black, 0.3, 0.1, [-1.5, 3.42, z], 'y', 16);
  }
  k.box(K.grey, [0.7, 0.6, 1.0], [-0.4, 2.8, 2.7], undefined, 0.05);
  k.box(Y, [1.0, 1.15, 1.9], [-1.95, 1.55, 0.7], undefined, 0.06);
  k.cyl(K.black, 0.1, 0.06, [-1.95, 2.15, 1.2], 'y', 12);
  k.box(D, [1.0, 1.15, 1.9], [1.95, 1.55, 0.7], undefined, 0.06);
  for (const s of [1, -1]) k.box(TM.checker, [0.5, 0.04, 0.4], [s * 2.25, 0.85, 1.3]);
  // rear lamps and mudguards behind the rear duals
  for (const s of [1, -1]) {
    k.box(K.black, [0.45, 0.25, 0.12], [s * 0.9, 1.5, -4.45], undefined, 0.02);
    k.box(TM.tail, [0.18, 0.16, 0.02], [s * 1.0, 1.5, -4.52]);
    k.box(TM.amber, [0.12, 0.16, 0.02], [s * 0.78, 1.5, -4.52]);
  }
  otrWheel(k, [2.15, 1.1, 2.9], false, 1);
  otrWheel(k, [-2.15, 1.1, 2.9], false, -1);
  otrWheel(k, [1.9, 1.1, -1.6], true, 1);
  otrWheel(k, [-1.9, 1.1, -1.6], true, -1);
}

/** The rock body in the hinge's frame: floor and tail, sloped sides with ribs, top rails, front wall, canopy. */
function buildBody(k: Kit) {
  const B = TRUCK.bed;
  const L = B.z1 - B.z0;
  const y = (v: number) => v - HINGE[1];
  const z = (v: number) => v - 0.2; // body z from the hinge
  const Y = K.yellow;
  const D = K.yellowDark;
  const hgt = B.rim - B.floor;
  // floor (and the upturned tail), under-beams and cross beams
  k.box(Y, [B.w, 0.2, L - 0.6], [0, y(B.floor), z(L / 2 + 0.3)]);
  k.box(Y, [B.w, 0.2, 0.9], [0, y(B.floor) + 0.18, z(0.25)], [0.4, 0, 0]);
  for (const s of [1, -1]) k.box(K.under, [0.3, 0.35, L - 0.3], [s * 0.6, y(B.floor) - 0.27, z(L / 2)]);
  for (let i = 1; i < 6; i++) k.box(K.under, [B.w - 0.4, 0.22, 0.2], [0, y(B.floor) - 0.2, z((L * i) / 6)]);
  k.cyl(K.steel, 0.12, 1.6, [0, y(B.floor) - 0.3, z(0.05)], 'x', 12);
  // side walls flaring out, vertical ribs outside, top rails
  for (const s of [1, -1]) {
    k.box(Y, [0.14, hgt, L], [s * (B.w / 2 + 0.05), y((B.rim + B.floor) / 2), z(L / 2)], [0, 0, s * 0.08]);
    for (let i = 0; i < 6; i++) k.box(D, [0.16, hgt - 0.2, 0.14], [s * (B.w / 2 + 0.17), y((B.rim + B.floor) / 2) - 0.05, z(0.5 + (i * (L - 1)) / 5)], [0, 0, s * 0.08]);
    k.box(D, [0.3, 0.22, L + 0.1], [s * (B.w / 2 + 0.2), y(B.rim) + 0.05, z(L / 2)]);
    k.box(D, [0.24, 0.3, 0.24], [s * (B.w / 2 + 0.2), y(B.rim) + 0.25, z(L - 0.6)]);
  }
  // front wall with ribs, canopy over the cab with ribs underneath, exhaust heating stub
  k.box(Y, [B.w + 0.2, hgt + 0.4, 0.16], [0, y((B.rim + B.floor) / 2) + 0.2, z(L)]);
  for (const x of [-1.4, 0, 1.4]) k.box(D, [0.16, hgt + 0.3, 0.16], [x, y((B.rim + B.floor) / 2) + 0.2, z(L) + 0.15]);
  const cy = y(B.rim) + 1.05;
  k.box(Y, [B.w + 0.4, 0.14, 2.9], [0, cy, z(L + 1.35)], [-0.06, 0, 0]);
  for (const x of [-1.6, -0.55, 0.55, 1.6]) k.box(D, [0.14, 0.16, 2.8], [x, cy - 0.15, z(L + 1.35)], [-0.06, 0, 0]);
  for (const s of [1, -1]) k.box(D, [0.16, 0.9, 2.9], [s * (B.w / 2 + 0.25), cy - 0.4, z(L + 1.35)], [-0.06, 0, 0]);
  k.cyl(K.black, 0.12, 0.6, [-1.6, y(B.rim) + 0.35, z(L) + 0.3], 'y', 10);
}

const UP = new THREE.Vector3(0, 1, 0);

function OneTruck({ t }: { t: Truck }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const heap = useRef<THREE.Mesh>(null);
  const hoist = useRef<THREE.Mesh[]>([]);
  const mat = useMemo(() => K.load.clone(), []);
  const B = TRUCK.bed;
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), u: new THREE.Vector3(), d: new THREE.Vector3() }), []);
  useFrame(() => {
    root.current!.position.set(t.x, 0, t.z);
    root.current!.rotation.y = t.heading;
    const ang = -t.tip * 0.85;
    body.current!.rotation.x = ang;
    const f = Math.min(1.25, t.kg / TRUCK.payloadKg);
    heap.current!.visible = f > 0.01;
    heap.current!.scale.set(B.w * 0.46, Math.max(0.05, f * 1.3), (B.z1 - B.z0) * 0.44);
    const [r, g, b] = SOIL[ex.kind].color;
    mat.color.setRGB(r, g, b);
    // hoist cylinders: frame pin to a pin under the body (rotated with it about the hinge)
    const by = B.floor - HINGE[1] - 0.4;
    const bz = 3.6;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    hoist.current.forEach((m, i) => {
      const x = i < 2 ? -1.15 : 1.15;
      tmp.a.set(x, 1.4, 0.6);
      tmp.u.set(x, HINGE[1] + by * c - bz * s, HINGE[2] + by * s + bz * c);
      tmp.d.subVectors(tmp.u, tmp.a);
      const len = tmp.d.length();
      const barrel = i % 2 === 0;
      const l = barrel ? Math.min(len, 1.3) : len;
      m.position.copy(tmp.a).addScaledVector(tmp.d, l / 2 / len);
      m.quaternion.setFromUnitVectors(UP, tmp.d.normalize());
      m.scale.set(1, l, 1);
    });
  });
  const cylGeo = useMemo(() => [new THREE.CylinderGeometry(0.17, 0.17, 1, 14), new THREE.CylinderGeometry(0.09, 0.09, 1, 10)], []);
  return (
    <group ref={root}>
      <KitMesh build={(k) => buildChassis(k, TM.head)} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => m && (hoist.current[i] = m)} geometry={cylGeo[i % 2]} material={i % 2 ? K.rod : K.yellowDark} castShadow />
      ))}
      {/* the body: hinge at the rear, canopy over the cab */}
      <group position={HINGE}>
        <group ref={body}>
          <KitMesh build={buildBody} />
          <mesh ref={heap} position={[0, B.floor - 1.95 + 0.1, (B.z1 - B.z0) / 2 - 0.2]} material={mat} castShadow>
            <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function Trucks() {
  return (
    <>
      {ex.trucks.map((t) => (
        <OneTruck key={t.id} t={t} />
      ))}
    </>
  );
}
