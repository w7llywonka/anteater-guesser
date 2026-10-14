// Cosmetic catalog. IMPORTANT: lists are append-only. Run links store each slot as an
// index into these arrays, so reordering would change how old links render.

export type Slot = 'fur' | 'hat' | 'eyes' | 'neck' | 'bg' | 'pin' | 'title';
export const SLOTS: Slot[] = ['fur', 'hat', 'eyes', 'neck', 'bg', 'pin', 'title'];
export const SLOT_NAMES: Record<Slot, string> = {
  fur: 'Fur',
  hat: 'Hat',
  eyes: 'Eyewear',
  neck: 'Neck',
  bg: 'Background',
  pin: 'Map pin',
  title: 'Title',
};

export type Unlock = { lvl: number } | { ach: AchId };

export interface Item {
  id: string;
  name: string;
  unlock: Unlock;
  /** Slot-specific payload: colours, title text, etc. */
  c?: string[];
}

export type AchId =
  | 'first'
  | 'roof'
  | 'sniper'
  | 'sub10'
  | 'blink'
  | 'flawless'
  | 'golden'
  | 'ghost'
  | 'duel'
  | 'daily'
  | 'local'
  | 'marathon';

export const ACHIEVEMENTS: Record<AchId, { name: string; desc: string }> = {
  first: { name: 'First Steps', desc: 'Finish your first game' },
  roof: { name: 'On the Roof', desc: 'Drop a pin inside the house outline' },
  sniper: { name: 'Sniper', desc: 'Land on the roof in every round of a 5-round game' },
  sub10: { name: 'Speed Demon', desc: 'World Drop round on target in under 10 seconds' },
  blink: { name: 'Blink', desc: 'Any round on target in under 5 seconds' },
  flawless: { name: 'Flawless', desc: 'Score 9,500+ in a single round' },
  golden: { name: 'Golden Anteater', desc: 'Score 45,000+ in a 5-round game' },
  ghost: { name: 'Ghostbuster', desc: 'Beat a ghost from a challenge link' },
  duel: { name: 'Duelist', desc: 'Win a live 1v1' },
  daily: { name: 'Daily Driver', desc: 'Finish a Daily Drop' },
  local: { name: 'Murasaki Local', desc: 'World Drop, 5 rounds, every pin on target' },
  marathon: { name: 'Marathoner', desc: 'Finish 50 games' },
};

