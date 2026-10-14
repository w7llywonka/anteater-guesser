import { MODES, ZONES, type ZoneId } from '../config';
import { h, icon } from '../util/dom';
import { fmtInt, fmtTime } from '../util/format';
import { load, save } from '../util/storage';
import { randomSeed } from '../util/rng';
import { navigate } from '../router';
import { dailyConfig, dailyNumber, ROUND_OPTIONS, type GameConfig } from '../game/modes';
import { pbFor } from '../game/runs';
import { MAX_ROUND } from '../game/scoring';
import { targetThumb } from '../game/mapHost';
import { profile, saveProfile, levelProgress, sanitizeName } from '../profile/profile';
import { avatarSVG } from '../profile/avatar';
import { item } from '../profile/items';
import { cfgToQuery } from './play';
import { topbar } from './chrome';

interface HomePrefs { rounds: number; zone: Exclude<ZoneId, 'world'> }

export function homeScreen(root: HTMLElement) {
  const prefs = load<HomePrefs>('home', { rounds: 1, zone: 'city' });
  if ((prefs.zone as ZoneId) === 'world') prefs.zone = 'city';
  const persist = () => save('home', prefs);

  const cfgFor = (zone: ZoneId): GameConfig => ({ mode: 'drop', zone, rounds: prefs.rounds, seed: randomSeed() });
  const go = (cfg: GameConfig) => navigate(`/play?${cfgToQuery(cfg)}`);

  // --- profile card
  const lp = levelProgress();
  const nameInput = h('input', { class: 'name-input', value: profile.name, maxlength: 16, 'aria-label': 'Display name', spellcheck: 'false' });
  nameInput.addEventListener('change', () => {
    profile.name = sanitizeName(nameInput.value);
    nameInput.value = profile.name;
    saveProfile();
  });
  const profileCard = h(
    'section',
    { class: 'card profile-card' },
    h('a', { class: 'av-link', href: '#/locker', title: 'Customise in the Locker', html: avatarSVG(profile.av, 92) }),
    h(
      'div',
      { class: 'pc-body' },
      nameInput,
      h('div', { class: 'pc-title' }, item('title', profile.av.title).c![0]),
      h('div', { class: 'xp' }, h('div', { class: 'xp-top' }, h('span', null, `Level ${lp.lvl}`), h('span', null, `${fmtInt(lp.into)} / ${fmtInt(lp.need)} XP`)), h('div', { class: 'bar' }, h('i', { style: `width:${(lp.frac * 100).toFixed(1)}%` }))),
      h('div', { class: 'pc-stats' }, h('span', null, h('b', null, fmtInt(profile.games)), ' games'), h('span', null, h('b', null, fmtInt(profile.roofs)), ' roof hits'), h('span', null, h('b', null, fmtInt(profile.wins)), ' duel wins')),
    ),
    h('a', { class: 'btn small', href: '#/locker' }, icon('user', 15), 'Locker'),
  );

  // --- options
  const roundsSeg = segmented(
    ROUND_OPTIONS.map((n) => ({ v: String(n), label: `${n} round${n > 1 ? 's' : ''}` })),
    String(prefs.rounds),
    (v) => {
      prefs.rounds = Number(v);
      persist();
      refreshPBs();
    },
  );

  // --- mode cards
  const worldPB = h('div', { class: 'pb-line' });
  const dropPB = h('div', { class: 'pb-line' });
  const dailyPB = h('div', { class: 'pb-line' });
  const refreshPBs = () => {
    worldPB.replaceChildren(pbLine(pbFor(cfgFor('world')), prefs.rounds));
    dropPB.replaceChildren(pbLine(pbFor(cfgFor(prefs.zone)), prefs.rounds));
    const d = dailyConfig();
    dailyPB.replaceChildren(pbLine(pbFor(d), d.rounds, 'Today'));
  };

  const localZones: Array<Exclude<ZoneId, 'world'>> = ['socal', 'city', 'campus'];
  const zoneBlurb = h('p', null, ZONES[prefs.zone].blurb + '. Still a random spot every run.');
  const zoneSeg = segmented(
    localZones.map((z) => ({ v: z, label: ZONES[z].name, title: ZONES[z].blurb })),
    prefs.zone,
    (v) => {
      prefs.zone = v as Exclude<ZoneId, 'world'>;
      zoneBlurb.textContent = ZONES[prefs.zone].blurb + '. Still a random spot every run.';
      persist();
      refreshPBs();
    },
  );

  const worldCard = h(
    'article',
    { class: 'mode-card world' },
    h('div', { class: 'mc-icon' }, icon('globe', 26)),
    h('h3', null, MODES.drop.name),
    h('p', null, MODES.drop.blurb),
    worldPB,
    h('button', { class: 'btn primary wide', onclick: () => go(cfgFor('world')) }, icon('play', 14), 'Drop me anywhere'),
  );
  const dropCard = h(
    'article',
    { class: 'mode-card drop' },
    h('div', { class: 'mc-icon' }, icon('target', 26)),
    h('h3', null, 'Local Drops'),
    zoneBlurb,
    zoneSeg,
    dropPB,
    h('button', { class: 'btn primary wide', onclick: () => go(cfgFor(prefs.zone)) }, icon('play', 14), 'Drop in nearby'),
  );
  const daily = dailyConfig();
  const dailyCard = h(
    'article',
    { class: 'mode-card daily' },
    h('div', { class: 'mc-icon' }, icon('calendar', 26)),
    h('h3', null, `Daily Drop #${dailyNumber()}`),
    h('p', null, MODES.daily.blurb),
    dailyPB,
    h('button', { class: 'btn primary wide', onclick: () => go(daily) }, icon('play', 14), "Play today's drop"),
  );

  const duelCard = h(
    'article',
    { class: 'mode-card duel' },
    h('div', { class: 'mc-icon' }, icon('swords', 26)),
    h('h3', null, 'Live 1v1'),
    h('p', null, 'Race a friend in real time on the same drops. Peer-to-peer: send a room link and go.'),
    h('a', { class: 'btn primary wide', href: '#/duel' }, icon('swords', 15), 'Open duel lobby'),
  );
  const ghostCard = h(
    'article',
    { class: 'mode-card ghost' },
    h('div', { class: 'mc-icon' }, icon('ghost', 26)),
    h('h3', null, 'Challenge links'),
    h('p', null, 'Finish any run and hit "Challenge a friend". They race your ghost on the exact same seed, then send their link back.'),
    h('a', { class: 'btn wide', href: '#/runs' }, icon('list', 15), 'Your runs'),
  );

  refreshPBs();

  root.append(
    topbar(),
    h(
      'main',
      { class: 'home' },
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          { class: 'hero-text' },
          h('span', { class: 'eyebrow' }, 'A satellite speedrun'),
          h('h1', null, 'Find ', h('em', null, '26 Murasaki St'), ' faster than anyone.'),
          h('p', null, 'You get dropped at a random point on Earth, on real satellite imagery. Somewhere out there is one house in Irvine, California. Zoom, pan, double-click it. Points for accuracy and for speed.'),
          h('div', { class: 'hero-cta' }, h('button', { class: 'btn primary lg', onclick: () => go(cfgFor('world')) }, icon('play', 16), 'Quick play'), h('a', { class: 'btn lg', href: '#/duel' }, icon('swords', 17), '1v1 a friend')),
        ),
        h('figure', { class: 'hero-target' }, targetThumb(220, 19), h('figcaption', null, icon('pin', 14), ' Your target, from 120 m up')),
      ),
      profileCard,
      h('section', { class: 'opts card' }, h('div', null, h('h2', null, 'Rounds per game'), h('p', { class: 'muted' }, 'Each round is a new random drop. Points add up across the game.')), roundsSeg),
      h('h2', { class: 'section-h' }, 'Singleplayer'),
      h('section', { class: 'modes' }, worldCard, dropCard, dailyCard),
      h('h2', { class: 'section-h' }, '1v1'),
      h('section', { class: 'modes two' }, duelCard, ghostCard),
      howTo(),
    ),
  );
}

