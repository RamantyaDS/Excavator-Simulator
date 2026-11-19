// Komatsu PC800-8E0, built to the brochure dimensions and the site photos: black undercarriage with 8 track rollers,
// 3 carrier rollers, double-grouser shoes that run with the travel motors, full-length roller guards; yellow upper with
// the counterweight (KOMATSU on the back), engine hood with the exhaust and pre-cleaner, radiator grille behind the
// cab, the right-hand tool box and tank compartment with the PC800 decal, catwalk and large handrails; the cab on the
// left with its front guard, wiper and mirrors. Work equipment: banana boom (KOMATSU on both sides) on twin boom
// cylinders, arm cylinder on top of the boom, the arm with its bucket cylinder and the I/H-link, the bucket with KMAX
// teeth and side cutters, hoses along the boom. Cylinders and links follow the sim's joint angles every frame.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { armLen, bucketCap, equipment, gauge } from '../sim/excavator';
import { SPEC } from '../sim/spec';
import { SOIL } from '../sim/terrain';
import { ex } from '../store';
import { Bake } from './Bake';
import { Box, Cyl, M, Pipe, useCanvasTexture } from './parts';
import { weather } from './weather';
import { BreakerMesh, GrappleMesh, Pontoons } from './Extras';
import { PONTOON } from '../sim/excavator';
import { useUI } from '../store';

export const K = {
  yellow: new THREE.MeshStandardMaterial({ color: '#f9c80e', metalness: 0.05, roughness: 0.4 }),
  yellowDark: new THREE.MeshStandardMaterial({ color: '#dfaa0c', metalness: 0.08, roughness: 0.48 }),
  grey: new THREE.MeshStandardMaterial({ color: '#6a6e72', metalness: 0.3, roughness: 0.55 }),
  black: new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.45, roughness: 0.55 }),
  under: new THREE.MeshStandardMaterial({ color: '#323437', metalness: 0.5, roughness: 0.6 }),
  shoe: new THREE.MeshStandardMaterial({ color: '#3a3733', metalness: 0.6, roughness: 0.62 }),
  steel: new THREE.MeshStandardMaterial({ color: '#6f7377', metalness: 0.75, roughness: 0.38 }),
  worn: new THREE.MeshStandardMaterial({ color: '#5a554e', metalness: 0.6, roughness: 0.55 }),
  rod: new THREE.MeshStandardMaterial({ color: '#e8ecee', metalness: 0.7, roughness: 0.22 }),
  hose: new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.1, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: '#1e2c34', metalness: 0.85, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 1.5 }),
  blue: new THREE.MeshStandardMaterial({ color: '#1d3f8f', metalness: 0.3, roughness: 0.4 }),
  load: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 }),
};

weather(K.yellow, { dirt: 0.14, mudBelow: 1.9, mud: 0.6, chips: 0.18, scale: 0.9 });
weather(K.yellowDark, { dirt: 0.2, mudBelow: 1.9, mud: 0.6, chips: 0.2, scale: 0.9 });
weather(K.grey, { dirt: 0.25, mudBelow: 2.4, mud: 0.4, chips: 0.12, dirtColor: '#4d4031' });
weather(K.black, { dirt: 0.35, mudBelow: 1.6, mud: 0.6, chips: 0.1, dirtColor: '#4d4031' });
weather(K.under, { dirt: 0.35, mudBelow: 1.3, mud: 0.8, chips: 0, rust: 0.06, dirtColor: '#4a3b2a' });
weather(K.shoe, { dirt: 0.45, mudBelow: 1.4, mud: 0.8, chips: 0, rust: 0.12, scale: 3, dirtColor: '#4f3f2c' });
weather(K.steel, { dirt: 0.4, mudBelow: 1.2, mud: 0.8, rust: 0.35, chips: 0 });
weather(K.worn, { dirt: 0.55, mudBelow: 99, mud: 0.4, rust: 0.7, chips: 0.1, scale: 2.2, dirtColor: '#5a4632' });

/** Registered so the camera and the lights can follow the parts. */
export const excObj: { carrier: THREE.Object3D | null; upper: THREE.Object3D | null; arm: THREE.Object3D | null; bucket: THREE.Object3D | null } = {
  carrier: null,
  upper: null,
  arm: null,
  bucket: null,
};

/** Extrude a side profile given as [z, y] points (local z forward, y up) across x, centred. */
function profile(pts: [number, number][], width: number, bevel = 0.04) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  // shape (x, y, extrude) → local (x = across, y, z = along)
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, width / 2 - bevel, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.computeVertexNormals();
  return g;
}

/** A bar from a to b (a unit-Y cylinder scaled). */
const _y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
function bar(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _d.subVectors(b, a);
  const l = _d.length();
  o.position.copy(a).addScaledVector(_d, 0.5);
  o.quaternion.setFromUnitVectors(_y, _d.divideScalar(l || 1));
  const r = (o.userData.r as number) ?? 1;
  o.scale.set(r, l, r);
}
/** Hydraulic ram between two pins: the barrel from the base, the rod from the end. */
function ram(barrel: THREE.Object3D, rod: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, barrelLen: number) {
  _d.subVectors(b, a);
  const l = _d.length();
  const u = _d.clone().divideScalar(l);
  const bl = Math.min(barrelLen, l - 0.2);
  bar(barrel, a, a.clone().addScaledVector(u, bl));
  bar(rod, a.clone().addScaledVector(u, bl - 0.1), b);
}

const UNIT = new THREE.CylinderGeometry(1, 1, 1, 16);

