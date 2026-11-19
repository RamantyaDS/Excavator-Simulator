// The diggable ground as one mesh, one vertex per cell. Only the rows the sim changed are re-uploaded. Untouched
// field is grass: its own blade texture at two scales (no visible tiling) plus 3D clumps that sway and vanish where
// the ground is dug. Elsewhere the colour comes from the soil (topsoil, clay, sand, peat, rock, spoil) over an earth
// texture with clods and stones, darker where wet. With machine guidance on, the job's design area is tinted by the
// height against the design: red still to cut, green on grade, blue over-dug. Open water below the water table.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { design, PEAT } from '../sim/site';
import { CELL, HALF, N, SOIL, idx, surfaceSoil } from '../sim/terrain';
import { ex, useUI } from '../store';
import { useCanvasTexture } from './parts';

/** Is this cell still the original grass (undisturbed topsoil of the field)? */
export function isGrass(k: number) {
  const t = ex.terrain;
  return t.zone[k] <= 1 && Math.abs(t.h[k] - t.orig[k]) < 0.03 && t.h[k] <= t.nat[k] + 0.02;
}

/** Grass from above: thousands of blades in mixed greens over dark soil, some dry ones, clover, bare specks. */
function paintGrass(g: CanvasRenderingContext2D, S: number) {
  g.fillStyle = '#3d4a22';
  g.fillRect(0, 0, S, S);
  const greens = ['#4f6b2a', '#5c7a30', '#6b8a36', '#46612a', '#7a9440', '#55722c', '#8a9a4a', '#3f5a26'];
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = Math.random() * Math.PI * 2;
    const l = 3 + Math.random() * 7;
    g.strokeStyle = Math.random() < 0.06 ? '#a39a5c' : greens[(Math.random() * greens.length) | 0];
    g.lineWidth = 0.8 + Math.random() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 1, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.fillStyle = Math.random() < 0.5 ? '#5f8a34' : '#6d9a3a';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x + Math.cos(k * 2.1) * 2.2, y + Math.sin(k * 2.1) * 2.2, 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#5a4a33' : '#6b5a3e';
    g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
  }
}

