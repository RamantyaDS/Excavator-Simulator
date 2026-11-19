// Phase-2 visuals: the breaker and the grapple on the quick coupler, the tool rack, the amphibious pontoons, the
// lowbed trailer with its prime mover, logs and the Rodeo pieces, rain.
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PONTOON } from '../sim/excavator';
import { LOG_STACK, LOWBED, POND_GOAL, RACK, RODEO } from '../sim/site';
import { heightAt } from '../sim/terrain';
import { ex, useUI } from '../store';
import { Bake } from './Bake';
import { K } from './PC800';
import { Box, Cyl, M } from './parts';

const gy = (x: number, z: number) => heightAt(ex.terrain, x, z);

/** Hydraulic breaker (tool frame: +z towards the chisel tip, 2.4 m). */
export function BreakerMesh() {
  const body = useRef<THREE.Group>(null);
  useFrame(() => {
    const on = ex.tool === 'breaker' && ex.aux && ex.engine === 'running';
    body.current!.position.z = on ? Math.sin(ex.time * 70) * 0.025 : 0;
  });
  return (
    <group>
      <Bake>
        {/* coupler bracket */}
        <Box s={[0.8, 0.45, 0.6]} m={K.black} position={[0, 0.1, 0.05]} />
        {[-0.3, 0.3].map((x) => (
          <Box key={x} s={[0.08, 0.55, 0.7]} m={K.yellowDark} position={[x, 0.15, 0.0]} />
        ))}
      </Bake>
      <group ref={body}>
        <Bake>
          <Box s={[0.75, 0.75, 1.5]} r={0.05} m={K.yellow} position={[0, 0, 0.95]} />
          <Box s={[0.79, 0.12, 1.3]} m={K.black} position={[0, 0.38, 0.95]} />
          {[0.45, 1.45].map((z) => (
            <Cyl key={z} r={0.05} l={0.82} axis="x" m={K.black} position={[0, 0.25, z]} seg={8} />
          ))}
          <Cyl r={0.2} l={0.35} axis="z" m={K.black} position={[0, 0, 1.85]} seg={16} />
          <Cyl r={0.09} r2={0.11} l={0.55} axis="z" m={K.steel} position={[0, 0, 2.2]} seg={12} />
          <Cyl r={0.02} r2={0.09} l={0.12} axis="z" m={K.steel} position={[0, 0, 2.45]} seg={10} />
          {[-0.18, 0.18].map((x) => (
            <Cyl key={x} r={0.04} l={0.9} axis="z" m={K.hose} position={[x, 0.42, 0.1]} seg={8} />
          ))}
        </Bake>
      </group>
    </group>
  );
}

/** Demolition / sorting grapple with two pairs of tines that close with the auxiliary hydraulics. */
export function GrappleMesh() {
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  const open = useRef(1);
  useFrame((_, dt) => {
    open.current += ((ex.aux ? 0 : 1) - open.current) * Math.min(1, dt * 4);
    const ang = 0.15 + open.current * 0.75;
    a.current!.rotation.x = -ang;
    b.current!.rotation.x = ang;
  });
  const tine = (
    <Bake>
      {[-0.45, 0.45].map((x) => (
        <group key={x}>
          <Box s={[0.14, 0.18, 1.5]} m={K.yellow} position={[x, 0, 0.75]} />
          <Box s={[0.12, 0.22, 0.3]} m={K.steel} position={[x, 0.05, 1.55]} rotation={[0.4, 0, 0]} />
        </group>
      ))}
      <Box s={[1.05, 0.12, 0.2]} m={K.yellowDark} position={[0, 0, 1.1]} />
    </Bake>
  );
  return (
    <group>
      <Bake>
        <Box s={[0.8, 0.5, 0.7]} m={K.black} position={[0, 0.1, 0.05]} />
        <Cyl r={0.3} l={0.5} axis="z" m={K.yellowDark} position={[0, 0, 0.55]} seg={18} />
        <Box s={[1.2, 0.4, 0.4]} m={K.yellow} position={[0, 0, 0.85]} />
      </Bake>
      <group position={[0, 0.15, 0.85]} ref={a}>
        {tine}
      </group>
      <group position={[0, -0.15, 0.85]} ref={b} scale={[1, -1, 1]}>
        {tine}
      </group>
    </group>
  );
}

