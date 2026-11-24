// Things on the site: the 20 kV line on its poles, marker posts and paint lines over the buried services, survey
// stakes at the corners of each design, the genset house, oil palms on the peat block, a spotter standing by the
// trench, signs, trees around the edge.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EMBED } from '../embed';
import { CANAL, DUMP, GENHOUSE, PEAT, PIT, POWERLINE, ROAD, TRENCH, UTILS, shape } from '../sim/site';
import { heightAt } from '../sim/terrain';
import { ex } from '../store';
import { Bake } from './Bake';
import { EDGE_TREES } from './edgeTrees';
import { Box, Cyl, M } from './parts';
import { LeafTrees } from './treeKit';

const gy = (x: number, z: number) => heightAt(ex.terrain, x, z);

function PowerLine() {
  const L = POWERLINE;
  const wire = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.6, roughness: 0.4 }), []);
  return (
    <group>
      <Bake>
        {L.poles.map((z) => (
          <group key={z} position={[L.x, gy(L.x, z), z]}>
            <Cyl r={0.22} r2={0.16} l={L.y + 1} m={M.concrete} position={[0, (L.y + 1) / 2, 0]} seg={10} />
            <Box s={[2.6, 0.15, 0.15]} m={M.grey} position={[0, L.y + 0.3, 0]} />
            {[-1, 0, 1].map((dx) => (
              <Cyl key={dx} r={0.06} l={0.3} m={M.white} position={[dx, L.y + 0.5, 0]} seg={8} />
            ))}
          </group>
        ))}
      </Bake>
      {[-1, 0, 1].map((dx) => (
        <mesh key={dx} position={[L.x + dx, L.y + 0.62, (L.z0 + L.z1) / 2]} rotation={[Math.PI / 2, 0, 0]} material={wire}>
          <cylinderGeometry args={[0.02, 0.02, L.z1 - L.z0, 4]} />
        </mesh>
      ))}
      <Text position={[L.x + 2.5, 2.2, 12]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.6} color="#c21818" fontWeight={700}>
        AWAS! SUTM 20 kV · jarak aman 3 m
      </Text>
    </group>
  );
}

/** Marker posts every 8 m over each service, and a paint line on the ground. */
function Services() {
  return (
    <Bake shadows={false}>
      {UTILS.map((u) => {
        const len = Math.hypot(u.b[0] - u.a[0], u.b[1] - u.a[1]);
        const dx = (u.b[0] - u.a[0]) / len;
        const dz = (u.b[1] - u.a[1]) / len;
        const n = Math.floor(len / 8);
        const paint = new THREE.MeshBasicMaterial({ color: u.color });
        return (
          <group key={u.id}>
            {Array.from({ length: n + 1 }, (_, i) => {
              const x = u.a[0] + dx * i * 8;
              const z = u.a[1] + dz * i * 8;
              return (
                <group key={i} position={[x, gy(x, z), z]}>
                  <Cyl r={0.05} l={1.2} m={M.white} position={[0, 0.6, 0]} seg={6} />
                  <Box s={[0.3, 0.2, 0.02]} m={paint} position={[0, 1.1, 0]} />
                </group>
              );
            })}
            {Array.from({ length: Math.floor(len / 1.2) }, (_, i) => {
              const x = u.a[0] + dx * (i * 1.2 + 0.3);
              const z = u.a[1] + dz * (i * 1.2 + 0.3);
              return <Box key={'p' + i} s={[0.12, 0.02, 0.6]} m={paint} position={[x, gy(x, z) + 0.02, z]} rotation={[0, Math.atan2(dx, dz), 0]} />;
            })}
          </group>
        );
      })}
    </Bake>
  );
}

function Stake({ x, z, color = '#ff3d8b' }: { x: number; z: number; color?: string }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color }), [color]);
  return (
    <group position={[x, gy(x, z), z]}>
      <Box s={[0.05, 1.0, 0.05]} m={M.wood} position={[0, 0.5, 0]} />
      <Box s={[0.06, 0.12, 0.08]} m={m} position={[0, 0.9, 0]} />
    </group>
  );
}

function Stakes() {
  const T = TRENCH;
  const C = CANAL;
  const R = ROAD;
  const P = PIT;
  return (
    <Bake shadows={false}>
      {[T.z0, (T.z0 + T.z1) / 2, T.z1].flatMap((z) => [-1, 1].map((s) => <Stake key={`t${z}${s}`} x={T.x + s * (T.w / 2 + 0.8)} z={z} />))}
      {[C.x0, (C.x0 + C.x1) / 2, C.x1].flatMap((x) => [-1, 1].map((s) => <Stake key={`c${x}${s}`} x={x} z={C.z + s * (C.top / 2 + 0.8)} color="#2fd27a" />))}
      {[R.x0, R.x1].flatMap((x) => [R.z0, R.z1].map((z) => <Stake key={`r${x}${z}`} x={x} z={z} color="#ffd21a" />))}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Stake key={`p${sx}${sz}`} x={P.x + sx * (P.w / 2 + 0.6)} z={P.z + sz * (P.l / 2 + 0.6)} color="#3d9bff" />))}
    </Bake>
  );
}

