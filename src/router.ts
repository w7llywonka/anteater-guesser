// Hash router: every page (including shared run links) lives after the "#", so the site is
// fully static and run data never leaves the visitor's browser.

export type Screen = (root: HTMLElement, params: URLSearchParams, parts: string[]) => void | (() => void) | Promise<void | (() => void)>;

const routes: Array<{ prefix: string; screen: Screen }> = [];
let cleanup: (() => void) | null = null;
let root: HTMLElement;
let token = 0;
let rendered = '';

export function route(prefix: string, screen: Screen) {
  routes.push({ prefix, screen });
}

export function navigate(path: string, replace = false) {
  const url = `#${path}`;
  if (location.hash === url) {
    void render();
    return;
  }
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  void render();
}

export function currentPath(): string {
  return location.hash.slice(1) || '/';
}

async function render() {
  const my = ++token;
  const full = currentPath();
  rendered = location.hash;
  const [path, query = ''] = full.split('?');
  const parts = path.split('/').filter(Boolean);
  const head = `/${parts[0] ?? ''}`;
  const r = routes.find((x) => x.prefix === head) ?? routes.find((x) => x.prefix === '/')!;
  cleanup?.();
  cleanup = null;
  root.replaceChildren();
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  const res = await r.screen(root, new URLSearchParams(query), parts.slice(1));
  if (my !== token) {
    if (typeof res === 'function') res();
    return;
  }
  cleanup = typeof res === 'function' ? res : null;
}

export function startRouter(el: HTMLElement) {
  root = el;
  // Back/forward fires both events for hash URLs; render once per actual change.
  const onChange = () => {
    if (location.hash !== rendered) void render();
  };
  window.addEventListener('popstate', onChange);
  window.addEventListener('hashchange', onChange);
  void render();
}