// ---------- undercarriage ----------
const TR = { R: 0.64, yC: 0.68, half: SPEC.tumbler / 2 + 0.05 };
const LOOP = 2 * (TR.half * 2) + 2 * Math.PI * TR.R;
export const trackRun = { l: 0, r: 0 };
function onLoop(s: number): [number, number, number] {
  // returns z, y, angle along the loop: bottom run forward, idler, top run back, sprocket
  s = ((s % LOOP) + LOOP) % LOOP;
  const L = TR.half * 2;
  if (s < L) return [-TR.half + s, TR.yC - TR.R, 0];
  s -= L;
  const arc = Math.PI * TR.R;
  if (s < arc) {
    const a = s / TR.R;
    return [TR.half + Math.sin(a) * TR.R, TR.yC - Math.cos(a) * TR.R, a];
  }
  s -= arc;
  if (s < L) return [TR.half - s, TR.yC + TR.R, Math.PI];
  s -= L;
  const a = s / TR.R;
  return [-TR.half - Math.sin(a) * TR.R, TR.yC + Math.cos(a) * TR.R, Math.PI + a];
}

function Track({ side }: { side: number }) {
  const shoes = useRef<THREE.InstancedMesh>(null);
  const n = SPEC.shoesPerSide;
  const geo = useMemo(() => {
    // shoe plate with two grousers
    const parts = [
      new THREE.BoxGeometry(0.61, 0.045, 0.24),
      new THREE.BoxGeometry(0.61, 0.055, 0.035).translate(0, -0.047, -0.065),
      new THREE.BoxGeometry(0.61, 0.045, 0.03).translate(0, -0.042, 0.055),
      // links (the chain the rollers run on) and the pin bosses
      new THREE.BoxGeometry(0.07, 0.11, 0.26).translate(-0.15, 0.075, 0),
      new THREE.BoxGeometry(0.07, 0.11, 0.26).translate(0.15, 0.075, 0),
      new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8).rotateZ(Math.PI / 2).translate(0, 0.08, 0.12),
      // bolt heads
      ...[-0.22, -0.08, 0.08, 0.22].map((x) => new THREE.BoxGeometry(0.035, 0.02, 0.035).translate(x, 0.03, 0.04)),
    ];
    const g = new THREE.BufferGeometry();
    const merged = mergeBoxes(parts);
    g.copy(merged);
    return g;
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const ax = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  useFrame(() => {
    const run = side > 0 ? trackRun.l : trackRun.r;
    for (let i = 0; i < n; i++) {
      const [z, y, a] = onLoop(-run + (i * LOOP) / n);
      q.setFromAxisAngle(ax, a);
      m.compose(new THREE.Vector3(0, y, z), q, new THREE.Vector3(1, 1, 1));
      shoes.current!.setMatrixAt(i, m);
    }
    shoes.current!.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={shoes} args={[geo, K.shoe, n]} castShadow receiveShadow frustumCulled={false} />;
}

function mergeBoxes(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of gs) {
    const g = g0.toNonIndexed();
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function TrackFrame() {
  // rollers, idler, sprocket, frame, guards (static, baked)
  return (
    <group>
      <Box s={[0.5, 0.62, SPEC.tumbler - 0.3]} m={K.under} position={[0, 0.7, 0]} />
      <Box s={[0.62, 0.08, SPEC.tumbler + 0.2]} m={K.under} position={[0, 1.06, 0]} />
      {/* full-length roller guard */}
      {[-1, 1].map((s) => (
        <Box key={s} s={[0.03, 0.34, SPEC.tumbler - 0.2]} m={K.black} position={[s * 0.33, 0.33, 0]} />
      ))}
      {Array.from({ length: SPEC.trackRollers }, (_, i) => (
        <Cyl key={i} r={0.13} l={0.56} axis="x" m={K.steel} position={[0, TR.yC - TR.R + 0.17, -SPEC.tumbler / 2 + 0.35 + (i * (SPEC.tumbler - 0.7)) / (SPEC.trackRollers - 1)]} seg={14} />
      ))}
      {Array.from({ length: SPEC.carrierRollers }, (_, i) => (
        <Cyl key={i} r={0.1} l={0.3} axis="x" m={K.steel} position={[0, TR.yC + TR.R - 0.13, -1.2 + i * 1.2]} seg={12} />
      ))}
      {/* idler (front) with the hydraulic adjuster */}
      <Cyl r={TR.R - 0.08} l={0.42} axis="x" m={K.under} position={[0, TR.yC, TR.half]} seg={24} />
      {[-0.17, 0.17].map((x) => (
        <Cyl key={x} r={TR.R - 0.03} l={0.06} axis="x" m={K.steel} position={[x, TR.yC, TR.half]} seg={28} />
      ))}
      {/* track adjuster cover and the frame's side plates with lightening holes */}
      <Box s={[0.4, 0.3, 0.9]} m={K.under} position={[0, TR.yC + 0.05, TR.half - 0.75]} />
      {[-0.26, 0.26].map((x) => (
        <group key={x}>
          <Box s={[0.02, 0.5, SPEC.tumbler - 0.6]} m={K.under} position={[x, 0.74, 0]} />
          {[-1.2, 0, 1.2].map((z) => (
            <Cyl key={z} r={0.12} l={0.03} axis="x" m={K.black} position={[x * 1.05, 0.76, z]} seg={14} />
          ))}
        </group>
      ))}
      <Cyl r={0.2} l={0.48} axis="x" m={K.steel} position={[0, TR.yC, TR.half]} seg={16} />
      {/* sprocket and travel motor (rear) with its guard */}
      <Cyl r={TR.R - 0.1} l={0.16} axis="x" m={K.steel} position={[0, TR.yC, -TR.half]} seg={26} />
      {Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2;
        return <Box key={i} s={[0.12, 0.13, 0.11]} m={K.steel} position={[0, TR.yC + Math.cos(a) * (TR.R - 0.06), -TR.half + Math.sin(a) * (TR.R - 0.06)]} rotation={[-a, 0, 0]} />;
      })}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <Cyl key={'b' + i} r={0.025} l={0.2} axis="x" seg={6} m={K.black} position={[0, TR.yC + Math.cos(a) * 0.3, -TR.half + Math.sin(a) * 0.3]} />;
      })}
      <Cyl r={0.42} l={0.5} axis="x" m={K.under} position={[0.38, TR.yC, -TR.half]} seg={20} />
      <Box s={[0.08, 0.7, 0.9]} m={K.black} position={[0.66, TR.yC, -TR.half]} />
    </group>
  );
}