/** The amphibious undercarriage: two pontoons with track chains round them and the cross frame. */
export function Pontoons() {
  const P = PONTOON;
  return (
    <Bake>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * P.x, 0, 0]}>
          <Box s={[P.w, P.h, P.len - 1.2]} r={0.2} m={K.yellow} position={[0, P.h / 2, 0]} />
          {[-1, 1].map((e) => (
            <Cyl key={e} r={P.h / 2} l={P.w} axis="x" m={K.yellow} position={[0, P.h / 2, (e * (P.len - 1.2)) / 2]} seg={20} />
          ))}
          {/* chain with cleats round the pontoon */}
          {Array.from({ length: 34 }, (_, i) => {
            const z = -P.len / 2 + 0.3 + (i * (P.len - 0.6)) / 33;
            return (
              <group key={i}>
                <Box s={[P.w + 0.1, 0.06, 0.14]} m={K.shoe} position={[0, -0.02, z]} />
                <Box s={[P.w + 0.1, 0.06, 0.14]} m={K.shoe} position={[0, P.h + 0.02, z]} />
                <Box s={[P.w + 0.1, 0.16, 0.05]} m={K.shoe} position={[0, -0.1, z]} />
              </group>
            );
          })}
          <Box s={[0.05, 0.4, P.len - 2]} m={K.black} position={[s * (P.w / 2 + 0.03), P.h * 0.7, 0]} />
        </group>
      ))}
      {/* cross frame and the raised slewing ring */}
      {[-2.2, 0, 2.2].map((z) => (
        <Box key={z} s={[P.x * 2, 0.5, 0.6]} m={K.under} position={[0, P.h - 0.1, z]} />
      ))}
      <Box s={[2.6, P.lift + 0.4, 2.6]} m={K.under} position={[0, P.h + (P.lift - 0.6) / 2, 0]} />
      <Cyl r={1.35} l={0.28} m={K.black} position={[0, 1.42 + P.lift, 0]} seg={40} />
    </Bake>
  );
}

