import { describe, expect, it } from 'vitest';
import { create, equipment, frames, intrudes, setArm, startEngine, step, type Exc } from './excavator';
import { heightAt } from './terrain';

const run = (c: Exc, s: number, each?: (c: Exc) => void) => {
  for (let t = 0; t < s; t += 0.01) {
    each?.(c);
    step(c, 0.01);
    c.msg = '';
  }
};

/** Deepest any arm or boom point goes below the ground (m). */
function belowGround(c: Exc) {
  const e = equipment(c);
  const U = frames(c).upper;
  let worst = 0;
  for (const p of [0.2, 0.4, 0.6, 0.8].map((k) => e.P1.clone().lerp(e.P2, k)).concat([e.P1, e.F.clone().lerp(e.P1, 0.7)])) {
    const w = p.applyMatrix4(U);
    worst = Math.max(worst, heightAt(c.terrain, w.x, w.z) - w.y);
  }
  return worst;
}

describe('no passing through', () => {
  it('the long arm laid flat and the boom pushed down stay on top of the ground', () => {
    const c = create();
    setArm(c, 'a56');
    startEngine(c);
    run(c, 2);
    run(c, 10, (c) => {
      c.ly = 1; // arm out
      c.ry = 1; // boom down
    });
    expect(belowGround(c)).toBeLessThan(0.35);
    expect(c.failed).toBe('');
  });

  it('crowding the arm in with the boom down does not put the bucket into the tracks or cab', () => {
    const c = create();
    startEngine(c);
    run(c, 2);
    let worst = '';
    run(c, 12, (c) => {
      c.ly = -1; // arm in
      c.ry = 0.6; // boom down
      c.rx = 0.5; // bucket open
      worst = worst || intrudes(c);
    });
    expect(worst).toBe('');
  });
});
