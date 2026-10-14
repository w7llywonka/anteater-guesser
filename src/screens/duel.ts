import { h } from '../util/dom';
import { page, topbar } from './chrome';

export function duelScreen(root: HTMLElement, _room: string) {
  root.append(topbar(), page('Live 1v1', h('section', { class: 'card' }, h('p', null, 'Live duels are coming in the next update.'))));
}