function Carrier() {
  const g = gauge(ex) / 2;
  return (
    <group>
      <Bake>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * g, 0, 0]} scale={[s, 1, 1]}>
            <TrackFrame />
          </group>
        ))}
        {/* H-leg centre frame, under cover, swing circle */}
        <Box s={[g * 2 - 0.4, 0.5, 1.5]} m={K.under} position={[0, 1.05, 0]} />
        <Box s={[1.4, 0.45, 2.6]} m={K.under} position={[0, 1.05, 0]} />
        <Box s={[1.3, 0.05, 2.2]} m={K.black} position={[0, 0.84, 0]} />
        <Cyl r={1.35} l={0.28} m={K.black} position={[0, 1.42, 0]} seg={40} />
        <Cyl r={1.2} l={0.12} m={K.steel} position={[0, 1.5, 0]} seg={40} />
      </Bake>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * g, 0, 0]}>
          <Track side={s} />
        </group>
      ))}
    </group>
  );
}

// ---------- upper ----------
function useGrille() {
  return useCanvasTexture(128, 128, (g) => {
    g.fillStyle = '#5a5e62';
    g.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 120; y += 6) {
      g.fillStyle = '#141516';
      g.fillRect(8, y, 112, 4);
      g.fillStyle = '#7a7e82';
      g.fillRect(8, y + 4, 112, 1);
    }
  });
}

function useCaution() {
  return useCanvasTexture(128, 128, (g) => {
    g.fillStyle = '#ffd400';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(64, 12);
    g.lineTo(118, 108);
    g.lineTo(10, 108);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd400';
    g.beginPath();
    g.moveTo(64, 30);
    g.lineTo(104, 100);
    g.lineTo(24, 100);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.fillRect(59, 50, 10, 30);
    g.fillRect(59, 86, 10, 9);
  });
}

