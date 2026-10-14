import './styles.css';
import { route, startRouter } from './router';
import { applyRootClasses } from './settings';
import { homeScreen } from './screens/home';
import { playScreen } from './screens/play';
import { settingsScreen } from './screens/settings';
import { dailyConfig, type GameConfig } from './game/modes';
import { parseSeedLabel, randomSeed } from './util/rng';
import { ZONES, type ZoneId } from './config';

applyRootClasses();

route('/', (root) => homeScreen(root));
route('/settings', (root) => settingsScreen(root));
route('/play', (root, q) => playScreen(root, { cfg: parseCfg(q) }));
route('/runs', async (root) => (await import('./screens/runs')).runsScreen(root));
route('/locker', async (root) => (await import('./screens/locker')).lockerScreen(root));
route('/r', async (root, q, parts) => (await import('./screens/runView')).runViewScreen(root, parts[0] ?? '', q));
route('/duel', async (root, _q, parts) => (await import('./screens/duel')).duelScreen(root, parts[0] ?? ''));

function parseCfg(q: URLSearchParams): GameConfig {
  const mode = q.get('mode');
  if (mode === 'daily') return dailyConfig();
  const rounds = Math.max(1, Math.min(5, Number(q.get('rounds')) || 1));
  const zone = (q.get('zone') ?? 'world') as ZoneId;
  return {
    mode: 'drop',
    zone: zone in ZONES ? zone : 'world',
    rounds,
    // A seed only appears in hand-made practice links; normal runs are random every time.
    seed: parseSeedLabel(q.get('seed') ?? '') ?? randomSeed(),
  };
}

startRouter(document.getElementById('app')!);
