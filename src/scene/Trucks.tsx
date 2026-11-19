// Rigid dump trucks (HD465-7 class, the usual match for a PC800): yellow frame, body with the canopy over the cab,
// cab on the left deck, six big tyres (dual rear). The body tips at the dump; the load heap grows as it is filled.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SOIL } from '../sim/terrain';
import { TRUCK, type Truck } from '../sim/trucks';
import { ex } from '../store';
import { Bake } from './Bake';
import { K } from './PC800';
import { Box, Cyl, M } from './parts';

function Wheel({ x, z, dual }: { x: number; z: number; dual?: boolean }) {
  return (
    <group position={[x, 1.1, z]}>
      <Cyl r={1.1} l={dual ? 1.35 : 0.7} axis="x" m={M.rubber} seg={24} />
      <Cyl r={0.6} l={(dual ? 1.35 : 0.7) + 0.02} axis="x" m={K.yellow} seg={16} />
    </group>
  );
}

function OneTruck({ t }: { t: Truck }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const heap = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => K.load.clone(), []);
  const B = TRUCK.bed;
  useFrame(() => {
    root.current!.position.set(t.x, 0, t.z);
    root.current!.rotation.y = t.heading;
    body.current!.rotation.x = -t.tip * 0.85;
    const f = Math.min(1.25, t.kg / TRUCK.payloadKg);
    heap.current!.visible = f > 0.01;
    heap.current!.scale.set(B.w * 0.46, Math.max(0.05, f * 1.3), (B.z1 - B.z0) * 0.44);
    const [r, g, b] = SOIL[ex.kind].color;
    mat.color.setRGB(r, g, b);
  });
  return (
    <group ref={root}>
      <Bake>
        {/* frame, front deck, engine hood, radiator grille */}
        <Box s={[1.3, 0.6, 9.2]} m={K.under} position={[0, 1.25, 0]} />
        <Box s={[5.0, 0.15, 2.4]} m={K.yellow} position={[0, 2.35, 3.25]} />
        <Box s={[2.2, 1.2, 2.2]} m={K.yellow} position={[-0.6, 1.8, 3.4]} />
        <Box s={[2.0, 1.0, 0.08]} m={K.black} position={[-0.6, 1.8, 4.55]} />
        {/* cab on the left */}
        <Box s={[1.8, 1.9, 2.4]} r={0.06} m={K.yellow} position={[1.15, 3.35, 3.1]} />
        <mesh position={[1.15, 3.6, 4.32]} material={K.glass}>
          <boxGeometry args={[1.6, 1.0, 0.03]} />
        </mesh>
        <mesh position={[2.06, 3.6, 3.1]} material={K.glass}>
          <boxGeometry args={[0.03, 1.0, 2.0]} />
        </mesh>
        {/* ladder and handrails on the front */}
        {[0.6, 1.1, 1.6, 2.1].map((y) => (
          <Box key={y} s={[0.6, 0.04, 0.25]} m={M.checker} position={[-2.2, y, 4.5]} />
        ))}
        <Wheel x={2.1} z={2.9} />
        <Wheel x={-2.1} z={2.9} />
        <Wheel x={1.85} z={-1.6} dual />
        <Wheel x={-1.85} z={-1.6} dual />
        {/* exhaust */}
        <Cyl r={0.1} l={1.2} m={K.black} position={[-1.9, 3.2, 2.3]} />
      </Bake>
      {/* the body: hinge at the rear, canopy over the cab */}
      <group position={[0, 1.95, B.z0 + 0.2]}>
        <group ref={body}>
          <Bake>
            <Box s={[B.w, 0.18, B.z1 - B.z0]} m={K.yellow} position={[0, B.floor - 1.95, (B.z1 - B.z0) / 2 - 0.2]} />
            {[-1, 1].map((s) => (
              <Box key={s} s={[0.15, B.rim - B.floor, B.z1 - B.z0]} m={K.yellow} position={[(s * B.w) / 2, (B.rim + B.floor) / 2 - 1.95, (B.z1 - B.z0) / 2 - 0.2]} />
            ))}
            <Box s={[B.w, B.rim - B.floor + 0.4, 0.15]} m={K.yellow} position={[0, (B.rim + B.floor) / 2 - 1.75, B.z1 - B.z0 - 0.2]} />
            {/* canopy over the cab, side ribs */}
            <Box s={[B.w + 0.2, 0.12, 2.9]} m={K.yellow} position={[0, B.rim - 1.95 + 0.7, B.z1 - B.z0 + 1.2]} />
            {[0.2, 0.4, 0.6, 0.8].map((k) => (
              <Box key={k} s={[B.w + 0.3, 0.9, 0.12]} m={K.yellowDark} position={[0, (B.rim + B.floor) / 2 - 1.95, (B.z1 - B.z0) * k - 0.2]} />
            ))}
          </Bake>
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