function Decal({ side, z, y }: { side: 1 | -1; z: number; y: number }) {
  // the PC800 decal: black panel, blue stripes across the top, PC in yellow and 800 in white
  const tex = useCanvasTexture(256, 340, (g) => {
    g.fillStyle = '#16171a';
    g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#1f4fae';
    for (let i = 0; i < 3; i++) g.fillRect(70 - i * 18, 16 + i * 30, 186 + i * 18, 18);
    g.font = 'bold 86px Arial Black, Arial';
    g.fillStyle = '#f2b51b';
    g.fillText('PC', 22, 222);
    g.fillStyle = '#ffffff';
    g.fillText('800', 22, 318);
  });
  return (
    <mesh position={[side * 1.818, y, z]} rotation={[0, (side * Math.PI) / 2, 0]}>
      <planeGeometry args={[0.62, 0.82]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

function Rail({ pts }: { pts: [number, number, number][] }) {
  return <Pipe pts={pts} r={0.024} m={K.yellow} seg={pts.length * 6} />;
}

// Upper structure to the brochure's side and rear drawings: yellow house and counterweight up to 2.97 m on a dark deck
// band (1.56 m), the grey engine hood on top at the rear (3.62 m) with the exhaust (4.0 m), the radiator grille on the
// right rear, the cab (1.82 m long, roof at 3.54 m) on the left front, the tool box on the right front.
function Upper() {
  const grille = useGrille();
  const grilleMat = useMemo(() => weather(new THREE.MeshStandardMaterial({ map: grille, metalness: 0.4, roughness: 0.6 }), { dirt: 0.3, mudBelow: 2.4, mud: 0.4, chips: 0 }), [grille]);
  const caution = useCaution();
  const cautionMat = useMemo(() => new THREE.MeshStandardMaterial({ map: caution, roughness: 0.5 }), [caution]);
  const Y0 = SPEC.ringY;
  const D = Y0 + 1.41; // top of the yellow house
  const H = 3.62; // top of the engine hood
  return (
    <group>
      <Bake>
        {/* revolving frame: the dark band under the house, and its nose carrying the boom cylinder feet */}
        <Box s={[3.5, 0.3, 5.35]} m={K.under} position={[0, Y0 + 0.15, -0.72]} />
        <Box s={[1.9, 0.5, 0.55]} m={K.under} position={[SPEC.boomFoot.x, Y0 + 0.3, 1.95]} />
        {[-0.68, 0.68].map((d) => (
          <Box key={d} s={[0.2, 0.42, 0.45]} m={K.yellowDark} position={[SPEC.boomFoot.x + d, Y0 + 0.45, 2.0]} />
        ))}
        {/* counterweight: full width, well rounded */}
        <Box s={[3.62, 1.41, 0.98]} r={0.3} m={K.yellow} position={[0, Y0 + 0.705, -3.87]} />
        {[-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, D + 0.06, -3.85]} rotation={[0, Math.PI / 2, 0]} material={K.black}>
            <torusGeometry args={[0.1, 0.032, 8, 14]} />
          </mesh>
        ))}
        {/* house body */}
        <Box s={[3.62, 1.11, 3.62]} r={0.04} m={K.yellow} position={[0, Y0 + 0.855, -1.57]} />
        {/* right front: tank and tool box, checker plate on top, steps */}
        <Box s={[0.86, 1.11, 1.72]} r={0.04} m={K.yellow} position={[-1.38, Y0 + 0.855, 1.09]} />
        <Box s={[0.78, 0.03, 1.62]} m={M.checker} position={[-1.38, D + 0.015, 1.09]} />
        <Box s={[0.5, 0.03, 1.7]} m={M.checker} position={[-1.5, D + 0.015, -0.7]} />
        {[2.0, 2.45].map((y) => (
          <Box key={y} s={[0.3, 0.04, 0.42]} m={M.checker} position={[-1.95, y, 1.55]} />
        ))}
        <Cyl r={0.09} l={0.06} m={K.black} position={[-1.2, D + 0.04, 0.4]} seg={10} />
        {/* engine hood (grey) with panel seams, the air cleaner and the exhaust stack with its rain cap */}
        <Box s={[2.92, 0.65, 1.76]} r={0.05} m={K.grey} position={[-0.355, D + 0.325, -2.5]} />
        {[-1.95, -2.5, -3.05].map((z) => (
          <Box key={z} s={[2.8, 0.015, 0.02]} m={K.black} position={[-0.355, H + 0.005, z]} />
        ))}
        <Box s={[0.02, 0.015, 1.7]} m={K.black} position={[0.2, H + 0.005, -2.5]} />
        <Box s={[0.55, 0.28, 0.5]} r={0.04} m={K.grey} position={[0.55, H + 0.14, -2.05]} />
        <Cyl r={0.16} l={0.3} m={K.black} position={[0.55, H + 0.2, -2.7]} seg={12} />
        <Cyl r={0.13} l={0.42} m={K.black} position={[-0.25, H + 0.21, -2.35]} seg={14} />
        <Cyl r={0.16} l={0.05} m={K.black} position={[-0.25, H + 0.44, -2.38]} rotation={[0.3, 0, 0]} seg={14} />
        {/* radiator grille on the right rear, house top to deck */}
        <mesh position={[-1.818, (Y0 + 0.3 + H) / 2, -2.5]} rotation={[0, -Math.PI / 2, 0]} material={grilleMat}>
          <planeGeometry args={[1.7, 1.7]} />
        </mesh>
        {/* left side: door seams, latches, the step rungs in the middle door */}
        {[-1.06, -1.68, -2.09, -2.6].map((z) => (
          <Box key={z} s={[0.012, 1.0, 0.02]} m={K.black} position={[1.816, Y0 + 0.86, z]} />
        ))}
        {[
          [-0.2, 2.5],
          [-1.35, 2.55],
          [-2.35, 2.55],
        ].map(([z, y]) => (
          <Box key={z} s={[0.03, 0.07, 0.12]} m={K.black} position={[1.822, y, z]} />
        ))}
        {[1.95, 2.25, 2.6].map((y) => (
          <Box key={y} s={[0.04, 0.05, 0.3]} m={K.black} position={[1.82, y, -1.885]} />
        ))}
        {/* right side: door seams and latches, tool box door */}
        {[-0.45, -1.62, 0.25].map((z) => (
          <Box key={z} s={[0.012, 1.0, 0.02]} m={K.black} position={[-1.816, Y0 + 0.86, z]} />
        ))}
        {[
          [-1.0, 2.55],
          [1.1, 2.6],
        ].map(([z, y]) => (
          <Box key={z} s={[0.03, 0.07, 0.12]} m={K.black} position={[-1.822, y, z]} />
        ))}
        {/* caution stickers on the counterweight sides and the tool box front */}
        {[
          [1.818, Y0 + 1.0, -3.95, Math.PI / 2],
          [-1.818, Y0 + 1.0, -3.95, -Math.PI / 2],
          [-1.38, Y0 + 1.1, 1.955, 0],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, r, 0]} material={cautionMat}>
            <planeGeometry args={[0.26, 0.26]} />
          </mesh>
        ))}
        {/* grab handles by the right front steps */}
        {[2.3, 2.8].map((y) => (
          <Cyl key={y} r={0.02} l={0.45} m={K.yellow} position={[-1.86, y, 1.85]} />
        ))}
        {/* boom foot bracket */}
        <Box s={[1.5, 0.95, 1.2]} m={K.yellow} position={[SPEC.boomFoot.x, Y0 + 0.75, 0.75]} />
        {[-0.62, 0.62].map((d) => (
          <Box key={d} s={[0.12, 0.7, 0.8]} m={K.yellowDark} position={[SPEC.boomFoot.x + d, Y0 + 0.65, 1.55]} />
        ))}
        {/* steps up to the cab door */}
        <Box s={[0.42, 0.05, 0.5]} m={M.checker} position={[1.95, Y0 + 0.25, 1.5]} />
        {/* cab: yellow shell, black pillars and window frames, big tinted glass, front guard */}
        <group position={[1.15, Y0 + 0.3, 1.04]}>
          <Box s={[1.15, 0.12, 1.86]} m={K.black} position={[0, 0.06, 0]} />
          <Box s={[1.12, 0.34, 1.82]} r={0.04} m={K.yellow} position={[0, 0.29, 0]} />
          <Box s={[1.16, 0.12, 1.86]} r={0.05} m={K.yellow} position={[0, 1.62, -0.02]} />
          <Box s={[1.1, 1.2, 0.12]} m={K.yellow} position={[0, 1.04, -0.85]} />
          {/* pillars: front (raked), door post, rear */}
          {[-0.54, 0.54].map((x) => (
            <group key={x}>
              <Box s={[0.07, 1.2, 0.07]} m={K.black} position={[x, 1.04, 0.84]} rotation={[-0.1, 0, 0]} />
              <Box s={[0.07, 1.2, 0.06]} m={K.black} position={[x, 1.04, -0.13]} />
              <Box s={[0.07, 1.2, 0.06]} m={K.black} position={[x, 1.04, -0.78]} />
              <Box s={[0.05, 0.05, 1.62]} m={K.black} position={[x, 1.56, 0.03]} />
              <Box s={[0.05, 0.05, 1.62]} m={K.black} position={[x, 0.47, 0.03]} />
            </group>
          ))}
          {/* glass: windshield, lower front, both sides, roof */}
          <mesh position={[0, 1.04, 0.85]} rotation={[-0.1, 0, 0]} material={K.glass}>
            <boxGeometry args={[1.02, 1.16, 0.025]} />
          </mesh>
          <Box s={[0.95, 0.26, 0.02]} m={K.black} position={[0, 0.29, 0.915]} />
          <mesh position={[0, 0.29, 0.93]} material={K.glass}>
            <boxGeometry args={[1.0, 0.28, 0.02]} />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.555, 1.02, 0.03]} material={K.glass}>
              <boxGeometry args={[0.02, 1.1, 1.62]} />
            </mesh>
          ))}
          <mesh position={[0, 1.685, 0.25]} material={K.glass}>
            <boxGeometry args={[0.8, 0.02, 0.8]} />
          </mesh>
          {/* door handle, rain visor, the louvre low on the cab side, the cab front lamp */}
          <Box s={[0.04, 0.05, 0.16]} m={K.black} position={[0.585, 0.85, -0.05]} />
          <Box s={[1.1, 0.035, 0.25]} m={K.black} position={[0, 1.62, 0.98]} rotation={[0.25, 0, 0]} />
          <Box s={[0.02, 0.22, 0.24]} m={K.black} position={[0.566, 0.29, -0.55]} />
          <Cyl r={0.05} l={0.02} axis="z" m={M.lens} position={[0.4, 0.29, 0.94]} />
          {/* front guard: frame and vertical bars */}
          <Box s={[1.12, 0.07, 0.07]} m={K.black} position={[0, 1.6, 1.0]} />
          <Box s={[1.12, 0.07, 0.07]} m={K.black} position={[0, 0.36, 1.0]} />
          {[-0.54, 0.54].map((x) => (
            <Box key={x} s={[0.07, 1.3, 0.07]} m={K.black} position={[x, 0.98, 1.0]} />
          ))}
          {[-0.27, 0, 0.27].map((x) => (
            <Box key={x} s={[0.035, 1.24, 0.035]} m={K.black} position={[x, 0.98, 1.01]} />
          ))}
          {/* wiper parked on the left pillar */}
          <Box s={[0.02, 0.7, 0.02]} m={K.black} position={[0.42, 0.85, 0.9]} rotation={[0, 0, 0.12]} />
          {/* inside: seat, consoles with the joysticks, the colour monitor, travel levers */}
          <Box s={[0.5, 0.45, 0.5]} r={0.06} m={M.seat} position={[0, 0.55, -0.3]} />
          <Box s={[0.5, 0.75, 0.12]} r={0.05} m={M.seat} position={[0, 1.0, -0.58]} />
          {[-0.36, 0.36].map((x) => (
            <group key={x}>
              <Box s={[0.18, 0.3, 0.55]} m={K.black} position={[x, 0.5, -0.2]} />
              <Cyl r={0.025} l={0.22} m={K.black} position={[x, 0.72, -0.05]} />
            </group>
          ))}
          <Box s={[0.26, 0.2, 0.05]} m={M.dash} position={[0.35, 0.95, 0.7]} rotation={[-0.4, -0.3, 0]} />
          <Cyl r={0.025} l={0.6} m={K.black} position={[-0.12, 0.5, 0.55]} rotation={[0.4, 0, 0]} />
          <Cyl r={0.025} l={0.6} m={K.black} position={[0.12, 0.5, 0.55]} rotation={[0.4, 0, 0]} />
        </group>
        {/* mirrors: on the cab front corner and on the right front handrail */}
        <Cyl r={0.018} l={0.6} m={K.black} position={[1.78, 3.3, 1.9]} />
        <Box s={[0.05, 0.32, 0.22]} m={K.black} position={[1.84, 3.55, 1.9]} />
        <Cyl r={0.018} l={0.7} m={K.black} position={[-1.86, 3.3, 1.9]} />
        <Box s={[0.05, 0.32, 0.22]} m={K.black} position={[-1.86, 3.6, 1.9]} />
        {/* work lights: on the tool box, on the cab roof */}
        {[
          [-1.45, D + 0.1, 1.85],
          [1.35, 3.62, 1.8],
          [0.95, 3.62, 1.8],
        ].map(([x, y, z], i) => (
          <group key={i} position={[x, y, z]}>
            <Box s={[0.2, 0.16, 0.12]} m={K.black} />
            <Cyl r={0.06} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.07]} />
          </group>
        ))}
      </Bake>
      {/* KOMATSU on the back of the counterweight */}
      <Text position={[0, 2.45, -4.37]} rotation={[0, Math.PI, 0]} fontSize={0.5} color="#1d3f8f" fontWeight={900} letterSpacing={0.04}>
        KOMATSU
      </Text>
      <Decal side={1} z={-2.93} y={2.33} />
      <Decal side={-1} z={-1.2} y={2.4} />
      {/* handrails: behind the cab, on the left of the hood, along the right front */}
      <Bake shadows={false}>
        <Rail pts={[[1.7, 3.5, 0.15], [1.7, 3.8, -0.2], [1.7, 3.8, -0.5], [1.7, D, -0.6]]} />
        <Rail pts={[[1.7, D, -1.37], [1.7, 3.8, -1.37], [1.7, 3.8, -1.57], [1.7, D, -1.57]]} />
        <Rail pts={[[1.25, D, -1.75], [1.25, 4.0, -1.75], [1.25, 4.0, -3.2], [1.25, D, -3.2]]} />
        <Rail pts={[[-1.75, D, 1.9], [-1.75, D + 0.75, 1.85], [-1.75, D + 0.75, -1.45], [-1.75, D, -1.5]]} />
      </Bake>
    </group>
  );
}

