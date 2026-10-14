import { h } from '../util/dom';
import { detectQuality, settings, updateSettings, type QualitySetting } from '../settings';
import { segmented, toggle } from './home';
import { page, topbar } from './chrome';

export function settingsScreen(root: HTMLElement) {
  const q = segmented(
    [
      { v: 'auto', label: `Auto (${detectQuality()})` },
      { v: 'low', label: 'Low' },
      { v: 'balanced', label: 'Balanced' },
      { v: 'high', label: 'High' },
    ],
    settings.quality,
    (v) => updateSettings({ quality: v as QualitySetting }),
  );
  const zoom = segmented(
    [
      { v: '0.6', label: 'Slow' },
      { v: '1', label: 'Normal' },
      { v: '1.5', label: 'Fast' },
      { v: '2', label: 'Turbo' },
    ],
    String(settings.zoomSpeed),
    (v) => updateSettings({ zoomSpeed: Number(v) }),
  );
  root.append(
    topbar(),
    page(
      'Settings',
      h(
        'section',
        { class: 'card settings' },
        row('Graphics', 'Low loads fewer, softer tiles and turns off animations. Use it on old laptops, Chromebooks and phones on slow data.', q),
        row('Scroll-wheel zoom speed', 'How far one wheel notch zooms.', zoom),
        toggle('One-click lock-in', 'Your first click locks the pin in instantly. Fastest, no take-backs.', settings.oneClick, (v) => updateSettings({ oneClick: v })),
        toggle('Reduce motion', 'Skip fly-to animations, inertia and count-ups.', settings.reduceMotion, (v) => updateSettings({ reduceMotion: v })),
        toggle('Sound effects', 'Countdown beeps and lock-in sounds.', settings.sound, (v) => updateSettings({ sound: v })),
        toggle('Show ghosts', "Show the other runner's camera and pin while racing.", settings.showGhost, (v) => updateSettings({ showGhost: v })),
      ),
      h(
        'p',
        { class: 'muted small' },
        'Everything (profile, runs, settings) is stored only in this browser. Imagery: Esri World Imagery (Maxar, Earthstar Geographics and the GIS user community). House outline © OpenStreetMap contributors (ODbL). Land masks: Natural Earth.',
      ),
    ),
  );
}

function row(label: string, desc: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'set-row' }, h('div', null, h('b', null, label), h('small', null, desc)), control);
}
