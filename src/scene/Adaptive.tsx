// Graphics quality, fixed for the whole session (switching mid-session rebuilt every shader and froze an integrated
// GPU in the genset simulator). Light mode is the default: 1× resolution, no ambient occlusion, no bloom, a 1024
// shadow map; the models and textures are the same. "Mode penuh" (saved, applied by reloading the page) gives up to
// 2× resolution, ambient occlusion, bloom and a 2048 shadow map.
const KEY = 'exc-quality';
function read() {
  try {
    return localStorage.getItem(KEY) === 'full';
  } catch {
    return false;
  }
}
export const FULL = read() && new URLSearchParams(location.search).get('q') !== 'low';
export const MAX_DPR = FULL ? Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) : 1;
export const SHADOW = FULL ? 2048 : 1024;

export function setQuality(full: boolean) {
  try {
    localStorage.setItem(KEY, full ? 'full' : 'light');
  } catch {
    /* private mode */
  }
  location.reload();
}

// Night: dark sky, moonlight, the crane's flood lights shine on the hook. Saved, applied by reloading (like quality).
const NKEY = 'exc-night';
function readNight() {
  try {
    return localStorage.getItem(NKEY) === '1';
  } catch {
    return false;
  }
}
export const NIGHT = readNight();
export function setNight(on: boolean) {
  try {
    localStorage.setItem(NKEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
  location.reload();
}