/** Quick-coupler rack with the tools not on the machine. */
export function ToolRack() {
  useUI(() => ex.tool);
  const y = gy(RACK.x, RACK.z);
  return (
    <group position={[RACK.x, y, RACK.z]}>
      <Bake>
        <Box s={[7, 0.15, 2.4]} m={M.wood} position={[0, 0.08, 0]} />
        {[-3.2, 3.2].map((x) => (
          <Box key={x} s={[0.2, 1.2, 0.2]} m={M.grey} position={[x, 0.6, -1.0]} />
        ))}
      </Bake>
      {ex.tool !== 'breaker' && (
        <group position={[-2, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <BreakerMesh />
        </group>
      )}
      {ex.tool !== 'grapple' && (
        <group position={[0.4, 0.6, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <GrappleMesh />
        </group>
      )}
      {ex.tool !== 'bucket' && <Box s={[1.9, 1.3, 1.6]} m={K.worn} position={[2.4, 0.8, 0]} />}
      <Text position={[0, 1.6, -1.1]} fontSize={0.35} color="#1f3550" fontWeight={700}>
        RAK QUICK COUPLER
      </Text>
    </group>
  );
}

/** Lowbed trailer (rear ramp, deck, gooseneck) and its prime mover. */
export function Lowbed() {
  const L = LOWBED;
  const len = L.z1 - L.z0;
  const k = Math.atan2(L.deck, L.ramp);
  return (
    <group position={[L.x, gy(L.x, L.z), L.z]} rotation={[0, L.yaw, 0]}>
      <Bake>
        <Box s={[L.w, 0.25, len]} m={M.trailer} position={[0, L.deck - 0.125, (L.z0 + L.z1) / 2]} />
        <Box s={[L.w - 0.2, 0.03, len]} m={M.checker} position={[0, L.deck + 0.01, (L.z0 + L.z1) / 2]} />
        {/* rear ramp */}
        <Box s={[L.w, 0.15, Math.hypot(L.ramp, L.deck)]} m={M.checker} position={[0, L.deck / 2 - 0.05, L.z0 - L.ramp / 2]} rotation={[k, 0, 0]} />
        {/* gooseneck and the tractor head */}
        <Box s={[L.w, L.neckTop - L.deck + 0.3, L.neck]} m={M.trailer} position={[0, (L.deck + L.neckTop) / 2, L.z1 + L.neck / 2]} />
        <Box s={[2.5, 2.8, 2.4]} r={0.08} m={M.cabWhite} position={[0, 2.3, L.z1 + L.neck + 2.6]} />
        <mesh position={[0, 2.9, L.z1 + L.neck + 3.81]} material={K.glass}>
          <boxGeometry args={[2.2, 1.0, 0.03]} />
        </mesh>
        <Box s={[1.2, 0.5, 5]} m={K.under} position={[0, 0.8, L.z1 + L.neck + 1.2]} />
        {/* wheels: trailer bogies, tractor axles */}
        {[-5.5, -3.8].map((z) =>
          [-1.3, 1.3].map((x) => <Cyl key={`${z}${x}`} r={0.45} l={0.6} axis="x" m={M.rubber} position={[x, 0.45, z]} seg={16} />),
        )}
        {[L.z1 + L.neck + 0.4, L.z1 + L.neck + 1.8, L.z1 + L.neck + 3.4].map((z) =>
          [-1.1, 1.1].map((x) => <Cyl key={`${z}${x}`} r={0.55} l={0.5} axis="x" m={M.rubber} position={[x, 0.55, z]} seg={16} />),
        )}
      </Bake>
      <Text position={[L.w / 2 + 0.05, L.deck - 0.1, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.35} color="#ffd21a" fontWeight={700}>
        LOWBED 100 t
      </Text>
    </group>
  );
}

/** Logs, the Rodeo ball, egg and tyres, following the sim. */
export function Props() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    ex.props.forEach((q, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.position.copy(q.p);
      g.rotation.y = q.yaw;
      if (q.kind === 'egg') g.scale.setScalar(q.broken ? 0.001 : 1);
    });
  });
  const ball = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff5a1a', roughness: 0.5 }), []);
  const egg = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.4 }), []);
  return (
    <>
      {ex.props.map((q, i) => (
        <group key={q.id} ref={(g) => (refs.current[i] = g)}>
          {q.kind === 'log' && <Cyl r={0.3} l={4.5} axis="x" m={M.wood} seg={12} />}
          {q.kind === 'ball' && (
            <mesh material={ball} castShadow>
              <sphereGeometry args={[q.r, 20, 14]} />
            </mesh>
          )}
          {q.kind === 'egg' && (
            <mesh material={egg} scale={[1, 1.3, 1]} castShadow>
              <sphereGeometry args={[q.r * 0.8, 18, 14]} />
            </mesh>
          )}
          {q.kind === 'tire' && (
            <mesh rotation={[Math.PI / 2, 0, 0]} material={M.rubber} castShadow>
              <torusGeometry args={[q.r * 0.7, q.r * 0.35, 10, 20]} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

/** Rodeo arena: the drum, the pedestal, the painted ring; the log stack area and the swamp landing stake. */
export function Arena() {
  const D = RODEO.drum;
  const P = RODEO.pedestal;
  const R = RODEO.ring;
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd21a' }), []);
  return (
    <group>
      <Bake>
        <group position={[D.x, gy(D.x, D.z), D.z]}>
          <Cyl r={D.r + 0.05} l={D.h} m={M.blue} position={[0, D.h / 2, 0]} seg={20} open />
          <Cyl r={D.r} l={0.05} m={M.grey} position={[0, 0.05, 0]} seg={20} />
        </group>
        <group position={[P.x, gy(P.x, P.z), P.z]}>
          <Cyl r={0.15} l={P.h} m={M.red} position={[0, P.h / 2, 0]} seg={10} />
          <Cyl r={P.r} l={0.06} m={M.white} position={[0, P.h, 0]} seg={18} />
        </group>
        {[RODEO.x - 6, RODEO.x + 10].map((x) => (
          <Box key={x} s={[0.1, 2, 0.1]} m={M.white} position={[x, gy(x, RODEO.z) + 1, RODEO.z - 8]} />
        ))}
      </Bake>
      <mesh position={[R.x, gy(R.x, R.z) + 0.04, R.z]} rotation={[-Math.PI / 2, 0, 0]} material={ring}>
        <ringGeometry args={[R.r - 0.12, R.r, 40]} />
      </mesh>
      <mesh position={[LOG_STACK.x, gy(LOG_STACK.x, LOG_STACK.z) + 0.04, LOG_STACK.z]} rotation={[-Math.PI / 2, 0, 0]} material={ring}>
        <ringGeometry args={[LOG_STACK.r - 0.15, LOG_STACK.r, 40]} />
      </mesh>
      <Text position={[RODEO.x + 2, gy(RODEO.x, RODEO.z) + 2.2, RODEO.z - 8]} fontSize={0.7} color="#c21818" fontWeight={900} rotation={[0, Math.PI, 0]}>
        EXCAVATOR RODEO
      </Text>
      <Text position={[LOG_STACK.x, 0.3, LOG_STACK.z + LOG_STACK.r + 0.6]} fontSize={0.5} color="#ffd21a" rotation={[-Math.PI / 2, 0, 0]} fontWeight={700}>
        TUMPUKAN KAYU
      </Text>
      <group position={[POND_GOAL.x, gy(POND_GOAL.x, POND_GOAL.z), POND_GOAL.z]}>
        <Box s={[0.12, 2.5, 0.12]} m={M.wood} position={[0, 1.25, 0]} />
        <Box s={[0.6, 0.4, 0.04]} m={ring} position={[0.3, 2.3, 0]} />
      </group>
    </group>
  );
}

/** Rain: streaks falling round the camera. */
export function Rain() {
  const rain = useUI(() => ex.rain);
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const N = 2500;
  const drops = useMemo(() => Array.from({ length: N }, () => [Math.random() * 40 - 20, Math.random() * 20, Math.random() * 40 - 20]), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b8c4d0', transparent: true, opacity: 0.45, depthWrite: false }), []);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const M4 = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      d[1] -= dt * 14;
      if (d[1] < -2) d[1] += 22;
      M4.makeTranslation(camera.position.x + d[0], camera.position.y + d[1] - 8, camera.position.z + d[2]);
      m.setMatrixAt(i, M4);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  if (!rain) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, mat, N]} frustumCulled={false}>
      <boxGeometry args={[0.012, 0.6, 0.012]} />
    </instancedMesh>
  );
}
