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

export const K = {
  yellow: new THREE.MeshStandardMaterial({ color: '#f2b51b', metalness: 0.25, roughness: 0.38 }),
  yellowDark: new THREE.MeshStandardMaterial({ color: '#c99312', metalness: 0.3, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.45, roughness: 0.55 }),
  under: new THREE.MeshStandardMaterial({ color: '#26282a', metalness: 0.5, roughness: 0.6 }),
  shoe: new THREE.MeshStandardMaterial({ color: '#2b2a28', metalness: 0.6, roughness: 0.62 }),
  steel: new THREE.MeshStandardMaterial({ color: '#6f7377', metalness: 0.75, roughness: 0.38 }),
  worn: new THREE.MeshStandardMaterial({ color: '#5a554e', metalness: 0.6, roughness: 0.55 }),
  rod: new THREE.MeshStandardMaterial({ color: '#e3e6e8', metalness: 0.95, roughness: 0.12 }),
  hose: new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.1, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: '#1e2c34', metalness: 0.85, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 1.5 }),
  blue: new THREE.MeshStandardMaterial({ color: '#1d3f8f', metalness: 0.3, roughness: 0.4 }),
  load: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 }),
};

weather(K.yellow, { dirt: 0.14, mudBelow: 1.9, mud: 0.6, chips: 0.18, scale: 0.9 });
weather(K.yellowDark, { dirt: 0.2, mudBelow: 1.9, mud: 0.6, chips: 0.2, scale: 0.9 });
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
const TR = { R: 0.56, yC: 0.6, half: SPEC.tumbler / 2 + 0.05 };
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
      <Box s={[0.5, 0.62, SPEC.tumbler - 0.3]} m={K.under} position={[0, 0.62, 0]} />
      <Box s={[0.62, 0.08, SPEC.tumbler + 0.2]} m={K.under} position={[0, 0.98, 0]} />
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
          <Box s={[0.02, 0.5, SPEC.tumbler - 0.6]} m={K.under} position={[x, 0.66, 0]} />
          {[-1.2, 0, 1.2].map((z) => (
            <Cyl key={z} r={0.12} l={0.03} axis="x" m={K.black} position={[x * 1.05, 0.68, z]} seg={14} />
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
    g.fillStyle = '#2a2b2d';
    g.fillRect(0, 0, 128, 128);
    for (let y = 4; y < 128; y += 9) {
      g.fillStyle = '#121314';
      g.fillRect(4, y, 120, 5);
      g.fillStyle = '#4a4c4f';
      g.fillRect(4, y + 5, 120, 1);
    }
  });
}

