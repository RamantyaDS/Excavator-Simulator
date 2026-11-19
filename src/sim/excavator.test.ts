import { describe, expect, it } from 'vitest';
import { bucketCap, create, equipment, heading, startEngine, step, tipWorld, type Exc } from './excavator';
import { heightAt } from './terrain';

const run = (c: Exc, s: number, each?: (c: Exc) => void) => {
  for (let t = 0; t < s; t += 0.01) {
    each?.(c);
    step(c, 0.01);
    c.msg = '';
  }
};

describe('PC800 body', () => {
  it('settles on its tracks and stays put with the engine off', () => {
    const c = create();
    run(c, 4);
    const p0 = c.p.clone();
    run(c, 6);
    expect(c.failed).toBe('');
    expect(c.p.distanceTo(p0)).toBeLessThan(0.03);
    expect(c.tilt).toBeLessThan(0.05);
  });

  it('travels at about 2.8 km/h in low and pivots on the spot with the tracks opposed', () => {
    const c = create();
    startEngine(c);
    run(c, 3);
    const z0 = c.p.z;
    run(c, 10, (c) => {
      c.trackL = c.trackR = 1;
    });
    const v = (c.p.z - z0) / 10;
    expect(v).toBeGreaterThan(0.55);
    expect(v).toBeLessThan(0.85);
    const h0 = heading(c);
    run(c, 8, (c) => {
      c.trackL = 1;
      c.trackR = -1;
    });
    expect(Math.abs(heading(c) - h0)).toBeGreaterThan(0.3);
    expect(c.failed).toBe('');
  });
});

describe('digging', () => {
  it('cuts the ground and fills the bucket, which holds its load when curled', () => {
    const c = create();
    startEngine(c);
    run(c, 3);
    // arm out, teeth down
    run(c, 3, (c) => {
      c.ly = 1;
      const e = equipment(c);
      c.rx = e.phi < -1.4 ? 0.7 : e.phi > -1.2 ? -0.7 : 0;
    });
    // boom down until the edge is ~0.6 m in
    run(c, 4, (c) => {
      c.ly = 0;
      c.rx = 0;
      c.ry = c.cutting < 0.6 ? 0.6 : 0;
    });
    // crowd the arm, curl as it fills, keep the edge in with a little boom
    run(c, 2.5, (c) => {
      c.ry = c.cutting < 0.4 ? 0.25 : c.cutting > 1.0 ? -0.3 : 0;
      c.ly = -1;
      c.rx = -0.3;
    });
    run(c, 2, (c) => {
      c.ry = -0.4;
      c.ly = 0;
      c.rx = equipment(c).mouthY < 0.9 ? -1 : 0;
    });
    expect(c.vol).toBeGreaterThan(bucketCap(c) * 0.5);
    // lift it: the load stays
    const v0 = c.vol;
    run(c, 3, (c) => {
      c.rx = 0;
      c.ry = -1; // boom up
    });
    expect(c.vol).toBeGreaterThan(v0 * 0.75); // the heap above the struck line falls off
    expect(equipment(c).mouthY).toBeGreaterThan(0.2);
    expect(c.failed).toBe('');
  });
});