// fur colours: [base, light, dark]
export const ITEMS: Record<Slot, Item[]> = {
  fur: [
    { id: 'classic', name: 'Classic', unlock: { lvl: 1 }, c: ['#8b6b4e', '#b9977a', '#4a3626'] },
    { id: 'gold', name: 'Zot Gold', unlock: { lvl: 5 }, c: ['#e0a526', '#f6cf6b', '#8a6110'] },
    { id: 'blue', name: 'Anteater Blue', unlock: { lvl: 1 }, c: ['#2f6db5', '#6a9edd', '#173b66'] },
    { id: 'mint', name: 'Mint', unlock: { lvl: 8 }, c: ['#4fb592', '#8fd9c0', '#24614c'] },
    { id: 'pink', name: 'Bubblegum', unlock: { lvl: 12 }, c: ['#e58fb0', '#f6c2d6', '#9c4e6d'] },
    { id: 'midnight', name: 'Midnight', unlock: { lvl: 17 }, c: ['#2c3550', '#56638a', '#12172a'] },
    { id: 'lava', name: 'Lava', unlock: { lvl: 25 }, c: ['#d9481e', '#f2914a', '#6e1e08'] },
    { id: 'galaxy', name: 'Galaxy', unlock: { lvl: 30 }, c: ['#6b4fd8', '#a592f3', '#2e1f73'] },
    { id: 'ghost', name: 'Ghost', unlock: { ach: 'ghost' }, c: ['#dfe7f1', '#ffffff', '#8fa2b8'] },
    { id: 'golden', name: '24K', unlock: { ach: 'golden' }, c: ['#d4af37', '#ffe58a', '#7a5c00'] },
  ],
  hat: [
    { id: 'none', name: 'None', unlock: { lvl: 1 } },
    { id: 'cap', name: 'Ball cap', unlock: { lvl: 2 } },
    { id: 'beanie', name: 'Beanie', unlock: { lvl: 5 } },
    { id: 'party', name: 'Party hat', unlock: { lvl: 8 } },
    { id: 'grad', name: 'Grad cap', unlock: { lvl: 10 } },
    { id: 'cowboy', name: 'Cowboy', unlock: { lvl: 14 } },
    { id: 'propeller', name: 'Propeller', unlock: { lvl: 17 } },
    { id: 'wizard', name: 'Wizard', unlock: { lvl: 20 } },
    { id: 'chef', name: 'Chef', unlock: { lvl: 23 } },
    { id: 'crown', name: 'Crown', unlock: { ach: 'flawless' } },
    { id: 'halo', name: 'Halo', unlock: { ach: 'roof' } },
    { id: 'headphones', name: 'Headphones', unlock: { lvl: 12 } },
  ],
  eyes: [
    { id: 'none', name: 'None', unlock: { lvl: 1 } },
    { id: 'nerd', name: 'Round specs', unlock: { lvl: 3 } },
    { id: 'shades', name: 'Shades', unlock: { lvl: 6 } },
    { id: 'monocle', name: 'Monocle', unlock: { lvl: 9 } },
    { id: '3d', name: '3D glasses', unlock: { lvl: 15 } },
    { id: 'star', name: 'Star shades', unlock: { lvl: 25 } },
    { id: 'visor', name: 'Cyber visor', unlock: { lvl: 30 } },
  ],
  neck: [
    { id: 'none', name: 'None', unlock: { lvl: 1 } },
    { id: 'bowtie', name: 'Bow tie', unlock: { lvl: 4 } },
    { id: 'scarf', name: 'Zot scarf', unlock: { lvl: 7 } },
    { id: 'bandana', name: 'Bandana', unlock: { lvl: 12 } },
    { id: 'chain', name: 'Gold chain', unlock: { lvl: 20 } },
    { id: 'lei', name: 'Lei', unlock: { ach: 'marathon' } },
    { id: 'medal', name: 'Duel medal', unlock: { ach: 'duel' } },
  ],
  bg: [
    { id: 'blue', name: 'UCI Blue', unlock: { lvl: 1 }, c: ['#0b5ea8', '#063766'] },
    { id: 'gold', name: 'Gold', unlock: { lvl: 2 }, c: ['#ffd200', '#e08a00'] },
    { id: 'sunset', name: 'Sunset', unlock: { lvl: 6 }, c: ['#ff8a5c', '#c2386b'] },
    { id: 'grid', name: 'Map grid', unlock: { lvl: 10 }, c: ['#163a2e', '#0b1f19'] },
    { id: 'sat', name: 'Satellite', unlock: { lvl: 14 }, c: ['#6f7d4a', '#3a3f26'] },
    { id: 'night', name: 'Night sky', unlock: { lvl: 20 }, c: ['#1b2a5a', '#070b1c'] },
    { id: 'galaxy', name: 'Galaxy', unlock: { lvl: 25 }, c: ['#7b3fd1', '#1a0b3d'] },
    { id: 'bolt', name: 'Lightning', unlock: { ach: 'blink' }, c: ['#ffe14d', '#ff7a00'] },
    { id: 'mint', name: 'Mint', unlock: { lvl: 4 }, c: ['#7de0bf', '#2c8f73'] },
  ],
  pin: [
    { id: 'red', name: 'Classic red', unlock: { lvl: 1 }, c: ['#ef3e4a', '#ffffff'] },
    { id: 'gold', name: 'Gold', unlock: { lvl: 3 }, c: ['#ffd200', '#0b2e57'] },
    { id: 'blue', name: 'UCI Blue', unlock: { lvl: 7 }, c: ['#1f78d1', '#ffd200'] },
    { id: 'star', name: 'Star', unlock: { lvl: 10 }, c: ['#b14cff', '#ffffff'] },
    { id: 'mint', name: 'Mint', unlock: { lvl: 15 }, c: ['#22c39a', '#ffffff'] },
    { id: 'bolt', name: 'Bolt', unlock: { ach: 'sub10' }, c: ['#ff7a00', '#fff2a8'] },
    { id: 'target', name: 'Bullseye', unlock: { ach: 'sniper' }, c: ['#111827', '#ef3e4a'] },
  ],
  title: [
    { id: 'rookie', name: 'Rookie', unlock: { lvl: 1 }, c: ['Rookie'] },
    { id: 'path', name: 'Pathfinder', unlock: { lvl: 4 }, c: ['Pathfinder'] },
    { id: 'nav', name: 'Navigator', unlock: { lvl: 9 }, c: ['Navigator'] },
    { id: 'carto', name: 'Cartographer', unlock: { lvl: 15 }, c: ['Cartographer'] },
    { id: 'zot', name: 'Zot Zot Zot', unlock: { lvl: 20 }, c: ['Zot Zot Zot'] },
    { id: 'legend', name: 'Legend', unlock: { lvl: 30 }, c: ['Legend'] },
    { id: 'speed', name: 'Speed Demon', unlock: { ach: 'sub10' }, c: ['Speed Demon'] },
    { id: 'sniper', name: 'Sniper', unlock: { ach: 'sniper' }, c: ['Sniper'] },
    { id: 'duelist', name: 'Duelist', unlock: { ach: 'duel' }, c: ['Duelist'] },
    { id: 'daily', name: 'Daily Driver', unlock: { ach: 'daily' }, c: ['Daily Driver'] },
    { id: 'local', name: 'Murasaki Local', unlock: { ach: 'local' }, c: ['Murasaki Local'] },
    { id: 'marathon', name: 'Marathoner', unlock: { ach: 'marathon' }, c: ['Marathoner'] },
    { id: 'buster', name: 'Ghostbuster', unlock: { ach: 'ghost' }, c: ['Ghostbuster'] },
  ],
};

export type Avatar = Record<Slot, string>;

export const DEFAULT_AVATAR: Avatar = { fur: 'classic', hat: 'none', eyes: 'none', neck: 'none', bg: 'blue', pin: 'red', title: 'rookie' };

export function item(slot: Slot, id: string): Item {
  return ITEMS[slot].find((i) => i.id === id) ?? ITEMS[slot][0];
}

export function unlockText(u: Unlock): string {
  return 'lvl' in u ? `Reach level ${u.lvl}` : `Achievement: ${ACHIEVEMENTS[u.ach].name}`;
}

/** Avatar ↔ compact index list for run links. */
export function avatarToIdx(av: Avatar): number[] {
  return SLOTS.map((s) => Math.max(0, ITEMS[s].findIndex((i) => i.id === av[s])));
}

export function avatarFromIdx(idx: number[]): Avatar {
  const av = { ...DEFAULT_AVATAR };
  SLOTS.forEach((s, i) => {
    const it = ITEMS[s][idx[i] ?? 0];
    if (it) av[s] = it.id;
  });
  return av;
}