/** Engine-room door: painted panel with a block of pressed louvres. */
function useLouvreDoor() {
  return useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#e8ad18';
    g.fillRect(0, 0, 256, 256);
    for (let y = 40; y < 200; y += 12) {
      g.fillStyle = '#5a4208';
      g.fillRect(40, y, 176, 6);
      g.fillStyle = '#ffd35a';
      g.fillRect(40, y + 6, 176, 2);
    }
    g.strokeStyle = '#7a5a0c';
    g.lineWidth = 3;
    g.strokeRect(4, 4, 248, 248);
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

function Decal() {
  // the PC800 decal: black panel, blue stripes, PC in yellow and 800 in white (right side, rear)
  const tex = useCanvasTexture(512, 300, (g) => {
    g.fillStyle = '#16171a';
    g.fillRect(0, 0, 512, 300);
    g.fillStyle = '#1f4fae';
    for (let i = 0; i < 3; i++) g.fillRect(0, 18 + i * 26, 512, 14);
    g.font = 'bold 92px Arial Black, Arial';
    g.fillStyle = '#f2b51b';
    g.fillText('PC', 40, 210);
    g.fillStyle = '#ffffff';
    g.fillText('800', 40, 290);
  });
  return (
    <mesh position={[-1.84, 2.7, -2.75]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[0.85, 0.5]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

function Rail({ pts }: { pts: [number, number, number][] }) {
  return <Pipe pts={pts} r={0.024} m={K.yellow} seg={pts.length * 6} />;
}

function Upper() {
  const grille = useGrille();
  const grilleMat = useMemo(() => new THREE.MeshStandardMaterial({ map: grille, metalness: 0.5, roughness: 0.6 }), [grille]);
  const louvre = useLouvreDoor();
  const doorMat = useMemo(() => weather(new THREE.MeshStandardMaterial({ map: louvre, metalness: 0.25, roughness: 0.45 }), { dirt: 0.3, mudBelow: 2.6, mud: 0.5, chips: 0.25 }), [louvre]);
  const caution = useCaution();
  const cautionMat = useMemo(() => new THREE.MeshStandardMaterial({ map: caution, roughness: 0.5 }), [caution]);
  const Y0 = SPEC.ringY;
  return (
    <group>
      <Bake>
        {/* revolving frame and deck */}
        <Box s={[3.6, 0.36, 5.2]} m={K.under} position={[0, Y0 + 0.18, -0.9]} />
        {/* counterweight: deep rounded block at the back */}
        <Box s={[3.62, 1.5, 1.15]} r={0.25} m={K.yellow} position={[0, Y0 + 0.8, -3.75]} />
        <Box s={[3.5, 0.08, 0.9]} m={K.black} position={[0, Y0 + 1.58, -3.75]} />
        {/* engine hood: full width behind the cab and tool box */}
        <Box s={[3.62, 1.55, 2.75]} r={0.06} m={K.yellow} position={[0, Y0 + 1.15, -1.9]} />
        <Box s={[3.3, 0.06, 2.3]} m={K.yellowDark} position={[0, Y0 + 1.95, -1.9]} />
        {/* engine room doors (right side): louvred panels, hinges, latches */}
        {[-2.75, -1.7, -0.65].map((z) => (
          <group key={z}>
            <mesh position={[-1.815, Y0 + 1.15, z]} rotation={[0, -Math.PI / 2, 0]} material={doorMat}>
              <planeGeometry args={[1.0, 1.25]} />
            </mesh>
            {[0.75, 1.55].map((y) => (
              <Box key={y} s={[0.05, 0.12, 0.06]} m={K.black} position={[-1.83, Y0 + y, z - 0.5]} />
            ))}
            <Box s={[0.05, 0.06, 0.14]} m={K.black} position={[-1.84, Y0 + 1.2, z + 0.38]} />
          </group>
        ))}
        {/* same louvres on the left behind the radiator grille, the pump room door */}
        <mesh position={[1.815, Y0 + 1.15, -2.95]} rotation={[0, Math.PI / 2, 0]} material={doorMat}>
          <planeGeometry args={[0.8, 1.25]} />
        </mesh>
        {/* hood seams, lifting eyes on the counterweight, caution stickers */}
        {[-2.7, -1.1].map((z) => (
          <Box key={z} s={[3.4, 0.015, 0.02]} m={K.black} position={[0, Y0 + 1.99, z]} />
        ))}
        {[-1.2, 1.2].map((x) => (
          <group key={x} position={[x, Y0 + 1.62, -3.8]}>
            <mesh rotation={[0, Math.PI / 2, 0]} material={K.black}>
              <torusGeometry args={[0.11, 0.035, 8, 14]} />
            </mesh>
          </group>
        ))}
        {[
          [1.815, Y0 + 0.9, -3.75, Math.PI / 2],
          [-1.815, Y0 + 0.9, -3.75, -Math.PI / 2],
          [-1.215, Y0 + 1.4, 1.81, 0],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, r, 0]} material={cautionMat}>
            <planeGeometry args={[0.28, 0.28]} />
          </mesh>
        ))}
        {/* grab handles by the steps */}
        {[0.8, 1.6].map((y) => (
          <Cyl key={y} r={0.02} l={0.5} m={K.yellow} position={[-1.88, Y0 + y, 1.82]} />
        ))}
        {/* radiator grille behind the cab (left side) */}
        <mesh position={[1.82, Y0 + 1.15, -1.55]} rotation={[0, Math.PI / 2, 0]} material={grilleMat}>
          <planeGeometry args={[1.5, 1.2]} />
        </mesh>
        {/* right front: tank and tool box compartments, steps */}
        <Box s={[1.15, 1.35, 2.3]} r={0.05} m={K.yellow} position={[-1.2, Y0 + 1.05, 0.65]} />
        <Box s={[1.0, 0.04, 2.1]} m={M.checker} position={[-1.2, Y0 + 1.75, 0.65]} />
        {[0.5, 0.95].map((y) => (
          <Box key={y} s={[0.3, 0.04, 0.45]} m={M.checker} position={[-1.95, Y0 + y, 1.55]} />
        ))}
        {/* catwalk along the right side */}
        <Box s={[0.42, 0.05, 4.4]} m={M.checker} position={[-2.0, Y0 + 0.62, -1.4]} />
        <Box s={[0.05, 0.12, 4.4]} m={K.black} position={[-2.2, Y0 + 0.56, -1.4]} />
        {/* exhaust stack with rain cap, pre-cleaner, fuel and oil caps on the hood */}
        <Cyl r={0.14} l={0.9} m={K.black} position={[-0.95, Y0 + 2.4, -1.25]} seg={14} />
        <Cyl r={0.17} l={0.06} m={K.black} position={[-0.95, Y0 + 2.86, -1.25]} rotation={[0.3, 0, 0]} seg={14} />
        <Box s={[0.55, 0.45, 0.55]} r={0.05} m={K.black} position={[-0.2, Y0 + 2.18, -2.6]} />
        <Cyl r={0.16} l={0.35} m={K.black} position={[0.5, Y0 + 2.12, -2.2]} seg={12} />
        <Cyl r={0.09} l={0.06} m={K.black} position={[-1.3, Y0 + 2.0, 0.3]} seg={10} />
        {/* boom foot bracket */}
        <Box s={[1.5, 0.95, 1.2]} m={K.yellow} position={[SPEC.boomFoot.x, Y0 + 0.75, 0.75]} />
        {[-0.62, 0.62].map((d) => (
          <Box key={d} s={[0.12, 0.7, 0.8]} m={K.yellowDark} position={[SPEC.boomFoot.x + d, Y0 + 0.65, 1.55]} />
        ))}
        {/* cab: high mount, black pillars, big tinted glass all round, yellow roof and lower panels, front guard */}
        <group position={[1.15, Y0 + 0.5, 0.75]}>
          <Box s={[1.15, 0.3, 2.2]} m={K.black} position={[0, -0.05, 0]} />
          <Box s={[1.12, 0.35, 2.02]} r={0.04} m={K.yellow} position={[0, 0.28, -0.08]} />
          <Box s={[1.14, 0.22, 2.06]} r={0.06} m={K.yellow} position={[0, 2.02, -0.08]} />
          <Box s={[1.1, 1.65, 0.5]} r={0.03} m={K.yellow} position={[0, 1.2, -0.86]} />
          {/* pillars */}
          {[
            [0.54, 0.92],
            [-0.54, 0.92],
            [0.54, -0.1],
            [-0.54, -0.1],
          ].map(([x, z]) => (
            <Box key={`${x}${z}`} s={[0.07, 1.62, 0.07]} m={K.black} position={[x, 1.2, z]} rotation={[z > 0.5 ? -0.08 : 0, 0, 0]} />
          ))}
          {/* glass: front, both sides, roof window */}
          <mesh position={[0, 1.2, 0.94]} rotation={[-0.08, 0, 0]} material={K.glass}>
            <boxGeometry args={[1.02, 1.6, 0.025]} />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.555, 1.2, 0.18]} material={K.glass}>
              <boxGeometry args={[0.02, 1.55, 1.5]} />
            </mesh>
          ))}
          <mesh position={[0, 2.135, 0.2]} material={K.glass}>
            <boxGeometry args={[0.8, 0.02, 0.9]} />
          </mesh>
          {/* door frame (left), handle, rain visor, sun visor */}
          <Box s={[0.03, 1.6, 0.04]} m={K.black} position={[0.57, 1.2, 0.4]} />
          <Box s={[0.04, 0.05, 0.16]} m={K.black} position={[0.585, 1.05, 0.25]} />
          <Box s={[1.1, 0.04, 0.25]} m={K.black} position={[0, 2.1, 1.05]} rotation={[0.25, 0, 0]} />
          {/* front guard (ISO 10262 level 2): frame and vertical bars */}
          <Box s={[1.12, 0.07, 0.07]} m={K.black} position={[0, 2.0, 1.15]} />
          <Box s={[1.12, 0.07, 0.07]} m={K.black} position={[0, 0.3, 1.15]} />
          {[-0.54, 0.54].map((x) => (
            <Box key={x} s={[0.07, 1.8, 0.07]} m={K.black} position={[x, 1.15, 1.15]} />
          ))}
          {[-0.27, 0, 0.27].map((x) => (
            <Box key={x} s={[0.035, 1.7, 0.035]} m={K.black} position={[x, 1.15, 1.16]} />
          ))}
          {/* wiper parked on the left pillar */}
          <Box s={[0.02, 0.85, 0.02]} m={K.black} position={[0.42, 1.0, 0.99]} rotation={[0, 0, 0.12]} />
          {/* steps below the door */}
          {[-0.2, -0.75, -1.3].map((y) => (
            <Box key={y} s={[0.35, 0.04, 0.3]} m={M.checker} position={[0.5, y, 0.95]} />
          ))}
          {/* inside: seat, consoles with the joysticks, the colour monitor */}
          <Box s={[0.5, 0.55, 0.55]} r={0.06} m={M.seat} position={[0, 0.75, -0.25]} />
          <Box s={[0.5, 0.85, 0.14]} r={0.05} m={M.seat} position={[0, 1.25, -0.58]} />
          {[-0.36, 0.36].map((x) => (
            <group key={x}>
              <Box s={[0.18, 0.35, 0.6]} m={K.black} position={[x, 0.68, -0.15]} />
              <Cyl r={0.025} l={0.22} m={K.black} position={[x, 0.95, 0.0]} />
            </group>
          ))}
          <Box s={[0.26, 0.2, 0.05]} m={M.dash} position={[0.35, 1.2, 0.7]} rotation={[-0.4, -0.3, 0]} />
          <Cyl r={0.025} l={0.6} m={K.black} position={[-0.12, 0.75, 0.55]} rotation={[0.4, 0, 0]} />
          <Cyl r={0.025} l={0.6} m={K.black} position={[0.12, 0.75, 0.55]} rotation={[0.4, 0, 0]} />
        </group>
        {/* mirrors: one on the cab, one on the right handrail */}
        <Cyl r={0.018} l={0.7} m={K.black} position={[1.75, Y0 + 2.2, 1.6]} />
        <Box s={[0.05, 0.35, 0.25]} m={K.black} position={[1.82, Y0 + 2.5, 1.6]} />
        <Cyl r={0.018} l={0.9} m={K.black} position={[-1.85, Y0 + 2.2, 1.65]} />
        <Box s={[0.05, 0.35, 0.25]} m={K.black} position={[-1.85, Y0 + 2.6, 1.65]} />
        {/* work lights: house front right, cab roof */}
        {[
          [-1.45, Y0 + 1.9, 1.85],
          [1.35, Y0 + 2.65, 1.75],
          [0.95, Y0 + 2.65, 1.75],
        ].map(([x, y, z], i) => (
          <group key={i} position={[x, y, z]}>
            <Box s={[0.2, 0.16, 0.12]} m={K.black} />
            <Cyl r={0.06} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.07]} />
          </group>
        ))}
      </Bake>
      {/* KOMATSU on the back of the counterweight */}
      <Text position={[0, Y0 + 1.05, -4.34]} rotation={[0, Math.PI, 0]} fontSize={0.42} color="#1d3f8f" fontWeight={900} letterSpacing={0.04}>
        KOMATSU
      </Text>
      <Decal />
      {/* large handrails on the hood and the right side */}
      <Bake shadows={false}>
        <Rail pts={[[-1.75, Y0 + 2.6, 1.6], [-1.75, Y0 + 2.75, 0.3], [-1.75, Y0 + 2.75, -2.6], [-1.75, Y0 + 2.6, -3.3]]} />
        <Rail pts={[[-1.75, Y0 + 2.0, -3.3], [-1.75, Y0 + 2.6, -3.3]]} />
        <Rail pts={[[-1.75, Y0 + 2.0, 1.6], [-1.75, Y0 + 2.6, 1.6]]} />
        <Rail pts={[[0.2, Y0 + 2.0, -3.1], [0.2, Y0 + 2.5, -3.1], [0.2, Y0 + 2.5, -0.9], [0.2, Y0 + 2.0, -0.9]]} />
        <Rail pts={[[1.75, Y0 + 2.0, -3.1], [1.75, Y0 + 2.5, -3.1], [1.75, Y0 + 2.5, -1.2], [1.75, Y0 + 2.0, -1.0]]} />
      </Bake>
    </group>
  );
}

