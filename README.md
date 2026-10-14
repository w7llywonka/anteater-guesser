# Anteater Guesser

Speedrun dropping a pin on **26 Murasaki St, Irvine, CA** on real satellite imagery.

You get dropped at a random spot on land somewhere on Earth. Zoom, pan, find the house, double-click it. Every round scores up to **5,000 for accuracy** (distance to the house outline) plus up to **5,000 for speed**. Speed points are multiplied by your accuracy, so a fast pin in the wrong place is worth nothing.

## Features

- **Singleplayer:** World Drop (a new random spot on land every run, nothing to memorise), Local Drops (SoCal / Irvine / Campus) and a Daily Drop that is the same for everyone. 1, 3 or 5 rounds.
- **Live 1v1:** create a room, send the link, and race on the same drops. You see your opponent's camera live. When one of you locks in, the other has 15 seconds left.
- **Run links:** every run is packed into its link (camera path, pins, profile). Open one to watch the replay or race it as a ghost. Nothing is stored on a server.
- **Progression:** XP and levels, 12 achievements, and a Locker full of anteater gear: fur, hats, eyewear, neckwear, backgrounds, map pins and titles.
- **Built for slow machines and slow internet:**
  - A custom satellite map engine with no mapping library, about 30 KB gzipped for the whole site.
  - Low / Balanced / High graphics presets.
  - Tiles for zoom levels you skip past are never downloaded.
  - The countdown waits for the map to finish loading.
  - The whole planet at low zoom, plus the full dive down to the house, preloads in the background.
  - A service worker keeps tiles on the device between visits.

## Controls

| | |
|---|---|
| Drag, WASD, arrow keys | Pan |
| Wheel, pinch, Q / E | Zoom |
| Click | Place pin |
| Double-click, Space | Lock in |
| R | New drop |
| Esc | Quit |

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (scoring, run links, drops)
npm run build      # typecheck + production build into dist/
```

## Deploying (Vercel)

Import the repo in Vercel. `vercel.json` already sets the build command, the output folder and long-term caching for hashed assets. The free Hobby tier is plenty: the site is static, satellite tiles come straight from Esri, and 1v1 traffic flows directly between the two players' browsers.

## How multiplayer works without a server

- **Live duels** use WebRTC via [PeerJS](https://peerjs.com). PeerJS's free public broker only introduces the two browsers. After that, every message goes directly between them, through PeerJS's TURN relay if a network blocks direct connections.
- **Challenge links** need nothing at all. The run is encoded into the link, so your friend races your ghost on the same seed and sends their own link back.

Links can be edited by hand, so treat scores from links as friendly bragging rights, not a secure leaderboard. Edited links are flagged.

## Project layout

```
src/map/       MapView (tile engine, gestures, fly-to), background prefetcher
src/game/      rounds, scoring, seeded drops, land masks, run codec, replays, HUD
src/net/       peer-to-peer duel transport
src/profile/   profile, levels, items, SVG anteater avatar, rewards
src/screens/   home, play, replay/run pages, runs, locker, duel, settings
public/sw.js   tile cache service worker
```

## Credits

- Imagery: Esri World Imagery (Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN and the GIS User Community). Use it within [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement).
- House outline: © OpenStreetMap contributors (ODbL).
- Land masks: Natural Earth (public domain).
