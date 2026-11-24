// Leafy trees shared by the Traknus World and the simulators that have trees (the same file in each): a trunk with
// boughs, a canopy of leaf cards with soft round light, a dark core so it is never see-through, and a soft shade on
// the ground. LeafTrees draws a list of them as four instanced meshes.
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rand(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cluster of leaves on a transparent ground: drawn on the canopy's cards. */
export function leafTexture() {
  const t = canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      // denser in the middle, a ragged edge
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 112;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r * 0.92;
      const l = 9 + Math.random() * 9;
      g.save();
      g.translate(x, y);
      g.rotate(Math.random() * Math.PI * 2);
      const light = 20 + Math.random() * 22 + (y < 128 ? 6 : 0);
      g.fillStyle = `hsl(${95 + Math.random() * 22}, ${38 + Math.random() * 20}%, ${light}%)`;
      g.beginPath();
      g.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `hsla(100, 30%, ${light - 9}%, 0.8)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-l, 0);
      g.lineTo(l, 0);
      g.stroke();
      g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Canopy in a unit ball: leaf cards facing out at random, with normals pointing away from the centre (soft, round light). */
export function leafCanopy(cards = 30) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rnd = rand(7);
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < cards; i++) {
    const c = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (c.lengthSq() > 1) c.normalize();
    c.multiplyScalar(0.25 + 0.6 * Math.cbrt(rnd()));
    n.copy(c).normalize().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9)).normalize();
    t1.crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    t2.crossVectors(n, t1).normalize();
    const sz = 0.42 + rnd() * 0.22;
    const b = pos.length / 3;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = c.clone().addScaledVector(t1, u * sz).addScaledVector(t2, v * sz);
      pos.push(p.x, p.y, p.z);
      const sn = p.clone().normalize();
      nrm.push(sn.x, sn.y * 0.8 + 0.2, sn.z);
      uv.push((u + 1) / 2, (v + 1) / 2);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Trunk (unit height) with three boughs reaching into the canopy. */
export function trunkWithBoughs() {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.38, 1, 7, 1, true);
  trunk.translate(0, 0.5, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.CylinderGeometry(0.07, 0.14, 0.45, 5, 1, true);
    b.translate(0, 0.22, 0);
    b.rotateZ(0.75);
    b.rotateY((i / 3) * Math.PI * 2 + 0.4);
    b.translate(0, 0.72 + i * 0.07, 0);
    parts.push(b);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
}

/** Both sides of a leaf card light as the side facing out of the canopy (no dark backs). */
export function frontLit<M extends THREE.Material>(m: M) {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  return m;
}

/** A soft dark disc for the shade under a tree (the trees cast no real shadows: too many of them). */
export function shadeTexture() {
  const t = canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}


/** One tree: ground position and height, size, turn. */
export interface TreeAt {
  x: number;
  z: number;
  h: number;
  s: number;
  r: number;
}

export type TreePart = 'trunk' | 'canopy' | 'core' | 'shade';
/** Which material each part is drawn with. */
export const MAT_OF = { trunk: 'bark', canopy: 'leaf', core: 'core', shade: 'shade' } as const;
let shared: { geo: Record<TreePart, THREE.BufferGeometry>; mat: Record<'bark' | 'leaf' | 'core' | 'shade', THREE.Material> } | null = null;
/** Geometries and materials, made once and shared. */
export function treeParts() {
  if (shared) return shared;
  const core = new THREE.IcosahedronGeometry(0.5, 1);
  const shade = new THREE.PlaneGeometry(1, 1);
  shade.rotateX(-Math.PI / 2);
  shared = {
    geo: { trunk: trunkWithBoughs(), canopy: leafCanopy(), core, shade },
    mat: {
      bark: new THREE.MeshStandardMaterial({ color: '#5c4a38', roughness: 1 }),
      leaf: frontLit(new THREE.MeshLambertMaterial({ color: '#ffffff', map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide })),
      core: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      shade: new THREE.MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    },
  };
  return shared;
}

const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new THREE.Vector3();
const col = new THREE.Color();

/** Where each part of a tree goes (the same for the world's trees and the simulators'). */
export const TREE_LAYOUT: Record<TreePart, (m: THREE.Matrix4, t: TreeAt) => void> = {
  trunk: (m, t) => m.compose(v.set(t.x, t.h - 0.1, t.z), q.identity(), sc.set(t.s, 4.5 * t.s, t.s)),
  canopy: (m, t) => m.compose(v.set(t.x, t.h + 5.6 * t.s, t.z), q.setFromEuler(e.set(0, t.r, 0)), sc.set(3.4 * t.s, 2.6 * t.s, 3.4 * t.s)),
  core: (m, t) => m.compose(v.set(t.x, t.h + 5.5 * t.s, t.z), q.setFromEuler(e.set(0, t.r, 0)), sc.set(3.4 * t.s, 2.6 * t.s, 3.4 * t.s)),
  shade: (m, t) => m.compose(v.set(t.x + 0.6 * t.s, t.h + 0.06, t.z + 0.3 * t.s), q.identity(), sc.set(7.5 * t.s, 1, 7.5 * t.s)),
};
/** Each tree's own shade of green. */
export const TREE_TINT: Partial<Record<TreePart, (c: THREE.Color, t: TreeAt) => void>> = {
  canopy: (c, t) => c.setHSL(0.25 + 0.04 * Math.sin(t.r * 3), 0.35, 0.62 + 0.12 * Math.cos(t.r * 5)),
  core: (c, t) => c.setHSL(0.28, 0.5, 0.07 + 0.02 * Math.cos(t.r * 5)),
};

/** One instanced mesh of a tree part for a list of trees. */
export function treeMesh(list: TreeAt[], part: TreePart) {
  const { geo, mat } = treeParts();
  const mesh = new THREE.InstancedMesh(geo[part], mat[MAT_OF[part]], Math.max(1, list.length));
  mesh.count = list.length;
  const m = new THREE.Matrix4();
  list.forEach((t, k) => {
    TREE_LAYOUT[part](m, t);
    mesh.setMatrixAt(k, m);
    const tint = TREE_TINT[part];
    if (tint) {
      tint(col, t);
      mesh.setColorAt(k, col);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = part === 'trunk';
  mesh.receiveShadow = false;
  return mesh;
}

/** A list of trees, four draw calls. */
export function LeafTrees({ trees }: { trees: TreeAt[] }) {
  const meshes = useMemo(() => (['trunk', 'canopy', 'core', 'shade'] as const).map((p) => treeMesh(trees, p)), [trees]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
