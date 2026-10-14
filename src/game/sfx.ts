// Synthesised sound effects: no audio files to download.

import { settings } from '../settings';

let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0) {
  if (!settings.sound) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  tick: () => tone(587, 0.09, 'square', 0.06),
  go: () => tone(1175, 0.22, 'square', 0.07),
  pin: () => tone(740, 0.05, 'triangle', 0.1),
  lock: () => {
    tone(880, 0.06, 'triangle', 0.1);
    tone(1320, 0.1, 'triangle', 0.08, 0.06);
  },
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, i * 0.07)),
  meh: () => [440, 392].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.1)),
  pb: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.05, i * 0.08)),
  hurry: () => tone(330, 0.12, 'sawtooth', 0.05),
};
