// Excavator sound: a synthesized inline six (the Komatsu SAA6D140E is a 15 L six) over real diesel recordings from
// Wikimedia Commons (see README): idle and raised-speed loops pitched to the engine speed, a diesel start, the
// shutdown, and a hydraulic pump whine that follows the levers. Synthesized on top: relief valve squeal at a stall,
// travel alarm, track clatter, horn, the bucket hitting things, soil pouring, warnings, the site around.
import { ENGINE_WORKLET } from './engineWorklet';
import { horn } from './input';
import { ex as cr, toast } from './store';
import { fallbackActive, fallbackEvent, startFallback, updateFallback } from './soundFallback';

const BASE = import.meta.env.BASE_URL + 'audio/';
let ctx: AudioContext | null = null;
let master: GainNode;
let enabled = true;
let N: Awaited<ReturnType<typeof build>> | null = null;

/** What the sound system is doing, shown in the panel so problems are visible without developer tools. */
export const soundStatus = { text: 'belum aktif', ok: false };
const report = (text: string, ok = false) => {
  soundStatus.text = text;
  soundStatus.ok = ok;
};

let unlocked = false;
/** Resume and play a short silent buffer from inside a user gesture: the reliable way to unlock Web Audio. */
function unlock(c: AudioContext) {
  if (c.state === 'running' && unlocked) return;
  c.resume().catch(() => undefined);
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
  unlocked = c.state === 'running';
}

/** The ignition key click, played inside the start gesture (an audible tone in the gesture wakes up Edge). */
function keyClick(c: AudioContext) {
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(1800, t0);
  o.frequency.exponentialRampToValueAtTime(600, t0 + 0.05);
  g.gain.setValueAtTime(0.12, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.15);
}

async function load(c: AudioContext, name: string) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const data = await r.arrayBuffer();
  return new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(data, res, (e) => rej(new Error(`${name}: tidak bisa didekode (${e?.message ?? e})`))));
}

function noise(c: AudioContext) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function loop(c: AudioContext, buf: AudioBuffer, out: AudioNode) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const g = c.createGain();
  g.gain.value = 0;
  s.connect(g).connect(out);
  s.start();
  return { s, g };
}

async function build(c: AudioContext) {
  const [idleB, midB, startB, stopB, hydB] = await Promise.all(
    ['engine-idle-810rpm.wav', 'engine-mid-1290rpm.wav', 'engine-start.wav', 'engine-stop.wav', 'hydraulic-pump.wav'].map((n) => load(c, n)),
  );
  // Engine bus: load opens up the tone (lowpass) and adds a little grit.
  const engineBus = c.createGain();
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2500;
  const body = c.createBiquadFilter();
  body.type = 'lowshelf';
  body.frequency.value = 120;
  body.gain.value = 5;
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  shaper.curve = curve;
  engineBus.connect(body).connect(tone).connect(shaper).connect(master);
  const idle = loop(c, idleB, engineBus);
  const mid = loop(c, midB, engineBus);

  // Synthesized inline six: the main voice of the engine. Optional: some browsers block AudioWorklet.
  const synthG = c.createGain();
  synthG.gain.value = 0;
  let synth: AudioWorkletNode | null = null;
  try {
    if (!c.audioWorklet) throw new Error('AudioWorklet not available');
    const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
    await c.audioWorklet.addModule(url);
    synth = new AudioWorkletNode(c, 'diesel-engine', { outputChannelCount: [1] });
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    synth.connect(lp).connect(synthG).connect(engineBus);
  } catch (e) {
    console.warn('Engine synth layer unavailable, using recordings only', e);
  }

  const nb = noise(c);
  const noiseLoop = (type: BiquadFilterType, f: number, q: number) => {
    const s = c.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    s.connect(fl).connect(g).connect(master);
    s.start();
    return { f: fl, g };
  };
  const osc = (type: OscillatorType, f: number, lowpass = 0) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0;
    if (lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      o.connect(lp).connect(g).connect(master);
    } else o.connect(g).connect(master);
    o.start();
    return { o, g };
  };

  const turbo = osc('sine', 3000);
  const winch = osc('sawtooth', 120, 900); // winch gears
  const hyd = loop(c, hydB, master); // crane hydraulics
  const relief = noiseLoop('bandpass', 2900, 6); // relief valve when the RCL holds a function
  const tyre = noiseLoop('bandpass', 380, 0.7);
  const wind = noiseLoop('lowpass', 420, 0.5);
  // horn: two detuned reeds
  const hornG = c.createGain();
  hornG.gain.value = 0;
  const hornLp = c.createBiquadFilter();
  hornLp.type = 'lowpass';
  hornLp.frequency.value = 2000;
  hornG.connect(hornLp).connect(master);
  for (const f of [311, 392]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(hornG);
    o.start();
  }
  const beep = osc('square', 1600); // swing alarm
  const alarm = osc('square', 2600); // RCL
  const buzz = osc('sawtooth', 180, 1200); // two-block
  return { startB, stopB, nb, engineBus, tone, idle, mid, synth, synthG, turbo, winch, hyd, relief, tyre, wind, hornG, beep, alarm, buzz };
}

