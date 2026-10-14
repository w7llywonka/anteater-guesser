// Peer-to-peer duel transport. PeerJS's free public broker only introduces the two
// browsers; after that, every message travels directly between them over WebRTC (or via
// PeerJS's TURN relay on strict networks). No game server, so it runs on any static host.

import type { DataConnection, Peer as PeerT } from 'peerjs';
import type { ZoneId } from '../config';
import type { Avatar } from '../profile/items';

export const PROTOCOL = 1;
const PREFIX = 'anteater-guesser-v1-';

export interface NetPlayer { name: string; level: number; av: Avatar }

export type Msg =
  | { t: 'hello'; v: number; p: NetPlayer }
  | { t: 'cfg'; rounds: number; zone: ZoneId }
  | { t: 'start'; seed: number; rounds: number; zone: ZoneId }
  | { t: 'go'; round: number }
  | { t: 'cam'; x: number; y: number; z: number; w: number; h: number }
  | { t: 'pin'; round: number; time: number; x: number | null; y: number | null }
  | { t: 'next'; round: number }
  | { t: 'emote'; e: string }
  | { t: 'rematch' }
  | { t: 'lobby' }
  | { t: 'bye' };

export type NetEvent = { kind: 'msg'; msg: Msg } | { kind: 'open' } | { kind: 'close'; reason: string };

export class DuelNet {
  private conn: DataConnection | null = null;
  private listeners = new Set<(e: NetEvent) => void>();
  private closed = false;

  private constructor(
    private peer: PeerT,
    readonly isHost: boolean,
    readonly code: string,
  ) {}

  /** Create a room. Resolves once the broker has registered the room code. */
  static async host(code: string): Promise<DuelNet> {
    const { Peer } = await import('peerjs');
    const peer = new Peer(PREFIX + code, { debug: 0 });
    const net = new DuelNet(peer, true, code);
    await new Promise<void>((resolve, reject) => {
      peer.once('open', () => resolve());
      peer.once('error', (e) => reject(friendly(e)));
    });
    peer.on('connection', (c) => {
      // One opponent per room: politely refuse anyone else.
      if (net.conn && net.conn.open) {
        c.on('open', () => {
          c.send({ t: 'bye' });
          setTimeout(() => c.close(), 200);
        });
        return;
      }
      net.attach(c);
    });
    // Losing the broker does not affect an open peer-to-peer channel; only report errors
    // while nobody is connected, and quietly re-register with the broker.
    peer.on('error', (e) => {
      if (!net.connected) net.emit({ kind: 'close', reason: friendly(e).message });
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    return net;
  }

  /** Join a room by code. Resolves once the data channel to the host is open. */
  static async join(code: string): Promise<DuelNet> {
    const { Peer } = await import('peerjs');
    const peer = new Peer({ debug: 0 });
    const net = new DuelNet(peer, false, code);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not reach that room. Check the code, or ask your friend to create a new one.')), 15000);
      peer.once('error', (e) => {
        clearTimeout(timer);
        reject(friendly(e));
      });
      peer.once('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.once('open', () => {
          clearTimeout(timer);
          resolve();
        });
        net.attach(c);
      });
    });
    return net;
  }

  private attach(c: DataConnection) {
    this.conn = c;
    c.on('open', () => this.emit({ kind: 'open' }));
    if (c.open) queueMicrotask(() => this.emit({ kind: 'open' }));
    c.on('data', (d) => {
      const msg = d as Msg;
      if (msg && typeof msg === 'object' && typeof msg.t === 'string') this.emit({ kind: 'msg', msg });
    });
    c.on('close', () => {
      if (this.conn === c) this.conn = null;
      if (!this.closed) this.emit({ kind: 'close', reason: 'Your opponent disconnected.' });
    });
    c.on('error', () => {
      if (!this.closed) this.emit({ kind: 'close', reason: 'Connection lost.' });
    });
  }

  get connected() {
    return !!this.conn?.open;
  }

  send(msg: Msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  on(f: (e: NetEvent) => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private emit(e: NetEvent) {
    this.listeners.forEach((f) => f(e));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.send({ t: 'bye' });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      this.conn?.close();
      this.peer.destroy();
    }, 100);
  }
}

function friendly(e: unknown): Error {
  const type = (e as { type?: string })?.type;
  switch (type) {
    case 'peer-unavailable':
      return new Error('That room does not exist (or the host closed it).');
    case 'unavailable-id':
      return new Error('That room code is taken. Try again.');
    case 'browser-incompatible':
      return new Error('This browser does not support peer-to-peer connections.');
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return new Error('Could not reach the matchmaking server. Check your connection.');
    default:
      return new Error((e as Error)?.message || 'Connection failed.');
  }
}
