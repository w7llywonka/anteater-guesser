import { h } from '../util/dom';
import { page, topbar } from './chrome';

export function lockerScreen(root: HTMLElement) {
  root.append(topbar(), page('Locker', h('section', { class: 'card' }, h('p', null, 'Coming in the next update.'))));
}
