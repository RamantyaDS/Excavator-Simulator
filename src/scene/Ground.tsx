// The diggable ground as one mesh, one vertex per cell. Only the rows the sim changed are re-uploaded. Colour comes
// from what the surface is made of (topsoil, clay, sand, peat, rock, spoil), darker where wet; with machine guidance
// on, the job's design area is tinted by the height against the design: red still to cut, green on grade, blue
// over-dug. Open water shows where the ground is below the water table (canal, deep pits).
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { design, PEAT } from '../sim/site';
import { CELL, HALF, N, SOIL, idx, surfaceSoil } from '../sim/terrain';
import { ex, useUI } from '../store';
import { useCanvasTexture } from './parts';

function colorOf(k: number, x: number, z: number, guide: boolean, out: THREE.Color) {
  const t = ex.terrain;
  const s = surfaceSoil(t, k);
  const [r, g, b] = SOIL[s].color;
  out.setRGB(r, g, b, THREE.SRGBColorSpace);
  // grass on undisturbed topsoil of the field, darker near water
  if (s === 0 && t.h[k] >= t.orig[k] - 0.03) {
    const n = Math.sin(x * 0.7) * Math.sin(z * 0.6) * 0.5 + 0.5;
    out.setRGB(0.36 + n * 0.08, 0.45 + n * 0.08, 0.22, THREE.SRGBColorSpace);
  }
  const water = t.water[t.zone[k]];
  const wet = Math.max(0, Math.min(1, 1 - (t.h[k] - water) / 1.2));
  out.multiplyScalar(1 - wet * 0.45);
  if (guide) {
    const d = design(ex.job, x, z);
    if (d !== null) {
      const dh = t.h[k] - d;
      if (Math.abs(dh) <= 0.06) out.lerp(new THREE.Color(0.15, 0.8, 0.3), 0.75);
      else if (dh > 0) out.lerp(new THREE.Color(0.95, 0.25, 0.15), Math.min(0.75, 0.3 + dh * 0.2));
      else out.lerp(new THREE.Color(0.15, 0.35, 0.95), Math.min(0.8, 0.4 - dh * 0.6));
    }
  }
}

export function Ground() {
  const guidance = useUI((s) => s.guidance);
  const grain = useCanvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = '#c8c8c8';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) {
        const v = 150 + Math.random() * 105;
        g.fillStyle = `rgb(${v},${v},${v})`;
        const s = Math.random() < 0.08 ? 3 : 1.4;
        g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
      }
    },
    [220, 220],
  );
  const geo = useMemo(() => {
    const t = ex.terrain;
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = idx(i, j);
        pos[k * 3] = i * CELL - HALF;
        pos[k * 3 + 1] = t.h[k];
        pos[k * 3 + 2] = j * CELL - HALF;
        uv[k * 2] = i / (N - 1);
        uv[k * 2 + 1] = j / (N - 1);
      }
    const index = new Uint32Array((N - 1) * (N - 1) * 6);
    let n = 0;
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const a = idx(i, j);
        const b = idx(i + 1, j);
        const c = idx(i, j + 1);
        const d = idx(i + 1, j + 1);
        index.set([a, c, b, b, c, d], n);
        n += 6;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), HALF * 1.5);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF, -20, -HALF), new THREE.Vector3(HALF, 20, HALF));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: grain }), [grain]);

  const guideRef = useRef(guidance);
  // a guidance toggle or a job change recolours everything
  useEffect(() => {
    guideRef.current = guidance;
    ex.terrain.dirty = [0, 0, N - 1, N - 1];
  }, [guidance]);
  const job = useRef(ex.job);

  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const t = ex.terrain;
    if (job.current !== ex.job) {
      job.current = ex.job;
      t.dirty = [0, 0, N - 1, N - 1];
    }
    const d = t.dirty;
    if (d[0] > d[2]) return;
    const i0 = Math.max(0, d[0] - 1);
    const j0 = Math.max(0, d[1] - 1);
    const i1 = Math.min(N - 1, d[2] + 1);
    const j1 = Math.min(N - 1, d[3] + 1);
    t.dirty = [1, 1, 0, 0];
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const Nn = nor.array as Float32Array;
    const C = col.array as Float32Array;
    const guide = guideRef.current;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = idx(i, j);
        P[k * 3 + 1] = t.h[k];
        const hl = t.h[idx(Math.max(0, i - 1), j)];
        const hr = t.h[idx(Math.min(N - 1, i + 1), j)];
        const hd = t.h[idx(i, Math.max(0, j - 1))];
        const hu = t.h[idx(i, Math.min(N - 1, j + 1))];
        let nx = hl - hr;
        let ny = 2 * CELL;
        let nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        Nn[k * 3] = nx;
        Nn[k * 3 + 1] = ny;
        Nn[k * 3 + 2] = nz;
        colorOf(k, P[k * 3], P[k * 3 + 2], guide, tmp);
        C[k * 3] = tmp.r;
        C[k * 3 + 1] = tmp.g;
        C[k * 3 + 2] = tmp.b;
      }
    const start = j0 * N * 3;
    const count = (j1 - j0 + 1) * N * 3;
    for (const a of [pos, nor, col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(start, count);
      a.needsUpdate = true;
    }
  });

  const water = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b4a3a', metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.82 }), []);
  const fieldWater = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4d5b52', metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85 }), []);
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow castShadow={false} />
      {/* open water: the peat block's high water table, the field's lower one (deep pits) */}
      <mesh position={[(PEAT.x0 + PEAT.x1) / 2, ex.terrain.water[2], (PEAT.z0 + PEAT.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={water}>
        <planeGeometry args={[PEAT.x1 - PEAT.x0 - 0.5, PEAT.z1 - PEAT.z0 - 0.5]} />
      </mesh>
      <mesh position={[30, ex.terrain.water[0], 10]} rotation={[-Math.PI / 2, 0, 0]} material={fieldWater}>
        <planeGeometry args={[100, 140]} />
      </mesh>
      {/* the land beyond the site */}
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[HALF * 1.0, 900, 64, 1]} />
        <meshStandardMaterial color="#5f7044" roughness={1} />
      </mesh>
    </group>
  );
}
