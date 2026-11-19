// Keyboard, gamepad and touch. An excavator cab has two joysticks (pattern ISO or SAE, chosen in the panel) and two
// travel levers with pedals. Keyboard: W/S A/D = left joystick, I/K J/L = right joystick, Q/Z and E/C = left and
// right travel levers (arrows drive both together). Gamepad: the two sticks are the two joysticks.
import { powerMax, startEngine, stopEngine } from './sim/excavator';
import { ensureAudio } from './sound';
import { ex, useUI, type CamMode } from './store';

const held = new Set<string>();
/** Touch joysticks and travel sliders write here (phone layout). */
export const touch = { lx: 0, ly: 0, rx: 0, ry: 0, tl: 0, tr: 0, on: false };
if (import.meta.env.DEV) (globalThis as unknown as { touch: typeof touch }).touch = touch;
export const padLook = { x: 0, y: 0 };

export const KEYS: [string, string][] = [
  ['W / S', 'Joystick kiri maju / mundur'],
  ['A / D', 'Joystick kiri kiri / kanan (swing)'],
  ['I / K', 'Joystick kanan maju / mundur'],
  ['J / L', 'Joystick kanan kiri / kanan (bucket)'],
  ['Q / Z', 'Tuas travel kiri maju / mundur'],
  ['E / C', 'Tuas travel kanan maju / mundur'],
  ['Panah', 'Kedua travel sekaligus (↑↓) · belok di tempat (←→)'],
  ['Spasi', 'Power Max (8,5 detik, gaya gali +9,4%)'],
  ['R', 'Hidrolik tambahan: breaker memalu (tahan), grapple capit buka/tutup'],
  ['H', 'Kecepatan travel Lo / Hi'],
  ['M', 'Mode kerja P / E / L (heavy lift)'],
  ['O', 'Swing priority'],
  ['P', 'Tuas pengunci (PPC lock)'],
  ['= / -', 'Dial bahan bakar (rpm)'],
  ['Enter', 'Kunci kontak: hidup / mati mesin'],
  ['B', 'Klakson (truk berangkat)'],
  ['V', 'Ganti kamera'],
  ['G', 'Machine guidance di layar'],
  ['X', 'Mode X-ray hidrolik'],
];
export const PAD_KEYS: [string, string][] = [
  ['Stik', 'Stik kiri = joystick kiri, stik kanan = joystick kanan (pola ISO/SAE dari panel)'],
  ['Travel', 'LT / RT: travel kiri / kanan maju · LB / RB: mundur'],
  ['Tombol', 'A: klakson · B: kamera · X: Power Max · Y: kunci PPC · Start: mesin · D-pad: putar kamera'],
];

export function toggleEngine() {
  void ensureAudio();
  if (ex.engine === 'off') startEngine(ex);
  else stopEngine(ex);
}

export const CAMS: CamMode[] = ['orbit', 'cab', 'bucket', 'spotter', 'top'];
export function nextCam() {
  const ui = useUI.getState();
  ui.set({ cam: CAMS[(CAMS.indexOf(ui.cam) + 1) % CAMS.length] });
}

export let horn = false;

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (e.type === 'keyup') {
    held.delete(k);
    return;
  }
  if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter'].includes(k)) e.preventDefault();
  if (held.has(k)) return;
  held.add(k);
  if (k === 'enter') toggleEngine();
  else if (k === 'v') nextCam();
  else if (k === ' ') powerMax(ex);
  else if (k === 'h') ex.travelHigh = !ex.travelHigh;
  else if (k === 'm') ex.mode = ex.mode === 'P' ? 'E' : ex.mode === 'E' ? 'L' : 'P';
  else if (k === 'o') ex.swingPriority = !ex.swingPriority;
  else if (k === 'p') ex.locked = !ex.locked;
  else if (k === '=' || k === '+') ex.dial = Math.min(1, ex.dial + 0.1);
  else if (k === '-') ex.dial = Math.max(0, ex.dial - 0.1);
  else if (k === 'g') useUI.getState().set({ guidance: !useUI.getState().guidance });
  else if (k === 'x') useUI.getState().set({ xray: !useUI.getState().xray });
  else if (k === 'r' && ex.tool === 'grapple') ex.aux = !ex.aux;
}

export function bindKeys() {
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', () => held.clear());
}

const prev: boolean[] = [];
const dz = (v: number, d = 0.12) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
const ease = (cur: number, want: number, dt: number, rate = 3) => cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), dt * rate);

/** Continuous controls, called every frame. */
export function applyHeld(dt: number) {
  let gp: Gamepad | null = null;
  for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) gp = gp ?? g;
  const btn = (i: number) => !!gp?.buttons[i]?.pressed;
  const val = (i: number) => gp?.buttons[i]?.value ?? 0;
  const ax = (i: number) => dz(gp?.axes[i] ?? 0);
  let padHorn = false;
  if (gp) {
    const press = (i: number) => btn(i) && !prev[i];
    if (press(1)) nextCam();
    if (press(9)) toggleEngine();
    if (press(2)) powerMax(ex);
    if (press(3)) ex.locked = !ex.locked;
    padHorn = btn(0);
    gp.buttons.forEach((b, i) => (prev[i] = b.pressed));
    padLook.x = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
    padLook.y = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  }
  horn = padHorn || held.has('b');
  if (ex.tool === 'breaker') ex.aux = held.has('r') || !!(gp && btn(10));
  ex.horn = horn;
  const key = (a: string, b: string) => (held.has(a) ? 1 : 0) - (held.has(b) ? 1 : 0);
  // joysticks: + forward / right (keyboard levers ease in like proportional pilot valves)
  const lx = gp && ax(0) ? ax(0) : touch.lx || key('d', 'a');
  const ly = gp && ax(1) ? -ax(1) : touch.ly || key('w', 's');
  const rx = gp && ax(2) ? ax(2) : touch.rx || key('l', 'j');
  const ry = gp && ax(3) ? -ax(3) : touch.ry || key('i', 'k');
  const analog = !!gp || touch.on;
  ex.lx = analog ? lx : ease(ex.lx, lx, dt, 2.5);
  ex.ly = analog ? ly : ease(ex.ly, ly, dt, 2.5);
  ex.rx = analog ? rx : ease(ex.rx, rx, dt, 2.5);
  ex.ry = analog ? ry : ease(ex.ry, ry, dt, 2.5);
  // travel levers
  const both = key('arrowup', 'arrowdown');
  const turn = key('arrowright', 'arrowleft');
  let tl = key('q', 'z') || both + turn;
  let tr = key('e', 'c') || both - turn;
  if (gp) {
    const l = val(6) - (btn(4) ? 1 : 0);
    const r = val(7) - (btn(5) ? 1 : 0);
    if (l || r) {
      tl = l;
      tr = r;
    }
  }
  if (touch.tl || touch.tr) {
    tl = touch.tl;
    tr = touch.tr;
  }
  ex.trackL = ease(ex.trackL, Math.max(-1, Math.min(1, tl)), dt, 2);
  ex.trackR = ease(ex.trackR, Math.max(-1, Math.min(1, tr)), dt, 2);
}
