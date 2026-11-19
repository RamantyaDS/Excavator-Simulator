import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PONTOON, create, equipment, frames, setUnder, startEngine, step, swapTool, tipWorld, type Exc } from './excavator';
import { LOWBED, QUARRY, RACK, RODEO } from './site';
import { heightAt } from './terrain';

const run = (c: Exc, s: number, each?: (c: Exc) => void) => {
  for (let t = 0; t < s; t += 0.01) {
    each?.(c);
    step(c, 0.01);
    c.msg = '';
  }
};
const place = (c: Exc, x: number, z: number, heading = 0) => {
  c.p.set(x, heightAt(c.terrain, x, z) + 0.3, z);
  c.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  c.v.set(0, 0, 0);
  c.w.set(0, 0, 0);
  c.prevTip.copy(tipWorld(c));
};

describe('phase 2', () => {
  it('climbs the lowbed ramp onto the deck', () => {
    const c = create();
    startEngine(c);
    place(c, LOWBED.x, LOWBED.z + LOWBED.z0 - LOWBED.ramp - 6, 0);
    run(c, 3);
    run(c, 30, (c) => {
      c.trackL = c.trackR = c.p.z < LOWBED.z + 0.5 ? 1 : 0;
    });
    expect(c.p.y).toBeGreaterThan(LOWBED.deck - 0.15);
    expect(c.failed).toBe('');
  });

  it('floats on the pontoons in the swamp and paddles forward', () => {
    const c = create();
    setUnder(c, 'pontoon');
    startEngine(c);
    place(c, -64, -72, Math.PI / 2);
    c.p.y = c.terrain.water[2];
    run(c, 6);
    expect(c.failed).toBe('');
    expect(c.p.y).toBeGreaterThan(-3.0 + 0.2); // not resting on the bottom
    expect(c.p.y).toBeLessThan(c.terrain.water[2]);
    const x0 = c.p.x;
    run(c, 15, (c) => (c.trackL = c.trackR = 1));
    expect(c.p.x - x0).toBeGreaterThan(2);
    expect(PONTOON.len).toBe(11);
  });

  it('breaks rock with the breaker', () => {
    const c = create();
    startEngine(c);
    // to the rack, swap
    place(c, RACK.x, RACK.z - 8, 0);
    run(c, 2);
    swapTool(c, 'breaker');
    run(c, 3.5);
    expect(c.tool).toBe('breaker');
    // at the quarry face, chisel down onto the rock and hammer
    place(c, QUARRY.x1 + 4.5, QUARRY.z0 + 12, -Math.PI / 2);
    // arm out, chisel pointing straight down
    c.boom = 0.5;
    c.arm = -1.2;
    c.bucket = -Math.PI / 2 - c.boom - c.arm;
    c.prevTip.copy(tipWorld(c));
    run(c, 2);
    run(c, 6, (c) => {
      const T = tipWorld(c);
      c.ry = T.y > heightAt(c.terrain, T.x, T.z) - 0.05 ? 0.4 : 0.05;
      c.aux = true;
    });
    expect(c.broken).toBeGreaterThan(0.05);
  });

  it('scoops the Rodeo ball into the bucket and carries it', () => {
    const c = create();
    startEngine(c);
    const ball = c.props.find((q) => q.kind === 'ball')!;
    // put the bucket under the ball, mouth up
    place(c, RODEO.x - 2, RODEO.z - 10, 0);
    run(c, 2);
    const e = equipment(c);
    const B = e.B.clone().applyMatrix4(frames(c).upper);
    ball.p.copy(B).add(new THREE.Vector3(0, 0.3, 0));
    ball.v.set(0, 0, 0);
    run(c, 0.5);
    expect(ball.held).toBe('bucket');
    run(c, 2, (c) => (c.lx = 0.6));
    expect(ball.held).toBe('bucket');
  });
});