// ---------- work equipment ----------
const BOOM_PTS: [number, number][] = [
  [-0.45, 0.1],
  [-0.25, 0.75],
  [1.2, 1.55],
  [2.6, 2.2],
  [3.7, 2.5],
  [4.6, 2.45],
  [5.6, 1.85],
  [7.2, 0.95],
  [8.45, 0.45],
  [8.6, -0.05],
  [8.3, -0.45],
  [7.0, 0.05],
  [5.4, 0.85],
  [4.5, 1.1],
  [3.2, 0.95],
  [1.6, 0.25],
  [0.6, -0.4],
  [-0.1, -0.55],
];
const ARM_PTS = (L: number): [number, number][] => [
  [-1.15, 1.05],
  [-0.75, 1.3],
  [-0.15, 0.95],
  [1.2, 0.6],
  [L - 0.5, 0.32],
  [L + 0.18, 0.18],
  [L + 0.18, -0.22],
  [L - 0.6, -0.32],
  [0.6, -0.48],
  [-0.4, -0.42],
  [-0.85, 0.15],
];
// bucket side profile [z (towards the teeth), y (towards the body)] for a 2.3 m bucket
const BUCKET_PTS: [number, number][] = [
  [-0.12, -0.12],
  [-0.38, 0.32],
  [-0.15, 0.95],
  [0.55, 1.38],
  [1.32, 1.3],
  [1.95, 0.72],
  [2.3, 0.08],
  [2.24, -0.08],
  [1.2, -0.12],
];

