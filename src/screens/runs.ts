import { h } from '../util/dom';
import { page, topbar } from './chrome';

export function runsScreen(root: HTMLElement) {
  root.append(topbar(), page('Your runs', h('section', { class: 'card' }, h('p', null, 'Coming in the next update.'))));
}