function GensetHouse() {
  const G = GENHOUSE;
  return (
    <group position={[G.x, gy(G.x, G.z), G.z]}>
      <Bake>
        <Box s={[G.w, G.h, G.l]} m={M.concrete} position={[0, G.h / 2, 0]} />
        <Box s={[G.w + 0.6, 0.2, G.l + 0.6]} m={M.roof} position={[0, G.h + 0.1, 0]} />
        <Box s={[3, 3, 0.1]} m={M.door} position={[0, 1.5, G.l / 2 + 0.05]} />
        {[-3.5, 3.5].map((x) => (
          <Box key={x} s={[1.6, 1.0, 0.1]} m={M.glassDark} position={[x, 2.6, G.l / 2 + 0.05]} />
        ))}
      </Bake>
      <Text position={[0, G.h - 0.5, G.l / 2 + 0.08]} fontSize={0.45} color="#1f3550" fontWeight={700}>
        RUMAH GENSET · TRAKNUS 2250 kVA
      </Text>
    </group>
  );
}

/** Oil palms on the peat block (left of the canal line, clear of it and the road). */
function Palms() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const fronds = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = PEAT.x0 + 3; x < PEAT.x1 - 2; x += 9)
      for (let z = PEAT.z0 + 3; z < PEAT.z1 - 2; z += 9) {
        const xx = x + ((z * 7) % 3);
        if (Math.abs(z - CANAL.z) < CANAL.top / 2 + 3) continue;
        if (z > ROAD.z0 - 2 && z < ROAD.z1 + 2) continue;
        if (z < -63 && xx < -47) continue; // the swamp pond
        out.push([xx, z]);
      }
    return out;
  }, []);
  const frondGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(3.2, 1.6, 9, 1, true);
    g.rotateX(Math.PI);
    return g;
  }, []);
  useFrame(() => {
    if (trunks.current!.userData.done) return;
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => {
      const y = gy(x, z);
      m.compose(new THREE.Vector3(x, y + 3, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      trunks.current!.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, y + 6.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)), new THREE.Vector3(1, 1, 1));
      fronds.current!.setMatrixAt(i, m);
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    fronds.current!.instanceMatrix.needsUpdate = true;
    trunks.current!.userData.done = true;
  });
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, pts.length]} castShadow>
        <cylinderGeometry args={[0.3, 0.42, 6, 8]} />
        <meshStandardMaterial color="#5a4a35" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={fronds} args={[frondGeo, undefined, pts.length]} castShadow>
        <meshStandardMaterial color="#3f6b2a" roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}

/** The spotter by the trench: a worker in a vest who signals near the services. */
function Spotter() {
  const ref = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const vest = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff7a00', emissive: '#ff5a00', emissiveIntensity: 0.15 }), []);
  useFrame(() => {
    const g = ref.current!;
    const x = TRENCH.x + 4.5;
    const z = -27;
    g.position.set(x, gy(x, z), z);
    g.lookAt(ex.p.x, g.position.y, ex.p.z);
    // arm signal: up = stop, waving = slow
    const a = arm.current!;
    a.rotation.x = ex.spotter === 'stop' ? -Math.PI : ex.spotter === 'pelan' ? -1.6 + Math.sin(ex.time * 6) * 0.5 : -0.2;
  });
  return (
    <group ref={ref}>
      <Box s={[0.4, 0.8, 0.25]} m={M.blue} position={[0, 0.45, 0]} />
      <Box s={[0.45, 0.6, 0.28]} m={vest} position={[0, 1.15, 0]} />
      <mesh position={[0, 1.6, 0]} material={M.seat}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[0, 1.7, 0]} material={M.white}>
        <sphereGeometry args={[0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <group ref={arm} position={[0.27, 1.38, 0]}>
        <Box s={[0.1, 0.6, 0.1]} m={vest} position={[0, -0.3, 0]} />
      </group>
      <Box s={[0.1, 0.6, 0.1]} m={vest} position={[-0.27, 1.08, 0]} />
    </group>
  );
}

function Signs() {
  return (
    <>
      <Text position={[DUMP.x, 3, DUMP.z - 4]} fontSize={1} color="#1f3550" fontWeight={700} rotation={[0, Math.PI, 0]}>
        AREA BUANG (DUMP)
      </Text>
      <Text position={[TRENCH.x - 3, 0.2, TRENCH.z0 + 1]} fontSize={0.7} color="#ff3d8b" rotation={[-Math.PI / 2, 0, 0]} fontWeight={700}>
        PARIT · DESAIN 3D
      </Text>
      <Text position={[(CANAL.x0 + CANAL.x1) / 2, 0.4, CANAL.z + 5]} fontSize={0.9} color="#2fd27a" rotation={[-Math.PI / 2, 0, 0]} fontWeight={700}>
        KANAL DRAINASE KEBUN SAWIT
      </Text>
      <Text position={[PIT.x, 0.4, PIT.z + 3.5]} fontSize={0.6} color="#3d9bff" rotation={[-Math.PI / 2, 0, 0]} fontWeight={700}>
        PONDASI GENSET
      </Text>
    </>
  );
}

/** Trees around the edge, leafy like the world's; in the Traknus World the world draws them (they show from afar). */
const TREES = EDGE_TREES.map(([x, z, s], i) => ({ x, z, h: shape(x, z).h, s: s * 1.15, r: i * 2.39 }));
function Trees() {
  return EMBED.on ? null : <LeafTrees trees={TREES} />;
}

export function Site() {
  return (
    <group>
      <PowerLine />
      <Services />
      <Stakes />
      <GensetHouse />
      <Palms />
      <Spotter />
      <Signs />
      <Trees />
    </group>
  );
}
