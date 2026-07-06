// The catch blip — a soft two-tone radio click when a strip lands, synthesized
// with WebAudio so there's no asset to load. Rare catches get a brighter
// second note. Browsers gate audio behind a user gesture; if the context
// can't start yet we fail silently and the next catch (after any tap) plays.

const SOUND_KEY = 'overhead_sound';

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    // storage unavailable — the toggle just won't persist
  }
}

let ctx: AudioContext | null = null;

function blip(at: number, freq: number, dur: number, peak: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playCatchSound(rare: boolean): void {
  if (!isSoundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') return; // no gesture yet — skip quietly
    }
    const t = ctx.currentTime + 0.01;
    blip(t, 660, 0.09, 0.10);
    if (rare) {
      blip(t + 0.11, 990, 0.12, 0.12);
      blip(t + 0.26, 1320, 0.16, 0.10);
    }
  } catch {
    // Audio unavailable (old browser, restricted context) — never break a catch
  }
}
