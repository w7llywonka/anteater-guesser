// Compact binary encoding for runs so a whole replay fits in a shareable URL fragment.
// Fragments never reach a server: links are viewed entirely on the visitor's machine.

export class Writer {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  /** Unsigned LEB128 varint; safe up to 2^53. */
  uv(v: number) {
    v = Math.max(0, Math.floor(v));
    this.ensure(8);
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
  }

  /** Signed varint via zigzag. */
  sv(v: number) {
    v = Math.round(v);
    this.uv(v < 0 ? -v * 2 - 1 : v * 2);
  }

  str(s: string) {
    const b = new TextEncoder().encode(s);
    this.uv(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export class Reader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}

  get done() {
    return this.pos >= this.buf.length;
  }

  u8(): number {
    if (this.pos >= this.buf.length) throw new Error('truncated');
    return this.buf[this.pos++];
  }

  uv(): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
    throw new Error('varint too long');
  }

  sv(): number {
    const u = this.uv();
    return u % 2 ? -(u + 1) / 2 : u / 2;
  }

  str(): string {
    const n = this.uv();
    if (this.pos + n > this.buf.length) throw new Error('truncated');
    const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hasStreams = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Returns a prefixed base64url string: "z" = deflate-raw, "b" = uncompressed. */
export async function pack(bytes: Uint8Array): Promise<string> {
  if (hasStreams) {
    try {
      const z = await pipe(bytes, new CompressionStream('deflate-raw'));
      if (z.length < bytes.length) return 'z' + toBase64Url(z);
    } catch {
      /* fall through */
    }
  }
  return 'b' + toBase64Url(bytes);
}

export async function unpack(s: string): Promise<Uint8Array> {
  const kind = s[0];
  const bytes = fromBase64Url(s.slice(1));
  if (kind === 'b') return bytes;
  if (kind === 'z') {
    if (!hasStreams) throw new Error('This browser cannot open compressed run links. Please update it.');
    return pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  throw new Error('Unknown link format');
}

export function fnv1a(bytes: Uint8Array, salt = 0x9e3779b9): number {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