/** Earth: clods, cracks, small stones in grey (tinted by the soil colour). */
function paintSoil(g: CanvasRenderingContext2D, S: number) {
  g.fillStyle = '#bdbdbd';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.random() * 120;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    const r = 1 + Math.random() * Math.random() * 9;
    g.beginPath();
    g.ellipse(Math.random() * S, Math.random() * S, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 700; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(70,70,70,0.35)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 70; i++) {
    let x = Math.random() * S;
    let y = Math.random() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.5) * 22;
      y += (Math.random() - 0.5) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function colorOf(k: number, x: number, z: number, guide: boolean, out: THREE.Color) {
  const t = ex.terrain;
  const s = surfaceSoil(t, k);
  const [r, g, b] = SOIL[s].color;
  out.setRGB(r, g, b, THREE.SRGBColorSpace);
  if (isGrass(k)) out.setRGB(1, 1, 1); // the grass texture carries the colour
  const water = t.water[t.zone[k]];
  const wet = Math.max(0, Math.min(1, 1 - (t.h[k] - water) / 1.2));
  out.multiplyScalar(1 - wet * 0.45);
  if (guide) {
    const d = design(ex.job, x, z);
    if (d !== null) {
      if (isGrass(k)) out.setRGB(0.36, 0.45, 0.22, THREE.SRGBColorSpace);
      const dh = t.h[k] - d;
      if (Math.abs(dh) <= 0.06) out.lerp(new THREE.Color(0.15, 0.8, 0.3), 0.75);
      else if (dh > 0) out.lerp(new THREE.Color(0.95, 0.25, 0.15), Math.min(0.75, 0.3 + dh * 0.2));
      else out.lerp(new THREE.Color(0.15, 0.35, 0.95), Math.min(0.8, 0.4 - dh * 0.6));
    }
  }
}

export function Ground() {
  const guidance = useUI((s) => s.guidance);
  const grain = useCanvasTexture(512, 512, (g) => paintSoil(g, 512), [110, 110]);
  const grassTex = useCanvasTexture(512, 512, (g) => paintGrass(g, 512), [1, 1]);
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
    g.setAttribute('grass', new THREE.BufferAttribute(new Float32Array(N * N), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), HALF * 1.5);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF, -20, -HALF), new THREE.Vector3(HALF, 20, HALF));
    return g;
  }, []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: grain });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.grassMap = { value: grassTex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float grass;\nvarying float vGrass;\nvarying vec2 vWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = grass;\nvWorld = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D grassMap;\nvarying float vGrass;\nvarying vec2 vWorld;')
        .replace(
          '#include <map_fragment>',
          `vec4 soilT = texture2D(map, vMapUv);
          vec3 g1 = texture2D(grassMap, vWorld / 2.3).rgb;
          vec3 g2 = texture2D(grassMap, vWorld / 9.7 + 0.37).rgb;
          float patchy = 0.5 + 0.5 * sin(vWorld.x * 0.11 + sin(vWorld.y * 0.07) * 3.0) * sin(vWorld.y * 0.09);
          vec3 grassC = mix(g1, g2, 0.45) * mix(0.82, 1.18, patchy);
          diffuseColor.rgb *= mix(soilT.rgb, grassC * 1.25, vGrass);`,
        );
    };
    return m;
  }, [grain, grassTex]);

  const guideRef = useRef(guidance);
  useEffect(() => {
    guideRef.current = guidance;
    ex.terrain.dirty = [0, 0, N - 1, N - 1];
  }, [guidance]);
  const job = useRef(ex.job);

  const tmp = useMemo(() => new THREE.Color(), []);
  const peatWater = useRef<THREE.Mesh>(null);
  const fieldW = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = ex.terrain;
    if (peatWater.current) peatWater.current.position.y = t.water[2];
    if (fieldW.current) fieldW.current.position.y = t.water[0];
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
    const grassA = geo.attributes.grass as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const Nn = nor.array as Float32Array;
    const C = col.array as Float32Array;
    const Gr = grassA.array as Float32Array;
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
        Gr[k] = isGrass(k) && !(guide && design(ex.job, P[k * 3], P[k * 3 + 2]) !== null) ? 1 : 0;
      }
    const start = j0 * N * 3;
    const count = (j1 - j0 + 1) * N * 3;
    for (const a of [pos, nor, col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(start, count);
      a.needsUpdate = true;
    }
    grassA.clearUpdateRanges();
    grassA.addUpdateRange(j0 * N, (j1 - j0 + 1) * N);
    grassA.needsUpdate = true;
  });

  const water = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b4a3a', metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.82 }), []);
  const fieldWater = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4d5b52', metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85 }), []);
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow castShadow={false} />
      <mesh ref={peatWater} position={[(PEAT.x0 + PEAT.x1) / 2, ex.terrain.water[2], (PEAT.z0 + PEAT.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={water}>
        <planeGeometry args={[PEAT.x1 - PEAT.x0 - 0.5, PEAT.z1 - PEAT.z0 - 0.5]} />
      </mesh>
      <mesh ref={fieldW} position={[30, ex.terrain.water[0], 10]} rotation={[-Math.PI / 2, 0, 0]} material={fieldWater}>
        <planeGeometry args={[100, 140]} />
      </mesh>
      <Beyond tex={grassTex} />
      <Tufts />
      <Stones />
    </group>
  );
}

/** The land beyond the site, the same grass. */
function Beyond({ tex }: { tex: THREE.Texture }) {
  const t = useMemo(() => {
    const c = tex.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(320, 320);
    c.needsUpdate = true;
    return c;
  }, [tex]);
  return (
    <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <ringGeometry args={[HALF, 900, 64, 1]} />
      <meshStandardMaterial map={t} color="#e8f0d8" roughness={1} />
    </mesh>
  );
}

/** 3D grass clumps on the untouched field: crossed blade cards with an alpha texture, swaying; gone where dug. */
function Tufts() {
  const COUNT = 16000;
  const ref = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  const blades = useCanvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    const cols = ['#4f6b2a', '#5f7d32', '#6e8c3a', '#829a46', '#475f28', '#9a9a58'];
    for (let i = 0; i < 46; i++) {
      const x = 8 + Math.random() * 112;
      const h = 50 + Math.random() * 74;
      const lean = (Math.random() - 0.5) * 30;
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.beginPath();
      g.moveTo(x - 2.2, 128);
      g.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.6, x + lean, 128 - h);
      g.quadraticCurveTo(x + lean * 0.4 + 1, 128 - h * 0.6, x + 2.2, 128);
      g.fill();
    }
  });
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const nor: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const dx = Math.cos(a) * 0.32;
      const dz = Math.sin(a) * 0.32;
      const q = [
        [-dx, 0, -dz, 0, 0],
        [dx, 0, dz, 1, 0],
        [dx, 0.42, dz, 1, 1],
        [-dx, 0, -dz, 0, 0],
        [dx, 0.42, dz, 1, 1],
        [-dx, 0.42, -dz, 0, 1],
      ];
      for (const [x, y, z, u, v] of q) {
        pos.push(x, y, z);
        uv.push(u, v);
        nor.push(0, 1, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }, []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: blades, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: '#b8c49c' });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      // both faces lit from above (a blade card has no back)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.07 * position.y / 0.42;
        transformed.x += sway; transformed.z += sway * 0.6;`,
      );
    };
    return m;
  }, [blades, time]);
  const spots = useMemo(() => {
    const out: { x: number; z: number; k: number; s: number; r: number }[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let tries = 0;
    while (out.length < COUNT && tries++ < COUNT * 6) {
      const x = (rnd() - 0.5) * HALF * 2 * 0.98;
      const z = (rnd() - 0.5) * HALF * 2 * 0.98;
      const k = idx(Math.min(N - 1, Math.round((x + HALF) / CELL)), Math.min(N - 1, Math.round((z + HALF) / CELL)));
      if (!isGrass(k)) continue;
      out.push({ x, z, k, s: 0.6 + rnd() * 0.9, r: rnd() * 6.28 });
    }
    return out;
  }, []);
  const shown = useRef(new Int8Array(COUNT).fill(-1));
  const frame = useRef(0);
  useFrame((_, dt) => {
    time.value += dt;
    if (frame.current++ % 20 !== 0) return;
    const m = ref.current!;
    const M4 = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const P = new THREE.Vector3();
    const Sc = new THREE.Vector3();
    let changed = false;
    spots.forEach((p, n) => {
      const on = isGrass(p.k) ? 1 : 0;
      if (on === shown.current[n]) return;
      shown.current[n] = on;
      changed = true;
      Q.setFromAxisAngle(up, p.r);
      const sc = on ? p.s : 0;
      M4.compose(P.set(p.x, ex.terrain.h[p.k] - 0.02, p.z), Q, Sc.set(sc, sc, sc));
      m.setMatrixAt(n, M4);
    });
    if (changed) m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} frustumCulled={false} receiveShadow />;
}

/** Loose stones on the field. */
function Stones() {
  const COUNT = 700;
  const ref = useRef<THREE.InstancedMesh>(null);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    const M4 = new THREE.Matrix4();
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < COUNT; n++) {
      const x = (rnd() - 0.5) * HALF * 1.9;
      const z = (rnd() - 0.5) * HALF * 1.9;
      const k = idx(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL));
      const s = 0.06 + rnd() * rnd() * 0.3;
      M4.compose(new THREE.Vector3(x, ex.terrain.h[k] + s * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(s, s * 0.6, s * 0.9));
      ref.current!.setMatrixAt(n, M4);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#8a857b" roughness={0.9} flatShading />
    </instancedMesh>
  );
}
