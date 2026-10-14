// #/runs: personal bests and recent runs. Every row is a link you can open, share or race.

import { h, icon, shareLink } from '../util/dom';
import { fmtDate, fmtInt, fmtTime } from '../util/format';
import { ZONES, type ZoneId } from '../config';
import { history, pbs, runUrl, type RunEntry } from '../game/runs';
import { MAX_ROUND } from '../game/scoring';
import { navigate } from '../router';
import { page, topbar } from './chrome';

function catLabel(key: string): string | null {
  const m = /^drop-(\w+)-(\d)r$/.exec(key);
  if (!m) return null;
  const zone = m[1] as ZoneId;
  if (!(zone in ZONES)) return null;
  return `${zone === 'world' ? 'World Drop' : `Local · ${ZONES[zone].name}`} · ${m[2]} round${m[2] === '1' ? '' : 's'}`;
}

export function runsScreen(root: HTMLElement) {
  const pbRows = Object.entries(pbs)
    .map(([key, pb]) => ({ key, pb, label: catLabel(key), rounds: Number(/-(\d)r/.exec(key)?.[1] ?? 1) }))
    .filter((r) => r.label && r.pb.score >= 0)
    .sort((a, b) => a.key.localeCompare(b.key));

  const pbTable = pbRows.length
    ? h(
        'table',
        { class: 'rounds pbs' },
        h('thead', null, h('tr', null, h('th', null, 'Category'), h('th', null, 'Best score'), h('th', null, 'Best time (all on target)'))),
        h(
          'tbody',
          null,
          pbRows.map(({ label, pb, rounds }) =>
            h(
              'tr',
              null,
              h('td', null, label),
              h('td', null, h('a', { href: `#/r/${pb.scoreCode}` }, fmtInt(pb.score)), h('span', { class: 'muted' }, ` / ${fmtInt(MAX_ROUND * rounds)}`)),
              h('td', null, pb.time != null && pb.timeCode ? h('a', { href: `#/r/${pb.timeCode}` }, fmtTime(pb.time)) : h('span', { class: 'muted' }, '—')),
            ),
          ),
        ),
      )
    : h('p', { class: 'muted' }, 'No personal bests yet. Go play a drop!');

  const list = history.length
    ? h('div', { class: 'run-list' }, history.map(row))
    : h('p', { class: 'muted' }, 'Your runs will show up here. Each one gets a link you can rewatch or send to a friend.');

  root.append(
    topbar(),
    page(
      'Your runs',
      h('section', { class: 'card' }, h('h2', null, icon('trophy', 18), ' Personal bests'), pbTable),
      h('section', { class: 'card', style: 'margin-top:16px' }, h('h2', null, icon('list', 18), ' Recent runs'), list),
      h('p', { class: 'muted small' }, 'Runs are saved in this browser only. Copy a link to keep a run forever or share it.'),
    ),
  );
}

function row(e: RunEntry): HTMLElement {
  const badge =
    e.kind === 'duel'
      ? h('span', { class: `tag ${e.result === 'win' ? 'good' : ''}` }, icon('swords', 12), ` 1v1 vs ${e.opp ?? '?'} · ${e.result ?? ''}`)
      : e.kind === 'ghost'
        ? h('span', { class: `tag ${e.result === 'win' ? 'good' : ''}` }, icon('ghost', 12), ` vs ${e.opp ?? '?'} · ${e.result ?? ''}`)
        : null;
  return h(
    'div',
    { class: 'run-row' },
    h('div', { class: 'rr-main' }, h('b', null, `${fmtInt(e.total)} pts`), h('span', { class: 'muted' }, ` · ${fmtTime(e.time)}`), e.valid ? h('span', { class: 'tag good' }, 'on target') : null, badge, h('div', { class: 'muted small' }, `${e.catName} · ${fmtDate(e.date)}`)),
    h(
      'div',
      { class: 'rr-actions' },
      h('button', { class: 'btn small', onclick: () => navigate(`/r/${e.code}?v=watch`), title: 'Watch replay' }, icon('play', 12), h('span', null, 'Watch')),
      h('button', { class: 'btn small', onclick: () => navigate(`/r/${e.code}`), title: 'Open run' }, icon('eye', 14), h('span', null, 'Open')),
      h('button', { class: 'btn small', onclick: () => shareLink(runUrl(e.code, 'race'), 'Beat my Anteater Guesser run'), title: 'Copy challenge link' }, icon('link', 14), h('span', null, 'Link')),
    ),
  );
}
