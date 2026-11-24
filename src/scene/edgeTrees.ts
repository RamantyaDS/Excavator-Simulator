// Where the trees around the dig site stand: a ring, [x, z, size].
export const EDGE_TREES: [number, number, number][] = [];
for (let i = 0; i < 90; i++) {
  const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03;
  const r = 88 + ((i * 37) % 34);
  EDGE_TREES.push([Math.cos(a) * r, Math.sin(a) * r, 0.8 + ((i * 13) % 7) / 10]);
}
