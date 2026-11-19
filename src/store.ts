import { create as createStore } from 'zustand';
import * as sim from './sim/excavator';
import { create as createExc, step, type Exc } from './sim/excavator';

// Simulation state, mutated in place every frame; `tick` bumps so React panels refresh at a modest rate.
export const ex: Exc = createExc();
if (import.meta.env.DEV) Object.assign(globalThis, { ex, sim });

export type CamMode = 'orbit' | 'cab' | 'bucket' | 'top' | 'spotter';

interface UI {
  tick: number;
  cam: CamMode;
  help: boolean;
  started: boolean;
  panel: boolean;
  toast: string;
  toastUntil: number;
  guidance: boolean;
  xray: boolean;
  bump: () => void;
  set: (p: Partial<Omit<UI, 'bump' | 'set'>>) => void;
}

const narrow = typeof innerWidth === 'number' && innerWidth < 760;

export const useUI = createStore<UI>((set) => ({
  tick: 0,
  cam: 'orbit',
  help: false,
  started: false,
  panel: !narrow,
  toast: '',
  toastUntil: 0,
  guidance: true,
  xray: false,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  set: (p) => set(p),
}));

export function toast(msg: string, ms = 5000) {
  useUI.getState().set({ toast: msg, toastUntil: performance.now() + ms });
}

const listeners = new Set<(e: string) => void>();
export function onEvent(f: (e: string) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Advances the simulation with fixed 10 ms steps. */
export function advance(dt: number) {
  const total = Math.min(dt, 0.1);
  if (!(total > 0)) return;
  const n = Math.max(1, Math.ceil(total / 0.01));
  for (let i = 0; i < n; i++) step(ex, total / n);
  if (ex.events.length) for (const e of ex.events.splice(0)) for (const f of listeners) f(e);
  if (ex.msg) {
    toast(ex.msg);
    ex.msg = '';
  }
}

/** Start over: a fresh machine and ground (the page keeps the same objects). */
export function resetAll() {
  location.reload();
}
