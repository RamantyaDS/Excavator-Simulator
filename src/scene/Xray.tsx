// X-ray view of the hydraulics: the machine turns to glass and oil is shown flowing from the two main pumps through
// the control valve to the boom, arm and bucket cylinders, the swing motor and the travel motors. Each stream moves
// as fast as its function runs and is coloured by its pressure (blue low, red at the relief), with a gauge label.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { equipment, frames, gauge, gravityTorques } from '../sim/excavator';
import { SPEC } from '../sim/spec';
import { ex, useUI } from '../store';
import { K } from './PC800';

const PER = 26;
const PATHS = 6; // boom, arm, bucket, swing, travel L, travel R

function lerpPath(pts: THREE.Vector3[], k: number, out: THREE.Vector3) {
  const seg = pts.length - 1;
  const f = Math.min(seg - 1e-6, Math.max(0, k * seg));
  const i = Math.floor(f);
  return out.lerpVectors(pts[i], pts[i + 1], f - i);
}

export function Xray() {
  const xray = useUI((s) => s.xray);
  // the shell turns to glass
  useEffect(() => {
    const mats = [K.yellow, K.yellowDark, K.black, K.under, K.shoe, K.worn, K.steel];
    for (const m of mats) {
      m.transparent = xray;
      m.opacity = xray ? 0.16 : 1;
      m.depthWrite = !xray;
      m.needsUpdate = true;
    }
  }, [xray]);
  if (!xray) return null;
  return <Flow />;
}

function Flow() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(new Float32Array(PATHS));
  const labels = useRef<(THREE.Group | null)[]>([]);
  const texts = useRef<({ text: string } | null)[]>([]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const m = ref.current!;
    const { upper, carrier } = frames(ex);
    const e = equipment(ex);
    const U = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(upper);
    const W = (p: THREE.Vector3) => p.clone().applyMatrix4(upper);
    const C = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(carrier);
    const pump = U(-0.9, 2.6, -1.9);
    const valve = U(-0.6, 2.4, 0.3);
    const b = ex.boom;
    const onBoom = (s: number, h: number) => U(e.F.x, e.F.y + s * Math.sin(b) + h * Math.cos(b), e.F.z + s * Math.cos(b) - h * Math.sin(b));
    const paths = [
      [pump, valve, U(e.F.x + 0.68, SPEC.ringY + 0.45, 2.0)],
      [pump, valve, W(e.F), onBoom(2, 1.2), onBoom(4.2, 1.8)],
      [pump, valve, W(e.F), onBoom(2, 1.2), onBoom(4, 1.6), onBoom(6.5, 0.8), W(e.P1), W(e.P1.clone().lerp(e.P2, 0.15))],
      [pump, valve, U(0.6, 2.0, -0.5)],
      [pump, valve, C(0, 1.3, 0), C(gauge(ex) / 2, 0.6, -2.3)],
      [pump, valve, C(0, 1.3, 0), C(-gauge(ex) / 2, 0.6, -2.3)],
    ];
    const g = gravityTorques(ex, e);
    const caps = SPEC.cap;
    const press = [
      Math.min(1, Math.abs(g.boom + ex.tau.boom) / caps.boomUp),
      Math.min(1, Math.abs(g.arm + ex.tau.arm) / caps.armIn),
      Math.min(1, Math.abs(g.bucket + ex.tau.bucket) / caps.curl),
      Math.min(1, Math.abs(ex.swingV) * 0.5),
      Math.min(1, Math.abs(ex.belt[0]) * 0.6),
      Math.min(1, Math.abs(ex.belt[1]) * 0.6),
    ];
    const rate = [ex.boomV / 0.5, ex.armV / 0.5, ex.bucketV / 1.2, ex.swingV / 0.7, ex.belt[0], ex.belt[1]];
    const M4 = new THREE.Matrix4();
    const P = new THREE.Vector3();
    for (let pth = 0; pth < PATHS; pth++) {
      const r = rate[pth];
      const active = Math.abs(r) > 0.02 && ex.engine === 'running';
      phase.current[pth] = (phase.current[pth] + dt * (0.15 + Math.abs(r) * 0.9)) % 1;
      col.setHSL(0.62 - 0.62 * press[pth], 1, 0.55);
      for (let i = 0; i < PER; i++) {
        const k = (i / PER + phase.current[pth]) % 1;
        lerpPath(paths[pth], k, P);
        const s = active ? 0.07 : ex.engine === 'running' ? 0.035 : 0.001;
        M4.compose(P, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        m.setMatrixAt(pth * PER + i, M4);
        m.setColorAt(pth * PER + i, col);
      }
      // gauge labels at the cylinders
      if (pth < 3) {
        const lg = labels.current[pth];
        if (lg) lg.position.copy(paths[pth][paths[pth].length - 1]).add(new THREE.Vector3(0, 0.6, 0));
        const tx = texts.current[pth];
        if (tx) tx.text = `${['Boom', 'Arm', 'Bucket'][pth]} ${(press[pth] * SPEC.relief.implement).toFixed(0)} MPa`;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, mat, PATHS * PER]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
      {[0, 1, 2].map((i) => (
        <Billboard key={i} ref={(g) => (labels.current[i] = g as unknown as THREE.Group)}>
          <Text ref={(t) => (texts.current[i] = t as unknown as { text: string })} fontSize={0.32} color="#ffffff" outlineWidth={0.02} outlineColor="#000">
            -
          </Text>
        </Billboard>
      ))}
    </>
  );
}
