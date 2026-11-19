// Komatsu PC800-8E0 backhoe, 8 200 mm boom. Official figures from the Komatsu brochure (CEN00383): weights, engine,
// pumps and reliefs, forces, swing and travel speeds, undercarriage and working range. Joint ranges are fitted so
// the working range matches the brochure within ~0.2 m. Masses of the work equipment and cycle times are estimates.
//
// Frames: x = machine LEFT, y up, z forward (right-handed). The carrier origin is on the ground under the swing
// centre; the upper turns about y by the swing angle.

export type ArmId = 'a36' | 'a46' | 'a56';
export type ToolId = 'bucket' | 'breaker' | 'grapple';
export type ShoeId = 610 | 810 | 1010;

export const ARMS: Record<ArmId, { len: number; mass: number; name: string; bucket: number }> = {
  a36: { len: 3.6, mass: 4300, name: 'Arm 3 600 mm (standar)', bucket: 3.1 },
  a46: { len: 4.6, mass: 4900, name: 'Arm 4 600 mm', bucket: 2.8 },
  a56: { len: 5.6, mass: 5500, name: 'Arm 5 600 mm (jangkauan panjang)', bucket: 2.3 },
};

export const SHOES: Record<ShoeId, { mass: number; kpa: number }> = {
  610: { mass: 0, kpa: 122 },
  810: { mass: 1330, kpa: 93 },
  1010: { mass: 2610, kpa: 76 },
};

export const SPEC = {
  name: 'Komatsu PC800-8E0',
  operatingKg: 74500, // 610 mm shoes, 8 200 boom, 3 600 arm, 3.1 m³ bucket
  counterweightKg: 9800,
  engine: { model: 'SAA6D140E-5', kw: 363, rpm: 1800, idle: 1050, highIdle: 1950, decel: 1400 },
  pumpLpm: 2 * 494,
  relief: { implement: 31.4, travel: 34.3, swing: 28.4, heavyLift: 34.3 }, // MPa
  swingRpm: 6.8,
  travelKmh: [2.8, 4.2],
  drawbarN: 559e3,
  gradeability: 0.7,
  // undercarriage
  gauge: 3.5,
  gaugeRetracted: 3.39,
  tumbler: 4.5, // sprocket to idler centres on the ground
  trackLen: 5.81,
  trackH: 1.25, // top of the track (est.)
  shoesPerSide: 47,
  trackRollers: 8,
  carrierRollers: 3,
  // upper
  ringY: 1.56, // counterweight clearance
  houseW: 3.67,
  tailR: 4.4,
  cabTop: 4.0,
  boomFoot: { x: -0.25, y: 2.6, z: 0.9 }, // est.: boom a little right of centre, cab on the left
  boomLen: 8.2,
  bucketLen: 2.3, // pin to tooth tip (est. for the 3.1 m³ bucket)
  bucketW: 1.95, // est.
  // joint ranges (rad): boom from horizontal, arm relative to the boom, bucket relative to the arm
  boomRange: [(-42 * Math.PI) / 180, (62 * Math.PI) / 180],
  armRange: [(-160 * Math.PI) / 180, (-55 * Math.PI) / 180],
  bucketRange: [(-140 * Math.PI) / 180, (35 * Math.PI) / 180],
  // work equipment masses (est.) and full-lever speeds (rad/s) at full pump flow
  mass: { carrier: 33000, upper: 27500, boom: 7600, bucket: 3200 },
  rate: { boomUp: 0.46, boomDown: 0.58, armIn: 0.47, armOut: 0.56, curl: 1.12, dump: 1.5 },
  // share of the total pump flow each function takes at full lever
  flow: { boomUp: 0.72, boomDown: 0.34, armIn: 0.7, armOut: 0.6, curl: 0.45, dump: 0.4, swing: 0.42, travel: 0.5 },
  // torque capacity at the relief (N·m), from cylinder sizes and the ISO 6015 forces (power max ×1.094)
  cap: { boomUp: 2.05e6, boomDown: 1.25e6, armIn: 1.47e6, armOut: 1.15e6, curl: 0.77e6, dump: 0.58e6 },
  powerMax: { gain: 1.094, seconds: 8.5 },
  bucketForceN: 364e3,
  armForceN: 273e3,
  workingRange: { height: 11.84, dump: 8.145, depth: 8.6, wall: 5.575, reach: 13.74, reachGround: 13.46, minSwing: 6.06 },
};
