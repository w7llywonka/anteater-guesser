// #/locker: customise the anteater. Items unlock with levels and achievements.

import { h, icon } from '../util/dom';
import { fmtInt } from '../util/format';
import { ACHIEVEMENTS, ITEMS, SLOTS, SLOT_NAMES, unlockText, type AchId, type Slot } from '../profile/items';
import { avatarSVG, pinSVG } from '../profile/avatar';
import { isUnlocked, levelProgress, profile, sanitizeName, saveProfile } from '../profile/profile';
import { page, topbar } from './chrome';

export function lockerScreen(root: HTMLElement) {
  let slot: Slot = 'hat';
  const preview = h('div', { class: 'locker-preview' });
  const titleEl = h('div', { class: 'pc-title' });
  const grid = h('div', { class: 'item-grid' });
  const tabs = h('div', { class: 'seg slot-tabs', role: 'tablist' });
  const lp = levelProgress();

  const nameInput = h('input', { class: 'name-input', value: profile.name, maxlength: 16, 'aria-label': 'Display name', spellcheck: 'false' });
  nameInput.addEventListener('change', () => {
    profile.name = sanitizeName(nameInput.value);
    nameInput.value = profile.name;
    saveProfile();
  });

  const renderPreview = () => {
    preview.innerHTML = avatarSVG(profile.av, 200);
    titleEl.textContent = ITEMS.title.find((t) => t.id === profile.av.title)?.c?.[0] ?? '';
  };

  const renderGrid = () => {
    grid.replaceChildren();
    for (const it of ITEMS[slot]) {
      const unlocked = isUnlocked(it);
      const on = profile.av[slot] === it.id;
      let art: HTMLElement;
      if (slot === 'title') art = h('div', { class: 'title-art' }, it.c![0]);
      else if (slot === 'pin') art = h('div', { class: 'pin-art', html: pinSVG(it.id, 40) });
      else art = h('div', { class: 'item-art', html: avatarSVG({ ...profile.av, [slot]: it.id }, 76) });
      const btn = h(
        'button',
        { class: `item ${on ? 'on' : ''} ${unlocked ? '' : 'locked'}`, title: unlocked ? it.name : unlockText(it.unlock), 'aria-pressed': String(on) },
        art,
        h('span', { class: 'item-name' }, it.name),
        unlocked ? null : h('span', { class: 'item-lock' }, icon('lock', 12), unlockText(it.unlock)),
      );
      btn.addEventListener('click', () => {
        if (!unlocked) return;
        profile.av[slot] = it.id;
        saveProfile();
        renderPreview();
        renderGrid();
      });
      grid.append(btn);
    }
  };

  for (const s of SLOTS) {
    const b = h('button', { class: s === slot ? 'on' : '', role: 'tab' }, SLOT_NAMES[s]);
    b.addEventListener('click', () => {
      slot = s;
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderGrid();
    });
    tabs.append(b);
  }

  const total = SLOTS.reduce((a, s) => a + ITEMS[s].length, 0);
  const owned = SLOTS.reduce((a, s) => a + ITEMS[s].filter((i) => isUnlocked(i)).length, 0);

  const achs = (Object.keys(ACHIEVEMENTS) as AchId[]).map((id) => {
    const got = profile.ach.includes(id);
    return h('div', { class: `ach ${got ? 'got' : ''}` }, h('span', { class: 'ach-ic' }, icon(got ? 'trophy' : 'lock', 16)), h('div', null, h('b', null, ACHIEVEMENTS[id].name), h('small', null, ACHIEVEMENTS[id].desc)));
  });

  renderPreview();
  renderGrid();

  root.append(
    topbar(),
    page(
      'Locker',
      h(
        'div',
        { class: 'locker' },
        h(
          'section',
          { class: 'card locker-side' },
          preview,
          nameInput,
          titleEl,
          h('div', { class: 'xp' }, h('div', { class: 'xp-top' }, h('span', null, `Level ${lp.lvl}`), h('span', null, `${fmtInt(lp.into)} / ${fmtInt(lp.need)} XP`)), h('div', { class: 'bar' }, h('i', { style: `width:${(lp.frac * 100).toFixed(1)}%` }))),
          h('p', { class: 'muted small' }, `${owned} of ${total} items unlocked. Earn XP from every game (score ÷ 10) and unlock the rest with achievements.`),
        ),
        h('section', { class: 'card locker-main' }, tabs, grid),
      ),
      h('section', { class: 'card', style: 'margin-top:16px' }, h('h2', null, icon('trophy', 18), ` Achievements (${profile.ach.length}/${Object.keys(ACHIEVEMENTS).length})`), h('div', { class: 'ach-grid' }, achs)),
    ),
  );
}