// pins of the linkage (boom frame, arm frame, bucket frame: [z, y])
const BOOM_CYL_BASE = new THREE.Vector3(0, SPEC.ringY + 0.45, 2.0); // upper frame
const BOOM_CYL_END: [number, number] = [3.66, 1.77];
const ARM_CYL_BASE: [number, number] = [4.54, 2.51];
const ARM_HEEL: [number, number] = [-1.0, 1.08];
const BKT_CYL_BASE: [number, number] = [0.35, 0.9];
const ARM_LINK = (L: number): [number, number] => [L - 0.48, 0.42];
const BKT_LINK: [number, number] = [-0.32, 0.5];
const I_LINK = 0.82;
const H_LINK = 0.9;

function BucketMesh() {
  const s = Math.cbrt(bucketCap(ex) / 3.1);
  const W = SPEC.bucketW * s;
  const pts = useMemo(() => BUCKET_PTS.map(([z, y]) => [z * s, y * s] as [number, number]), [s]);
  const side = useMemo(() => profile(pts, 0.06, 0), [pts]);
  const shell = useMemo(() => {
    // the wrap: back, bottom and lip as a bent plate across the width
    const curve = pts.slice(1, 7);
    const outer = curve.map(([z, y]) => [z, y] as [number, number]);
    const inner = curve
      .map(([z, y]) => {
        const c = [0.9 * s, 0.6 * s];
        const dz = c[0] - z;
        const dy = c[1] - y;
        const l = Math.hypot(dz, dy);
        return [z + (dz / l) * 0.07, y + (dy / l) * 0.07] as [number, number];
      })
      .reverse();
    return profile([...outer, ...inner], W - 0.1, 0);
  }, [pts, W, s]);
  return (
    <Bake>
      {[-1, 1].map((k) => (
        <mesh key={k} geometry={side} material={K.yellow} position={[k * (W / 2 - 0.03), 0, 0]} castShadow />
      ))}
      <mesh geometry={shell} material={K.worn} castShadow receiveShadow />
      {/* top back plate and the lugs for the pins */}
      <Box s={[W - 0.1, 0.08, 0.6 * s]} m={K.yellow} position={[0, -0.05 * s, -0.12 * s]} rotation={[0.5, 0, 0]} />
      {[-0.32, 0.32].map((x) => (
        <Box key={x} s={[0.1, 0.5, 0.55]} m={K.yellowDark} position={[x * s, 0.18 * s, -0.12 * s]} />
      ))}
      {/* lip, KMAX teeth (adapters + tips) and side cutters */}
      <Box s={[W, 0.07, 0.3]} m={K.steel} position={[0, 0.05 * s, 2.12 * s]} rotation={[0.25, 0, 0]} />
      {Array.from({ length: 5 }, (_, i) => {
        const x = -W / 2 + 0.2 + (i * (W - 0.4)) / 4;
        return (
          <group key={i} position={[x, 0.02 * s, 2.3 * s]} rotation={[0.18, 0, 0]}>
            <Box s={[0.16, 0.14, 0.3]} m={K.black} position={[0, 0, 0]} />
            <Box s={[0.13, 0.09, 0.26]} m={K.worn} position={[0, -0.01, 0.24]} />
          </group>
        );
      })}
      {[-1, 1].map((k) => (
        <Box key={k} s={[0.08, 0.35, 0.5]} m={K.steel} position={[k * (W / 2 + 0.02), 0.25 * s, 1.85 * s]} rotation={[0.7, 0, 0]} />
      ))}
      {/* wear strips under the bottom */}
      {[-0.5, 0, 0.5].map((x) => (
        <Box key={x} s={[0.08, 0.05, 0.9 * s]} m={K.steel} position={[x * W * 0.6, 1.34 * s, 1.0 * s]} rotation={[-0.25, 0, 0]} />
      ))}
    </Bake>
  );
}

/** Soil in the bucket: a heap that grows with the load. */
function Load() {
  const ref = useRef<THREE.Mesh>(null);
  const s = Math.cbrt(bucketCap(ex) / 3.1);
  const W = SPEC.bucketW * s;
  const mat = useMemo(() => K.load.clone(), []);
  useFrame(() => {
    const m = ref.current!;
    const f = Math.min(1.15, ex.vol / bucketCap(ex));
    m.visible = f > 0.02;
    m.scale.set(W * 0.45, 0.55 * s * Math.max(0.15, f), 0.85 * s * Math.sqrt(Math.max(0.1, f)));
    const [r, g, b] = SOIL[ex.kind].color;
    mat.color.setRGB(r * 0.9, g * 0.9, b * 0.9);
  });
  return (
    <mesh ref={ref} position={[0, 0.55 * s, 1.0 * s]} rotation={[0, 0, 0]} material={mat} castShadow>
      <sphereGeometry args={[1, 18, 10]} />
    </mesh>
  );
}

