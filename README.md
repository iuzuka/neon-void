# neon-void

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/iuzuka/neon-void/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/iuzuka/neon-void/reward.svg)](https://make.fun/bounty/best-game-01)

**NEON VOID** — a neon arcade shooter for [make.fun's best-game-01](https://make.fun/bounty/best-game-01). Pilot the last starfighter through the void swarm: blast drifters, weavers and stingers, dodge their plasma, bank energy cores to charge your Nova, and survive as many waves as you can. Three ships. One Nova at a time. No mercy.

## Play

Open `game/index.html` in a desktop browser (or `node serve.ts` and open http://localhost:8080). No build step, no network — the whole game is static files under `game/`.

- **Move** — Arrow keys / WASD / Mouse (the ship steers toward your pointer)
- **Fire** — Space (hold) / Click (hold)
- **Nova** — X / Right-click: clears the sky, spends one charge
- **Pause** — P · **Mute** — M

Score for every kill, with a combo multiplier for kill streaks. Wave clears pay a bonus; every 5th wave clears a sector for a bigger one. Cores dropped by kills drift down — collect 5 to earn a Nova charge (max 3). The swarm shoots back, so holding one spot gets you killed.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `game/` — the playable game, plain static files: `index.html` and `src/` (one job per file: `config`, `random`, `audio`, `world`, `input`, `render`, `shots`, `main`)
- `screenshots/` — 3–4 real renders of the game's own code: title, play, action, game over
- `shots.json` — the `?shot=` scenes the screenshots were taken from (seeded, repeatable)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `serve.ts` — a tiny static server for playing locally (not part of the entry)
