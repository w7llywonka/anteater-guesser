// Hand-drawn SVG anteater (side profile, facing right) with layered accessories.
// Returned as a markup string so it can be dropped into innerHTML with zero DOM overhead.

import { item, type Avatar } from './items';

let uid = 0;

export function avatarSVG(av: Avatar, size = 96): string {
  const id = `av${++uid}`;
  const [base, light, dark] = item('fur', av.fur).c!;
  const [bg0, bg1] = item('bg', av.bg).c!;
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
<defs>
<radialGradient id="${id}b" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${bg0}"/><stop offset="1" stop-color="${bg1}"/></radialGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${light}"/></linearGradient>
<clipPath id="${id}c"><circle cx="60" cy="60" r="58"/></clipPath>
</defs>
<circle cx="60" cy="60" r="58" fill="url(#${id}b)"/>
<g clip-path="url(#${id}c)">
${bgDecor(av.bg)}
<path d="M-6 124 C-4 92 14 80 40 80 C66 80 86 94 92 124 Z" fill="${base}"/>
<path d="M14 124 C22 104 40 92 62 92 L70 100 C50 100 34 110 28 124 Z" fill="${dark}"/>
<path d="M28 124 C34 110 50 100 70 100 L74 105 C56 106 42 114 38 124 Z" fill="#f4efe6" opacity=".9"/>
<path d="M30 84 C30 74 36 70 46 70 C56 70 62 76 62 86 L60 96 C52 99 40 99 32 95 Z" fill="${base}"/>
${neck(av.neck)}
<ellipse cx="34" cy="40" rx="7" ry="9.5" transform="rotate(-22 34 40)" fill="${base}"/>
<ellipse cx="34.5" cy="41" rx="3.6" ry="6" transform="rotate(-22 34.5 41)" fill="${dark}" opacity=".55"/>
<ellipse cx="46" cy="60" rx="24" ry="22" fill="${base}"/>
<path d="M54 44 C74 46 96 58 108 66 C114 70 113 77 107 78 C92 80 74 82 54 82 Z" fill="url(#${id}s)"/>
<ellipse cx="109.5" cy="71.5" rx="4.6" ry="4" fill="#1d1410"/>
<path d="M104 78.5 q4 4 1 8" stroke="#ff7aa8" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<ellipse cx="60" cy="71" rx="6" ry="3.4" fill="#ff8fb1" opacity=".35"/>
<circle cx="58.5" cy="57" r="5" fill="#1d1410"/>
<circle cx="60.3" cy="55.2" r="1.7" fill="#fff"/>
<path d="M52 49.5 q6-3.5 12 0" stroke="${dark}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
${eyes(av.eyes)}
${hat(av.hat)}
</g>
</svg>`;
}

function bgDecor(bg: string): string {
  switch (bg) {
    case 'grid':
      return `<g stroke="#3fd19b" stroke-opacity=".28" stroke-width="1">${[15, 35, 55, 75, 95].map((v) => `<path d="M${v} 0V120M0 ${v}H120"/>`).join('')}</g><circle cx="88" cy="28" r="4" fill="#ff4d5a"/>`;
    case 'sat':
      return `<g opacity=".35"><rect x="8" y="10" width="26" height="18" fill="#9aa86a"/><rect x="40" y="6" width="20" height="24" fill="#4e5a2e"/><rect x="70" y="14" width="34" height="14" fill="#b8b08a"/><path d="M0 34 L120 22" stroke="#d8d2c0" stroke-width="3"/></g>`;
    case 'night':
    case 'galaxy':
      return `<g fill="#fff">${[
        [14, 18, 1.2],
        [30, 8, 0.8],
        [78, 12, 1.4],
        [100, 30, 1],
        [92, 50, 0.7],
        [10, 46, 0.9],
        [62, 22, 0.6],
        [108, 14, 0.8],
      ]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
        .join('')}</g>${bg === 'galaxy' ? '<ellipse cx="80" cy="26" rx="34" ry="8" transform="rotate(-18 80 26)" fill="#ff7ae6" opacity=".18"/>' : '<circle cx="96" cy="22" r="8" fill="#fff6c8" opacity=".9"/>'}`;
    case 'bolt':
      return '<path d="M86 4 L70 34 H84 L72 60 L102 24 H88 L98 4 Z" fill="#fff" opacity=".35"/>';
    case 'sunset':
      return '<circle cx="90" cy="34" r="16" fill="#ffd36e" opacity=".55"/>';
    default:
      return '';
  }
}

function hat(id: string): string {
  switch (id) {
    case 'cap':
      return `<g><path d="M24 40 C24 22 42 16 54 20 C64 23 68 32 68 40 Z" fill="#0b5ea8"/><path d="M60 38 C72 36 86 38 92 42 C84 45 70 45 60 43 Z" fill="#0a4a85"/><circle cx="46" cy="19.5" r="2.6" fill="#ffd200"/><path d="M34 26 q10-6 20 0" stroke="#ffd200" stroke-width="3" fill="none"/></g>`;
    case 'beanie':
      return `<g><path d="M24 42 C22 22 36 14 48 14 C60 14 70 24 68 42 Z" fill="#e2483d"/><rect x="22" y="36" width="48" height="9" rx="4.5" fill="#b8322a"/><g stroke="#ff6f63" stroke-width="2"><path d="M34 34V20M44 34V16M54 34V17M62 34V24"/></g><circle cx="47" cy="12" r="6" fill="#fff"/></g>`;
    case 'party':
      return `<g transform="rotate(-12 46 30)"><path d="M32 40 L48 2 L64 40 Z" fill="#ff5fa2"/><path d="M38 26 L58 26 M35 33 L61 33 M42 17 L54 17" stroke="#ffd200" stroke-width="3"/><circle cx="48" cy="2" r="4.5" fill="#5be3ff"/></g>`;
    case 'grad':
      return `<g><path d="M28 36 C28 28 64 28 64 36 L64 42 C56 39 36 39 28 42 Z" fill="#14181f"/><path d="M14 30 L48 18 L84 30 L48 40 Z" fill="#1d232d"/><path d="M48 29 L74 32 L76 50" stroke="#ffd200" stroke-width="2" fill="none"/><circle cx="76" cy="51" r="3" fill="#ffd200"/></g>`;
    case 'cowboy':
      return `<g><path d="M8 40 C20 46 76 46 88 36 C82 42 76 44 70 42 L66 22 C62 14 50 16 48 20 C44 14 32 14 30 22 L26 42 C18 44 12 42 8 40 Z" fill="#8a5a2b"/><path d="M27 36 C40 38 56 38 68 35 L69 39 C56 42 40 42 26 40 Z" fill="#4a2e14"/></g>`;
    case 'propeller':
      return `<g><path d="M24 42 C22 26 34 20 46 20 C58 20 70 26 68 42 Z" fill="#ffd200"/><path d="M24 42 C30 30 36 24 46 20 L46 42 Z" fill="#e2483d"/><path d="M46 42 L46 20 C56 22 64 28 68 42 Z" fill="#1f78d1"/><rect x="45" y="10" width="2.5" height="11" fill="#333"/><path d="M30 10 C38 6 44 9 46 10 C48 9 56 6 64 10 C56 13 50 12 46 11 C42 12 36 13 30 10 Z" fill="#2ccf8f"/></g>`;
    case 'wizard':
      return `<g><path d="M18 42 C30 46 66 46 78 40 C72 38 66 37 64 37 L54 -2 C48 6 38 22 32 37 C26 38 22 40 18 42 Z" fill="#4b2fa8"/><path d="M40 22 l2 4 4 .6 -3 3 .8 4.2 -3.8-2 -3.8 2 .8-4.2 -3-3 4-.6 z" fill="#ffd200"/><circle cx="56" cy="30" r="1.8" fill="#ffd200"/><circle cx="50" cy="12" r="1.4" fill="#ffd200"/></g>`;
    case 'chef':
      return `<g><path d="M28 40 L28 28 C18 26 18 10 30 12 C32 2 46 0 50 8 C56 0 70 4 66 14 C76 14 76 28 64 28 L64 40 Z" fill="#fff"/><path d="M28 34 H64" stroke="#d9dee6" stroke-width="2"/></g>`;
    case 'crown':
      return `<g><path d="M26 40 L24 18 L35 28 L46 12 L57 28 L68 18 L66 40 Z" fill="#ffd200" stroke="#c99700" stroke-width="1.5" stroke-linejoin="round"/><circle cx="46" cy="32" r="3.2" fill="#e2483d"/><circle cx="34" cy="34" r="2.2" fill="#1f78d1"/><circle cx="58" cy="34" r="2.2" fill="#2ccf8f"/></g>`;
    case 'halo':
      return '<ellipse cx="46" cy="22" rx="20" ry="6" fill="none" stroke="#ffe36a" stroke-width="4.5"/><ellipse cx="46" cy="22" rx="20" ry="6" fill="none" stroke="#fff6c2" stroke-width="1.5"/>';
    case 'headphones':
      return `<g><path d="M22 58 C18 30 32 24 46 24 C60 24 72 30 70 56" stroke="#222831" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="16" y="50" width="12" height="18" rx="5" fill="#e2483d"/><rect x="18" y="53" width="8" height="12" rx="3" fill="#222831"/></g>`;
    default:
      return '';
  }
}

function eyes(id: string): string {
  switch (id) {
    case 'nerd':
      return '<g fill="none" stroke="#1d1410" stroke-width="2.2"><circle cx="58.5" cy="57" r="8.5" fill="#bfe3ff" fill-opacity=".25"/><path d="M50 56 L36 50"/></g>';
    case 'shades':
      return '<g><path d="M48 51 H70 C70 61 66 65 59 65 C52 65 48 60 48 51 Z" fill="#111" stroke="#111" stroke-width="1.5"/><path d="M52 54 L56 54" stroke="#6b7a8f" stroke-width="2" stroke-linecap="round"/><path d="M48 52 L34 48" stroke="#111" stroke-width="2.4"/></g>';
    case 'monocle':
      return '<g fill="none" stroke="#d4af37" stroke-width="2.4"><circle cx="58.5" cy="57" r="8"/><path d="M56 65 C52 76 58 84 52 96" stroke-width="1.4"/></g>';
    case '3d':
      return '<g><rect x="48.5" y="50" width="20" height="13" rx="2" fill="#e8384f" fill-opacity=".85" stroke="#f4f4f4" stroke-width="2.4"/><path d="M48 54 L34 49" stroke="#f4f4f4" stroke-width="2.4"/></g>';
    case 'star':
      return '<g><path d="M59 45 l3.6 7.4 8.2 1.2 -6 5.8 1.4 8.1 -7.2-3.8 -7.3 3.8 1.4-8.1 -5.9-5.8 8.1-1.2 z" fill="#ff5fa2" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><path d="M50 53 L34 48" stroke="#ff5fa2" stroke-width="2.4"/></g>';
    case 'visor':
      return '<g><path d="M26 52 C40 46 60 46 76 50 L76 60 C60 58 40 58 26 62 Z" fill="#20e3ff" fill-opacity=".75" stroke="#0aa6c2" stroke-width="1.5"/><path d="M34 54 H70" stroke="#e6fdff" stroke-width="1.4" opacity=".8"/></g>';
    default:
      return '';
  }
}

function neck(id: string): string {
  switch (id) {
    case 'bowtie':
      return '<g><path d="M46 92 L32 84 L32 100 Z M46 92 L60 84 L60 100 Z" fill="#e2483d"/><circle cx="46" cy="92" r="4" fill="#b8322a"/></g>';
    case 'scarf':
      return '<g><path d="M28 84 C38 92 56 92 64 84 L66 94 C56 102 36 102 26 94 Z" fill="#ffd200"/><path d="M34 90 L36 98 M44 92 L45 100 M54 91 L55 99" stroke="#0b5ea8" stroke-width="3"/><path d="M56 94 L62 116 L52 116 L50 96 Z" fill="#0b5ea8"/></g>';
    case 'bandana':
      return '<g><path d="M28 86 C40 92 54 92 64 86 L50 108 Z" fill="#d7263d"/><g fill="#fff"><circle cx="42" cy="93" r="1.3"/><circle cx="50" cy="97" r="1.3"/><circle cx="56" cy="91" r="1.3"/></g></g>';
    case 'chain':
      return '<g fill="none" stroke="#e8b923" stroke-width="2.6" stroke-dasharray="3 1.5"><path d="M30 86 C36 100 56 100 62 86"/></g><circle cx="46" cy="100" r="5.5" fill="#e8b923"/><text x="46" y="103" font-size="7" font-weight="900" text-anchor="middle" fill="#7a5c00" font-family="system-ui">Z</text>';
    case 'lei':
      return `<g>${[30, 36, 42, 48, 54, 60]
        .map((x, i) => `<circle cx="${x}" cy="${88 + Math.sin((i / 5) * Math.PI) * 8}" r="4.2" fill="${['#ff5fa2', '#ffd200', '#ff7a00', '#ff5fa2', '#ffd200', '#ff7a00'][i]}"/>`)
        .join('')}</g>`;
    case 'medal':
      return '<g><path d="M36 84 L44 104 L48 104 L42 84 Z" fill="#1f78d1"/><path d="M58 84 L50 104 L46 104 L52 84 Z" fill="#e2483d"/><circle cx="47" cy="108" r="7" fill="#ffd200" stroke="#c99700" stroke-width="1.6"/><text x="47" y="111" font-size="8" font-weight="900" text-anchor="middle" fill="#7a5c00" font-family="system-ui">1</text></g>';
    default:
      return '';
  }
}

/** Map pin marker in the player's chosen skin. */
export function pinSVG(pinId: string, size = 34): string {
  const [fill, accent] = item('pin', pinId).c!;
  let glyph = `<circle cx="16" cy="14" r="5" fill="${accent}"/>`;
  if (pinId === 'star') glyph = `<path d="M16 7.5l2 4.3 4.7.6-3.4 3.2.9 4.6-4.2-2.3-4.2 2.3.9-4.6-3.4-3.2 4.7-.6z" fill="${accent}"/>`;
  if (pinId === 'bolt') glyph = `<path d="M17.5 6.5 L11.5 15 H15.5 L14 21.5 L20.5 12.5 H16.5 Z" fill="${accent}"/>`;
  if (pinId === 'target') glyph = `<circle cx="16" cy="14" r="6.5" fill="none" stroke="${accent}" stroke-width="2"/><circle cx="16" cy="14" r="2.5" fill="${accent}"/>`;
  return `<svg width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 32 42" aria-hidden="true"><ellipse cx="16" cy="40" rx="6" ry="2" fill="#000" opacity=".35"/><path d="M16 39 C16 39 3 24 3 14 A13 13 0 0 1 29 14 C29 24 16 39 16 39 Z" fill="${fill}" stroke="#fff" stroke-width="2"/>${glyph}</svg>`;
}