function Equipment() {
  const boom = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const bucket = useRef<THREE.Group>(null);
  const rams = { b1: useRef<THREE.Mesh[]>([]), b2: useRef<THREE.Mesh[]>([]), a: useRef<THREE.Mesh[]>([]), k: useRef<THREE.Mesh[]>([]) };
  const links = { i: useRef<THREE.Mesh[]>([]), h: useRef<THREE.Mesh[]>([]) };
  const La = armLen(ex);
  const boomGeo = useMemo(() => profile(BOOM_PTS, 1.0, 0.06), []);
  const armGeo = useMemo(() => profile(ARM_PTS(La), 0.72, 0.05), [La]);
  const s = Math.cbrt(bucketCap(ex) / 3.1);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }), []);

  useFrame(() => {
    const e = equipment(ex);
    boom.current!.position.copy(e.F);
    boom.current!.rotation.x = -ex.boom;
    arm.current!.rotation.x = -ex.arm;
    bucket.current!.rotation.x = -ex.bucket;
    // points in the upper frame from the frames' [z, y]
    const inBoom = (p: [number, number], x: number, out: THREE.Vector3) => {
      const b = ex.boom;
      return out.set(e.F.x + x, e.F.y + p[0] * Math.sin(b) + p[1] * Math.cos(b), e.F.z + p[0] * Math.cos(b) - p[1] * Math.sin(b));
    };
    const a = ex.boom + ex.arm;
    const inArm = (p: [number, number], x: number, out: THREE.Vector3) =>
      out.set(e.P1.x + x, e.P1.y + p[0] * Math.sin(a) + p[1] * Math.cos(a), e.P1.z + p[0] * Math.cos(a) - p[1] * Math.sin(a));
    const inBkt = (p: [number, number], x: number, out: THREE.Vector3) =>
      out.set(e.P2.x + x, e.P2.y + p[0] * s * Math.sin(e.phi) + p[1] * s * Math.cos(e.phi), e.P2.z + p[0] * s * Math.cos(e.phi) - p[1] * s * Math.sin(e.phi));
    // boom cylinders (both sides of the boom)
    for (const [r, x] of [
      [rams.b1, 0.68],
      [rams.b2, -0.68],
    ] as const) {
      const A = BOOM_CYL_BASE.clone().setX(e.F.x + x);
      const B = inBoom(BOOM_CYL_END, x, tmp.b);
      ram(r.current[0], r.current[1], A, B, 2.55);
    }
    // arm cylinder on top of the boom
    ram(rams.a.current[0], rams.a.current[1], inBoom(ARM_CYL_BASE, 0, tmp.a), inArm(ARM_HEEL, 0, tmp.b), 3.3);
    // bucket linkage: rod end where the I-link (from the arm) and the H-link (from the bucket) meet
    const A = inArm(ARM_LINK(La), 0, new THREE.Vector3());
    const Bp = inBkt(BKT_LINK, 0, new THREE.Vector3());
    const d = A.distanceTo(Bp);
    const r1 = I_LINK;
    const r2 = H_LINK;
    const aa = Math.min(d, Math.max(-d, (r1 * r1 - r2 * r2 + d * d) / (2 * Math.max(1e-3, d))));
    const h = Math.sqrt(Math.max(0, r1 * r1 - aa * aa));
    const ux = (Bp.z - A.z) / d;
    const uy = (Bp.y - A.y) / d;
    // the solution on the outer side of the arm (arm frame +y)
    const ny = Math.cos(a);
    const nz = -Math.sin(a);
    let R = new THREE.Vector3(0, A.y + uy * aa + ux * h, A.z + ux * aa - uy * h);
    const R2 = new THREE.Vector3(0, A.y + uy * aa - ux * h, A.z + ux * aa + uy * h);
    if ((R2.y - A.y) * ny + (R2.z - A.z) * nz > (R.y - A.y) * ny + (R.z - A.z) * nz) R = R2;
    for (const x of [0.28, -0.28]) {
      const i = links.i.current[x > 0 ? 0 : 1];
      const hh = links.h.current[x > 0 ? 0 : 1];
      if (i) bar(i, A.clone().setX(e.P1.x + x), R.clone().setX(e.P1.x + x));
      if (hh) bar(hh, Bp.clone().setX(e.P1.x + x), R.clone().setX(e.P1.x + x));
    }
    ram(rams.k.current[0], rams.k.current[1], inArm(BKT_CYL_BASE, 0, tmp.c), R.clone().setX(e.P1.x), Math.max(1.75, (La - 0.9) * 0.62));
    excObj.arm = arm.current;
    excObj.bucket = bucket.current;
  });

  const ramMesh = (ref: React.MutableRefObject<THREE.Mesh[]>, r: number, rr: number) => (
    <>
      <mesh geometry={UNIT} material={K.yellow} castShadow ref={(m) => m && (ref.current[0] = m)} userData={{ r }} />
      <mesh geometry={UNIT} material={K.rod} castShadow ref={(m) => m && (ref.current[1] = m)} userData={{ r: rr }} />
    </>
  );
  const linkMesh = (ref: React.MutableRefObject<THREE.Mesh[]>, i: number) => (
    <mesh geometry={UNIT} material={K.yellowDark} castShadow ref={(m) => m && (ref.current[i] = m)} userData={{ r: 0.09 }} />
  );

  return (
    <>
      <group ref={boom}>
        <Bake>
          <mesh geometry={boomGeo} material={K.yellow} castShadow receiveShadow />
          {/* foot pin boss, cylinder lugs, arm cylinder bracket on top, the head pin boss */}
          <Cyl r={0.42} l={1.25} axis="x" m={K.yellowDark} position={[0, 0, 0]} />
          <Cyl r={0.36} l={1.1} axis="x" m={K.yellowDark} position={[0, 0, 8.2]} />
          {[-0.6, 0.6].map((x) => (
            <Box key={x} s={[0.22, 0.42, 0.55]} m={K.yellowDark} position={[x, BOOM_CYL_END[1], BOOM_CYL_END[0]]} />
          ))}
          <Box s={[0.55, 0.5, 0.7]} m={K.yellowDark} position={[0, ARM_CYL_BASE[1] - 0.2, ARM_CYL_BASE[0]]} />
          {/* hoses along the top: from the foot over the knee to the arm and bucket cylinders */}
          {[-0.42, -0.32, 0.32, 0.42].map((x) => (
            <Pipe
              key={x}
              pts={[
                [x, 0.8, -0.2],
                [x, 1.65, 1.2],
                [x, 2.3, 2.6],
                [x, 2.62, 3.9],
                [x, 2.5, 4.8],
                [x, 1.9, 5.8],
                [x, 1.0, 7.3],
                [x, 0.55, 8.6],
              ]}
              r={0.035}
              m={K.hose}
              seg={40}
            />
          ))}
          {/* steel hydraulic lines along both sides, clamped */}
          {[-0.53, 0.53].map((x) => (
            <group key={x}>
              <Pipe pts={[[x, 0.2, 0.6], [x, 1.0, 2.4], [x, 1.25, 3.9], [x, 1.15, 5.0], [x, 0.65, 6.6], [x, 0.1, 7.8]]} r={0.03} m={K.steel} seg={30} />
              {[
                [2.4, 1.0],
                [3.9, 1.25],
                [5.0, 1.15],
                [6.6, 0.65],
              ].map(([z, y]) => (
                <Box key={z} s={[0.06, 0.12, 0.08]} m={K.black} position={[x, y, z]} />
              ))}
            </group>
          ))}
          {/* pin end caps */}
          {[-0.64, 0.64].map((x) => (
            <group key={x}>
              <Cyl r={0.2} l={0.05} axis="x" m={K.black} position={[x, 0, 0]} />
              <Cyl r={0.17} l={0.05} axis="x" m={K.black} position={[x * 0.88, 0, 8.2]} />
            </group>
          ))}
          {/* boom work light */}
          <group position={[0.52, 1.3, 2.1]}>
            <Box s={[0.12, 0.18, 0.2]} m={K.black} />
            <Cyl r={0.06} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.11]} />
          </group>
        </Bake>
        <Text position={[0.505, 0.85, 6.2]} rotation={[0.5, Math.PI / 2, 0]} fontSize={0.5} color="#1d3f8f" fontWeight={900} letterSpacing={0.03}>
          KOMATSU
        </Text>
        <Text position={[-0.505, 0.85, 6.2]} rotation={[0.5, -Math.PI / 2, 0]} fontSize={0.5} color="#1d3f8f" fontWeight={900} letterSpacing={0.03}>
          KOMATSU
        </Text>
        <group ref={arm} position={[0, 0, SPEC.boomLen]}>
          <Bake>
            <mesh geometry={armGeo} material={K.yellow} castShadow receiveShadow />
            <Cyl r={0.3} l={0.95} axis="x" m={K.yellowDark} position={[0, 0, 0]} />
            <Cyl r={0.26} l={0.85} axis="x" m={K.yellowDark} position={[0, 0, La]} />
            <Box s={[0.5, 0.45, 0.45]} m={K.yellowDark} position={[0, BKT_CYL_BASE[1] - 0.15, BKT_CYL_BASE[0]]} />
            <Box s={[0.85, 0.3, 0.35]} m={K.yellowDark} position={[0, ARM_LINK(La)[1], ARM_LINK(La)[0]]} />
            {[-0.2, 0.2].map((x) => (
              <Pipe key={x} pts={[[x, 1.25, -0.6], [x, 0.85, 0.4], [x, 0.95, 0.6]]} r={0.035} m={K.hose} seg={16} />
            ))}
          </Bake>
          <group ref={bucket} position={[0, 0, La]}>
            <ToolMesh />
          </group>
        </group>
      </group>
      {ramMesh(rams.b1, 0.17, 0.085)}
      {ramMesh(rams.b2, 0.17, 0.085)}
      {ramMesh(rams.a, 0.18, 0.09)}
      {ramMesh(rams.k, 0.15, 0.075)}
      {linkMesh(links.i, 0)}
      {linkMesh(links.i, 1)}
      {linkMesh(links.h, 0)}
      {linkMesh(links.h, 1)}
    </>
  );
}

