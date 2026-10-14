// Run records: binary codec for share links, plus local history and personal bests.

import type { ModeId, ZoneId } from '../config';
import { Reader, Writer, fnv1a, pack, unpack } from '../util/codec';
import { load, save } from '../util/storage';
import type { Pt } from '../util/geo';
import { avatarFromIdx, avatarToIdx, SLOTS, type Avatar } from '../profile/items';
import { categoryKey, categoryName, type GameConfig } from './modes';
import { scoreRound, type RoundScore } from './scoring';

export interface Sample { t: number; x: number; y: number; z: number }
export interface PinEvent { t: number; x: number; y: number }

export interface RoundRecord {
  /** ms from GO to lock-in (or the time limit). */
  time: number;
  pin: Pt | null;
  pins: PinEvent[];
  track: Sample[];
}

export interface PlayerTag { name: string; level: number; av: Avatar }

export interface RunData {
  cfg: GameConfig;
  date: number;
  player: PlayerTag;
  vw: number;
  vh: number;
  rounds: RoundRecord[];
  /** The ghost this run was raced against, if any. */
  vs?: { name: string; total: number; time: number };
  /** False when the checksum failed (edited link). Not security, just a tamper hint. */
  verified?: boolean;
}

export interface RunSummary {
  scores: RoundScore[];
  total: number;
  time: number;
  /** Every round within ON_TARGET_M: eligible for time PBs. */
  valid: boolean;
}

export function summarize(run: Pick<RunData, 'rounds'>): RunSummary {
  const scores = run.rounds.map((r) => scoreRound(r.pin, r.time));
  return {
    scores,
    total: scores.reduce((a, s) => a + s.total, 0),
    time: scores.reduce((a, s) => a + s.time, 0),
    valid: scores.length > 0 && scores.every((s) => s.onTarget),
  };
}

// ---------------------------------------------------------------- codec

const VERSION = 1;
const Q = 2 ** 30;
const MODES: ModeId[] = ['drop', 'daily'];
const ZONES: ZoneId[] = ['world', 'socal', 'city', 'campus'];

export function encodeRun(run: RunData): Uint8Array {
  const w = new Writer();
  w.u8(VERSION);
  w.u8(run.vs ? 2 : 0);
  w.u8(MODES.indexOf(run.cfg.mode));
  w.u8(ZONES.indexOf(run.cfg.zone));
  w.u8(run.rounds.length);
  w.uv(run.cfg.seed >>> 0);
  w.uv(Math.floor(run.date / 60000));
  w.uv(run.vw);
  w.uv(run.vh);
  w.str(run.player.name);
  w.uv(run.player.level);
  for (const i of avatarToIdx(run.player.av)) w.u8(i);
  if (run.vs) {
    w.str(run.vs.name);
    w.uv(run.vs.total);
    w.uv(run.vs.time);
  }
  for (const r of run.rounds) {
    w.uv(r.time);
    w.u8(r.pin ? 1 : 0);
    if (r.pin) {
      w.sv(r.pin.x * Q);
      w.sv(r.pin.y * Q);
    }
    w.uv(r.pins.length);
    let pt = 0;
    for (const p of r.pins) {
      w.uv(p.t - pt);
      pt = p.t;
      w.sv(p.x * Q);
      w.sv(p.y * Q);
    }
    encodeTrack(w, r.track);
  }
  const body = w.bytes();
  const sum = fnv1a(body);
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  new DataView(out.buffer).setUint32(body.length, sum);
  return out;
}

/**
 * Camera track: delta-coded varints. Positions are quantised to a quarter screen pixel
 * at the sample's own zoom, so a 20 s round costs well under a kilobyte.
 */
function encodeTrack(w: Writer, track: Sample[]) {
  w.uv(track.length);
  let pt = 0;
  let pz = 0;
  let px = 0;
  let py = 0;
  for (const s of track) {
    w.uv(Math.max(0, Math.round(s.t - pt)));
    pt += Math.max(0, Math.round(s.t - pt));
    const zq = Math.round(s.z * 256);
    w.sv(zq - pz);
    pz = zq;
    const unit = 2 ** Math.max(0, 20 - Math.round(zq / 256));
    const dx = Math.round((s.x * Q - px) / unit);
    const dy = Math.round((s.y * Q - py) / unit);
    w.sv(dx);
    w.sv(dy);
    px += dx * unit;
    py += dy * unit;
  }
}

function decodeTrack(r: Reader): Sample[] {
  const n = r.uv();
  if (n > 100_000) throw new Error('bad track');
  const out: Sample[] = [];
  let t = 0;
  let zq = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    t += r.uv();
    zq += r.sv();
    const unit = 2 ** Math.max(0, 20 - Math.round(zq / 256));
    px += r.sv() * unit;
    py += r.sv() * unit;
    out.push({ t, x: px / Q, y: py / Q, z: zq / 256 });
  }
  return out;
}

