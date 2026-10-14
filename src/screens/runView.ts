// #/r/<code>: a run decoded entirely from the link. Summary card, replay viewer, ghost race.

import { h, icon, shareLink } from '../util/dom';
import { fmtDate, fmtDist, fmtInt, fmtTime } from '../util/format';
import { seedLabel } from '../util/rng';
import { navigate } from '../router';
import { runFromCode, runUrl, summarize, type RunData } from '../game/runs';
import { categoryName } from '../game/modes';
import { MAX_ROUND, rankLabel } from '../game/scoring';
import { avatarSVG } from '../profile/avatar';
import { item } from '../profile/items';
import { page, topbar } from './chrome';
import { playScreen } from './play';
import { replayScreen } from './replay';

export async function runViewScreen(root: HTMLElement, code: string, q: URLSearchParams): Promise<void | (() => void)> {
  let run: RunData;
  try {
    run = await runFromCode(code);
  } catch (e) {
    root.append(
      topbar(),
      page('Run not found', h('section', { class: 'card' }, h('p', null, `This run link could not be opened: ${(e as Error).message}.`), h('p', { class: 'muted' }, 'Links can get cut off when pasted. Ask for the full link again.'), h('a', { class: 'btn primary', href: '#/' }, 'Go home'))),
    );
    return;
  }

  const v = q.get('v');
  if (v === 'watch') return replayScreen(root, run, code);
  if (v === 'go') return playScreen(root, { cfg: run.cfg, ghost: run });

  const sum = summarize(run);
  const max = MAX_ROUND * run.cfg.rounds;
  const rank = rankLabel(sum.total, max);
  const isChallenge = v === 'race';

  root.append(
    topbar(),
    h(
      'main',
      { class: 'page run-page' },
      isChallenge
        ? h('div', { class: 'challenge-banner' }, icon('swords', 20), h('div', null, h('b', null, `${run.player.name} challenged you!`), h('small', null, 'Race their ghost on the exact same drops. Beat their score, then send your link back.')))
        : null,
      h(
        'section',
        { class: 'card run-card' },
        h(
          'div',
          { class: 'run-head' },
          h('div', { class: 'av-wrap', html: avatarSVG(run.player.av, 84) }),
          h(
            'div',
            { class: 'grow' },
            h('h1', null, run.player.name),
            h('div', { class: 'pc-title' }, `${item('title', run.player.av.title).c![0]} · Level ${run.player.level}`),
            h('div', { class: 'muted small' }, `${categoryName(run.cfg)} · seed ${seedLabel(run.cfg.seed)} · ${fmtDate(run.date)}`),
          ),
          h('div', { class: `rank r-${rank.replace('+', 'p')}` }, rank),
        ),
        h(
          'div',
          { class: 'run-stats' },
          h('div', null, h('small', null, 'Score'), h('b', null, fmtInt(sum.total)), h('span', { class: 'muted' }, ` / ${fmtInt(max)}`)),
          h('div', null, h('small', null, 'Total time'), h('b', null, fmtTime(sum.time))),
          h('div', null, h('small', null, 'On target'), h('b', null, `${sum.scores.filter((s) => s.onTarget).length}/${sum.scores.length}`)),
        ),
        run.vs ? h('p', { class: 'vs-line' }, icon('ghost', 14), ` Raced ${run.vs.name}'s ghost (${fmtInt(run.vs.total)} pts, ${fmtTime(run.vs.time)}): `, h('b', null, sum.total > run.vs.total ? 'won' : sum.total === run.vs.total ? 'tied' : 'lost')) : null,
        run.verified === false ? h('p', { class: 'tag' }, 'This link was modified after the run was recorded') : null,
        h(
          'table',
          { class: 'rounds' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Distance'), h('th', null, 'Time'), h('th', null, 'Accuracy'), h('th', null, 'Speed'), h('th', null, 'Points'))),
          h(
            'tbody',
            null,
            sum.scores.map((s, i) =>
              h('tr', null, h('td', null, String(i + 1)), h('td', null, Number.isFinite(s.dist) ? fmtDist(s.dist) : 'no pin'), h('td', null, fmtTime(s.time)), h('td', null, fmtInt(s.acc)), h('td', null, fmtInt(s.speed)), h('td', null, fmtInt(s.total))),
            ),
          ),
        ),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: `btn ${isChallenge ? '' : 'primary'}`, onclick: () => navigate(`/r/${code}?v=watch`) }, icon('play', 14), 'Watch replay'),
          h('button', { class: `btn ${isChallenge ? 'primary' : ''}`, onclick: () => navigate(`/r/${code}?v=go`) }, icon('ghost', 16), isChallenge ? `Race ${run.player.name}` : 'Race this ghost'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code, 'race'), `Beat ${run.player.name}'s Anteater Guesser run`) }, icon('link', 16), 'Copy challenge link'),
        ),
      ),
      h('p', { class: 'muted small center' }, 'Everything about this run, including the full replay, lives inside the link itself. Nothing is stored on a server.'),
    ),
  );
}