/** The tool on the quick coupler. */
function ToolMesh() {
  useUI(() => ex.tool);
  if (ex.tool === 'breaker') return <BreakerMesh />;
  if (ex.tool === 'grapple') return <GrappleMesh />;
  return (
    <>
      <BucketMesh />
      <Load />
    </>
  );
}

export function PC800() {
  useUI(() => `${ex.under}${ex.gaugeWide}${ex.armId}`); // re-render only when the undercarriage or arm changes
  const root = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const last = useRef({ t: ex.time });
  useFrame(() => {
    root.current!.position.copy(ex.p);
    root.current!.quaternion.copy(ex.q);
    upper.current!.rotation.y = ex.swing;
    upper.current!.position.y = ex.under === 'pontoon' ? PONTOON.lift : 0;
    excObj.carrier = root.current;
    excObj.upper = upper.current;
    const dt = Math.min(0.1, Math.max(0, ex.time - last.current.t));
    last.current.t = ex.time;
    trackRun.l += ex.belt[0] * dt;
    trackRun.r += ex.belt[1] * dt;
  });
  return (
    <group ref={root}>
      {ex.under === 'pontoon' ? <Pontoons /> : <Carrier key={String(ex.gaugeWide)} />}
      <group ref={upper}>
        <Upper />
        <Equipment key={ex.armId} />
      </group>
    </group>
  );
}