// ---------- work equipment ----------
const BOOM_PTS: [number, number][] = [
  [-0.35, 0.15],
  [-0.1, 0.62],
  [2.0, 1.12],
  [3.95, 1.55],
  [5.2, 1.3],
  [7.0, 0.62],
  [8.35, 0.42],
  [8.5, 0.0],
  [8.25, -0.42],
  [6.8, -0.05],
  [5.3, 0.38],
  [3.95, 0.48],
  [2.4, 0.1],
  [0.9, -0.4],
  [0.0, -0.55],
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
const BOOM_CYL_BASE = new THREE.Vector3(0, SPEC.ringY + 0.45, 1.75); // upper frame
const BOOM_CYL_END: [number, number] = [3.15, 0.05];
const ARM_CYL_BASE: [number, number] = [4.3, 1.85];
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
    ram(rams.a.current[0], rams.a.current[1], inBoom(ARM_CYL_BASE, 0, tmp.a), inArm(ARM_HEEL, 0, tmp.b), 2.7);
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
    ram(rams.k.current[0], rams.k.current[1], inArm(BKT_CYL_BASE, 0, tmp.c), R.clone().setX(e.P1.x), 1.75);
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
            <Box key={x} s={[0.22, 0.42, 0.55]} m={K.yellowDark} position={[x, 0.02, BOOM_CYL_END[0]]} />
          ))}
          <Box s={[0.55, 0.6, 0.6]} m={K.yellowDark} position={[0, ARM_CYL_BASE[1] - 0.25, ARM_CYL_BASE[0]]} />
          {/* hoses along the top: from the foot over the knee to the arm and bucket cylinders */}
          {[-0.36, -0.2, 0.2, 0.36].map((x) => (
            <Pipe
              key={x}
              pts={[
                [x, 0.55, -0.2],
                [x, 1.15, 2.0],
                [x, 1.6, 3.9],
                [x, 1.35, 5.4],
                [x, 0.75, 7.6],
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
              <Pipe pts={[[x, 0.15, 0.6], [x, 0.75, 2.4], [x, 1.05, 3.9], [x, 0.85, 5.4], [x, 0.3, 7.6]]} r={0.03} m={K.steel} seg={30} />
              {[1.5, 3.0, 4.6, 6.4].map((z) => (
                <Box key={z} s={[0.06, 0.12, 0.08]} m={K.black} position={[x, z < 3.9 ? 0.15 + (z - 0.6) * 0.29 : 1.05 - (z - 3.9) * 0.24, z]} />
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
          <group position={[0.52, 0.95, 2.1]}>
            <Box s={[0.12, 0.18, 0.2]} m={K.black} />
            <Cyl r={0.06} l={0.02} axis="z" m={M.lens} position={[0, 0, 0.11]} />
          </group>
        </Bake>
        <Text position={[0.505, 0.75, 3.6]} rotation={[-0.13, Math.PI / 2, 0]} fontSize={0.62} color="#1d3f8f" fontWeight={900} letterSpacing={0.03}>
          KOMATSU
        </Text>
        <Text position={[-0.505, 0.75, 3.6]} rotation={[0.13, -Math.PI / 2, 0]} fontSize={0.62} color="#1d3f8f" fontWeight={900} letterSpacing={0.03}>
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
            <BucketMesh />
            <Load />
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

export function PC800() {
  const root = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const last = useRef({ t: ex.time });
  useFrame(() => {
    root.current!.position.copy(ex.p);
    root.current!.quaternion.copy(ex.q);
    upper.current!.rotation.y = ex.swing;
    excObj.carrier = root.current;
    excObj.upper = upper.current;
    const dt = Math.min(0.1, Math.max(0, ex.time - last.current.t));
    last.current.t = ex.time;
    trackRun.l += ex.belt[0] * dt;
    trackRun.r += ex.belt[1] * dt;
  });
  return (
    <group ref={root}>
      <Carrier />
      <group ref={upper}>
        <Upper />
        <Equipment />
      </group>
    </group>
  );
}