export function decodeRun(bytes: Uint8Array): RunData {
  if (bytes.length < 8) throw new Error('Run link is too short');
  const body = bytes.subarray(0, bytes.length - 4);
  const sum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4);
  const r = new Reader(body);
  const v = r.u8();
  if (v !== VERSION) throw new Error('This run link is from a newer version of the game');
  const flags = r.u8();
  const mode = MODES[r.u8()];
  const zone = ZONES[r.u8()];
  const n = r.u8();
  if (!mode || !zone || n < 1 || n > 10) throw new Error('Corrupt run link');
  const seed = r.uv() >>> 0;
  const date = r.uv() * 60000;
  const vw = r.uv();
  const vh = r.uv();
  const name = r.str().slice(0, 16);
  const level = r.uv();
  const av = avatarFromIdx(SLOTS.map(() => r.u8()));
  const vs = flags & 2 ? { name: r.str().slice(0, 16), total: r.uv(), time: r.uv() } : undefined;
  const rounds: RoundRecord[] = [];
  for (let i = 0; i < n; i++) {
    const time = r.uv();
    const pin = r.u8() ? { x: r.sv() / Q, y: r.sv() / Q } : null;
    const pc = r.uv();
    if (pc > 1000) throw new Error('Corrupt run link');
    const pins: PinEvent[] = [];
    let pt = 0;
    for (let j = 0; j < pc; j++) {
      pt += r.uv();
      pins.push({ t: pt, x: r.sv() / Q, y: r.sv() / Q });
    }
    rounds.push({ time, pin, pins, track: decodeTrack(r) });
  }
  return {
    cfg: { mode, zone, rounds: n, seed },
    date,
    player: { name, level, av },
    vw,
    vh,
    rounds,
    vs,
    verified: fnv1a(body) === sum,
  };
}

export async function runToCode(run: RunData): Promise<string> {
  return pack(encodeRun(run));
}

export async function runFromCode(code: string): Promise<RunData> {
  return decodeRun(await unpack(code));
}

export function runUrl(code: string, view: 'watch' | 'race' | '' = ''): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/r/${code}${view ? `?v=${view}` : ''}`;
}

// ---------------------------------------------------------------- history & PBs

export interface RunEntry {
  id: string;
  date: number;
  cat: string;
  catName: string;
  total: number;
  time: number;
  valid: boolean;
  kind: 'solo' | 'ghost' | 'duel';
  code: string;
  opp?: string;
  result?: 'win' | 'loss' | 'draw';
}

export interface PB {
  score: number;
  scoreCode: string;
  scoreDate: number;
  time?: number;
  timeCode?: string;
  timeDate?: number;
}

const MAX_HISTORY = 60;

export const history: RunEntry[] = load<RunEntry[]>('runs', []);
export const pbs: Record<string, PB> = load<Record<string, PB>>('pbs', {});

export interface PBResult { scorePB: boolean; timePB: boolean; prevScore?: number; prevTime?: number }

export function recordRun(run: RunData, code: string, kind: RunEntry['kind'], extra: Partial<RunEntry> = {}): PBResult {
  const sum = summarize(run);
  const cat = categoryKey(run.cfg);
  history.unshift({
    id: `${run.date.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: run.date,
    cat,
    catName: categoryName(run.cfg),
    total: sum.total,
    time: sum.time,
    valid: sum.valid,
    kind,
    code,
    ...extra,
  });
  history.length = Math.min(history.length, MAX_HISTORY);
  // Drop the oldest entries if we run into the storage quota.
  while (!save('runs', history) && history.length > 5) history.splice(-5);

  const res: PBResult = { scorePB: false, timePB: false };
  // Daily runs share a key across days; only the current day's seed should compete.
  const key = run.cfg.mode === 'daily' ? `${cat}-${run.cfg.seed}` : cat;
  const p = pbs[key] ?? (pbs[key] = { score: -1, scoreCode: '', scoreDate: 0 });
  res.prevScore = p.score >= 0 ? p.score : undefined;
  res.prevTime = p.time;
  if (sum.total > p.score) {
    p.score = sum.total;
    p.scoreCode = code;
    p.scoreDate = run.date;
    res.scorePB = sum.total > 0;
  }
  if (sum.valid && (p.time == null || sum.time < p.time)) {
    p.time = sum.time;
    p.timeCode = code;
    p.timeDate = run.date;
    res.timePB = true;
  }
  save('pbs', pbs);
  return res;
}

export function pbFor(cfg: GameConfig): PB | undefined {
  const cat = categoryKey(cfg);
  return pbs[cfg.mode === 'daily' ? `${cat}-${cfg.seed}` : cat];
}
