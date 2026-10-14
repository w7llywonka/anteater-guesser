// Small deterministic PRNG so the same seed yields the same drops on every device.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len: number): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = '';
  for (const v of a) s += CODE_CHARS[v % CODE_CHARS.length];
  return s;
}

export function seedLabel(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

export function parseSeedLabel(s: string): number | null {
  if (!/^[0-9a-z]{1,7}$/i.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isFinite(n) && n <= 0xffffffff ? n >>> 0 : null;
}
