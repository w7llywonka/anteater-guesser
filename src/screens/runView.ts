import { h } from '../util/dom';
import { page, topbar } from './chrome';

export function runViewScreen(root: HTMLElement, _code: string, _q: URLSearchParams) {
  root.append(topbar(), page('Run', h('section', { class: 'card' }, h('p', null, 'Replays and ghost races are coming in the next update. Your link is saved in this browser.'))));
}