function pbLine(pb: ReturnType<typeof pbFor>, rounds: number, label = 'PB'): HTMLElement {
  if (!pb || pb.score < 0) return h('span', { class: 'muted' }, 'No runs yet');
  return h('span', null, icon('trophy', 13), ` ${label} ${fmtInt(pb.score)}`, h('span', { class: 'muted' }, ` / ${fmtInt(MAX_ROUND * rounds)}`), pb.time != null ? h('span', { class: 'muted' }, ` · ${fmtTime(pb.time)}`) : null);
}

export function segmented(options: Array<{ v: string; label: string; title?: string }>, value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', { class: o.v === value ? 'on' : '', role: 'radio', 'aria-checked': String(o.v === value), title: o.title ?? null }, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      onChange(o.v);
    });
    wrap.append(b);
  }
  return wrap;
}

export function toggle(label: string, desc: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'toggle' }, input, h('span', { class: 'sw' }), h('span', null, h('b', null, label), h('small', null, desc)));
}

function howTo(): HTMLElement {
  return h(
    'section',
    { class: 'how card' },
    h(
      'div',
      null,
      h('h2', null, 'Scoring'),
      h(
        'ul',
        null,
        h('li', null, h('b', null, 'Accuracy, up to 5,000.'), ' Full marks for a pin on the roof, about 4,600 at 10 m, 2,400 at 100 m, with a long tail for being in the right city.'),
        h('li', null, h('b', null, 'Speed, up to 5,000.'), ' Full marks inside 3 seconds, then it decays. Speed points are multiplied by your accuracy, so a fast pin in the wrong place is worth nothing.'),
        h('li', null, h('b', null, 'Time PBs'), ' only count when every pin is within 15 m of the house.'),
      ),
    ),
    h(
      'div',
      null,
      h('h2', null, 'Controls'),
      h(
        'ul',
        { class: 'keys' },
        h('li', null, h('kbd', null, 'Drag'), ' / ', h('kbd', null, 'WASD'), ' / ', h('kbd', null, 'Arrows'), ' Pan'),
        h('li', null, h('kbd', null, 'Wheel'), ' / ', h('kbd', null, 'Pinch'), ' / ', h('kbd', null, 'Q'), ' ', h('kbd', null, 'E'), ' Zoom'),
        h('li', null, h('kbd', null, 'Click'), ' Place pin · ', h('kbd', null, 'Double-click'), ' Pin & lock in'),
        h('li', null, h('kbd', null, 'Space'), ' Lock in / next round'),
        h('li', null, h('kbd', null, 'R'), ' Restart with a new drop · ', h('kbd', null, 'Esc'), ' Quit'),
      ),
    ),
  );
}
