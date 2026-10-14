import { h, icon } from '../util/dom';
import { profile, levelFromXp } from '../profile/profile';
import { avatarSVG } from '../profile/avatar';

export function logo(): HTMLElement {
  return h(
    'a',
    { class: 'logo', href: '#/', 'aria-label': 'Anteater Guesser home' },
    h('span', {
      class: 'logo-mark',
      html: '<svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#0b5ea8"/><ellipse cx="15" cy="21" rx="8" ry="7.5" fill="#ffd200"/><path d="M18 15.5 C25 16 32 19.5 35.5 22 C37 23.3 36.4 25.3 34.6 25.4 C29 26 23 26.6 18 26.8 Z" fill="#ffd200"/><circle cx="35.6" cy="23.6" r="1.6" fill="#0b2e57"/><circle cx="19" cy="19.5" r="1.7" fill="#0b2e57"/><ellipse cx="11" cy="13.5" rx="2.4" ry="3.2" transform="rotate(-22 11 13.5)" fill="#ffd200"/></svg>',
    }),
    h('span', { class: 'logo-text' }, 'Anteater', h('b', null, 'Guesser')),
  );
}

export function topbar(): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    logo(),
    h(
      'nav',
      null,
      h('a', { href: '#/runs', title: 'Your runs' }, icon('list', 18), h('span', null, 'Runs')),
      h('a', { href: '#/locker', title: 'Locker' }, icon('user', 18), h('span', null, 'Locker')),
      h('a', { href: '#/settings', title: 'Settings' }, icon('gear', 18), h('span', null, 'Settings')),
      h('a', { class: 'me', href: '#/locker', title: profile.name, html: avatarSVG(profile.av, 34) }, h('span', { class: 'lvl' }, String(levelFromXp(profile.xp)))),
    ),
  );
}

export function page(title: string, ...body: Array<Node | string | null>): HTMLElement {
  return h('main', { class: 'page' }, h('div', { class: 'page-head' }, h('a', { class: 'btn-icon', href: '#/', 'aria-label': 'Back' }, icon('back', 20)), h('h1', null, title)), ...body);
}