// After the user has asked for sound, every interaction retries: creating the AudioContext failed on the first
// click in one Edge setup and only worked on a later one.
let wanted = false;
let attempts = 0;
let lastError = '';
let building = false;
let useFallbackNext = false;
const retry = () => {
  if (!wanted || fallbackActive()) return;
  if (useFallbackNext) {
    startFallback();
    if (master) master.gain.value = 0;
    return report('jalur cadangan <audio> (Web Audio terkunci)', true);
  }
  void ensureAudio();
};

let clicked = false;
/** Create the context if needed, resume it and play the key click, all inside the user's gesture. */
export async function ensureAudio() {
  wanted = true;
  if (!ctx) await initSound();
  if (!ctx) return;
  await ctx.resume().catch(() => undefined);
  if (!clicked) {
    clicked = true;
    keyClick(ctx);
  }
}
for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) addEventListener(ev, retry, { capture: true });

/** Must be called from a user gesture. */
export async function initSound() {
  wanted = true;
  if (ctx) return ctx.resume();
  if (building) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return report('browser tidak mendukung Web Audio');
  attempts++;
  let c: AudioContext;
  try {
    if (new URLSearchParams(location.search).get('audio') === 'html') throw new Error('forced by ?audio=html');
    c = new AC();
  } catch (e) {
    lastError = `${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? e}`.trim();
    console.error('AudioContext failed', e);
    if (attempts >= 2 || lastError.includes('forced')) {
      startFallback();
      return report(`jalur cadangan <audio> (Web Audio gagal: ${lastError})`, true);
    }
    return report(`Web Audio gagal, mencoba lagi di klik berikutnya (${lastError})`);
  }
  building = true;
  ctx = c;
  unlock(ctx);
  report('memuat rekaman…');
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  master.connect(comp).connect(ctx.destination);
  try {
    N = await build(ctx);
    report(ctx.state === 'running' ? `aktif${N.synth ? '' : ' (tanpa lapisan sintetis)'}` : 'dijeda browser, klik di mana saja', ctx.state === 'running');
    if (ctx.state !== 'running') toast('Klik di mana saja untuk menyalakan suara.', 6000);
    setTimeout(() => {
      if (ctx && ctx.state !== 'running' && !fallbackActive()) {
        useFallbackNext = true;
        report('Web Audio terkunci, klik sekali lagi untuk jalur cadangan');
      }
    }, 1500);
    ctx.onstatechange = () => report(ctx!.state === 'running' ? 'aktif' : `status: ${ctx!.state}`, ctx!.state === 'running');
  } catch (e) {
    console.error('Sound failed to load', e);
    lastError = `${(e as Error)?.message ?? e}`;
    report(`gagal: ${lastError}`);
  }
  building = false;
}

export function setSound(on: boolean) {
  enabled = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}
export const soundOn = () => enabled;

function oneShot(buf: AudioBuffer, gain = 1, rate = 1) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  s.connect(g).connect(master);
  s.start();
}

/** A metallic knock: band-passed noise plus a falling thud. */
function clunk(freq = 1600, gain = 0.4, len = 0.1) {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = N.nb;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + len + 0.05);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq / 12, t);
  o.frequency.exponentialRampToValueAtTime(40, t + len * 1.5);
  const og = ctx.createGain();
  og.gain.setValueAtTime(gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.5);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + len * 2);
}

/** A burst of filtered noise: air hiss, dryer purge, chain clank, scraping. */
function burst(freq: number, q: number, gain: number, len: number, type: BiquadFilterType = 'bandpass', attack = 0.005) {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = N.nb;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + len + 0.05);
}

export function playEvent(e: string) {
  fallbackEvent(e);
  if (!N) return;
  if (e === 'start') oneShot(N.startB, 1);
  else if (e === 'stop') oneShot(N.stopB, 1);
  else if (e === 'dump' || e === 'truck-load') burst(500, 0.8, 0.35, 1.4, 'lowpass', 0.08);
  else if (e === 'clang') clunk(600, 0.9, 0.4);
  else if (e === 'powermax') beepOnce(1800, 0.12);
  else if (e === 'truck-ready') beepOnce(900, 0.2);
  else if (e === 'truck-leave' || e === 'truck-overload') clunk(220, 0.5, 0.3);
  else if (e === 'coupler') {
    clunk(1400, 0.4, 0.12);
    setTimeout(() => clunk(900, 0.5, 0.15), 200);
  } else if (e === 'fail-tipped' || e === 'fail-truck') {
    clunk(110, 1.2, 0.9);
    burst(600, 0.5, 0.9, 2.2, 'lowpass', 0.05);
    burst(3200, 1, 0.4, 1.5);
  } else if (e === 'fail-powerline') {
    burst(5000, 0.5, 0.6, 1.2, 'highpass', 0.002);
    clunk(90, 1, 0.6);
  } else if (e === 'fail-utility') {
    clunk(300, 0.8, 0.3);
    burst(2500, 0.6, 0.5, 4, 'highpass', 0.05);
  }
}

function beepOnce(f: number, len: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.05, t);
  g.gain.setValueAtTime(0, t + len);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + len + 0.05);
}

let nextHammer = 3;
let nextBeep = 20;
/** Per-frame update; `distance` from the camera to the crane, `inCab` for the muffled cab view. */
export function updateSound(distance: number, inCab: boolean) {
  updateFallback(distance, inCab);
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const k = (p: AudioParam, v: number, tc = 0.05) => p.setTargetAtTime(v, t, tc);
  const near = Math.min(1, 16 / Math.max(6, distance));
  const running = cr.engine === 'running' || cr.engine === 'starting';
  const on = cr.engine === 'running' ? 1 : 0;
  const rpm = Math.max(1, cr.rpm);
  const cab = inCab ? 0.55 : 1;

  // engine: recorded diesel loops pitched for the Cummins QSL six, plus the synthesized firing
  const x = Math.max(0, Math.min(1, (rpm - 1000) / 700));
  k(N.idle.s.playbackRate, Math.max(0.5, (rpm / 810) * 0.85), 0.03);
  k(N.mid.s.playbackRate, Math.max(0.5, (rpm / 1290) * 0.85), 0.03);
  k(N.idle.g.gain, on * (1 - x) * 0.55);
  k(N.mid.g.gain, on * x * (0.5 + 0.3 * cr.load));
  k(N.tone.frequency, inCab ? 800 + cr.load * 500 : 1500 + cr.load * 3000, 0.15);
  k(N.engineBus.gain, near * cab, 0.2);
  if (N.synth) {
    const p = N.synth.parameters;
    k(p.get('rpm')!, running ? rpm : 0, 0.02);
    k(p.get('load')!, cr.load, 0.15);
    p.get('firing')!.setValueAtTime(on, t);
    p.get('starter')!.setValueAtTime(cr.engine === 'starting' ? 1 : 0, t);
    k(p.get('cold')!, 0, 1);
  }
  k(N.synthG.gain, (on * (0.35 + 0.6 * Math.min(1, cr.load)) + (cr.engine === 'starting' ? 0.5 : 0)) * 0.9, 0.12);
  k(N.turbo.o.frequency, 2600 + 5000 * Math.min(1, rpm / 2100) * (0.4 + 0.6 * cr.load), 0.35);
  k(N.turbo.g.gain, on * near * (0.002 + 0.012 * cr.load) * cab, 0.3);

  // hydraulics: any lever; the relief valve squeals when a function stalls
  const work = cr.locked ? 0 : Math.max(Math.abs(cr.lx), Math.abs(cr.ly), Math.abs(cr.rx), Math.abs(cr.ry), Math.abs(cr.trackL) * 0.7, Math.abs(cr.trackR) * 0.7);
  k(N.hyd.s.playbackRate, Math.max(0.6, rpm / 1600), 0.1);
  k(N.hyd.g.gain, on * near * Math.min(1, work) * 0.55, 0.1);
  const drum = 0;
  k(N.winch.o.frequency, 90 + drum * 260 * (rpm / 2100), 0.08);
  k(N.winch.g.gain, on * near * Math.min(1, drum) * 0.05 * cab, 0.08);
  k(N.relief.g.gain, on && cr.relief && work > 0.1 ? near * 0.15 : 0, 0.05);

  // travel alarm (standard on the PC800), proximity warnings: power line, buried service, tipping
  const travelling = Math.abs(cr.belt[0]) + Math.abs(cr.belt[1]) > 0.05;
  k(N.beep.g.gain, travelling && Math.sin(t * Math.PI * 2 * 1.2) > 0.3 ? 0.04 * near : 0, 0.005);
  const warn = cr.lineDist < 3 ? Math.sin(t * Math.PI * 2 * 5) > 0 : cr.spotter === 'stop' ? Math.sin(t * Math.PI * 2 * 3) > 0 : cr.tilt > 0.2 ? Math.sin(t * Math.PI * 2 * 2) > 0.3 : false;
  k(N.alarm.g.gain, warn && !cr.failed ? 0.035 : 0, 0.005);
  k(N.buzz.g.gain, 0, 0.01);

  // tyres, horn, wind
  const sp = (Math.abs(cr.belt[0]) + Math.abs(cr.belt[1])) * 3;
  k(N.tyre.f.frequency, 260 + sp * 40, 0.2);
  k(N.tyre.g.gain, Math.min(0.2, sp * 0.03) * near * cab, 0.1);
  k(N.hornG.gain, horn ? 0.13 * Math.max(0.4, near) : 0, 0.02);
  k(N.wind.g.gain, 0.02 * cab, 0.5);

  // the building site around: hammering on steel, a truck reversing somewhere
  if (t > nextHammer) {
    nextHammer = t + 2 + Math.random() * 7;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) setTimeout(() => clunk(1800 + Math.random() * 600, 0.05, 0.06), i * 380);
  }
  if (t > nextBeep) {
    nextBeep = t + 25 + Math.random() * 40;
    for (let i = 0; i < 6; i++) setTimeout(() => beepOnce(1050, 0.25), i * 900);
  }
}
