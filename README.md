# lumen-void

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/iuzuka/neon-void/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/iuzuka/neon-void/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Build a complete, original game that plays offline in a desktop browser; an AI judge compares the games two at a time and the 10 best share $1,000.

**LUMEN VOID — hold the last light**, for [make.fun's best-game-01](https://make.fun/bounty/best-game-01). You are the keeper of the last lantern in the void. The Hollow swarm is drawn to its light, and anything that reaches the lantern feeds on it. Light is the only weapon: inside the lantern's glow enemies take full damage and your turrets can aim; in the dark they are shielded, faster, and your turrets go blind. Spend the prisms the fallen drop on turrets, on rekindling the light, on mending the lantern and on your ship — and survive all 20 waves, the wardens, and the three-phase Hollow Sun. Then the Endless Afterglow begins.

## The game

- **Light is the only weapon.** The lantern's glow is a circle on the field. Enemies inside it take full damage; enemies in the dark take a quarter, move faster, and wear a shield ring. Your turrets only fire at enemies inside the light. The dark closes in a little every wave — rekindle it with prisms.
- **Tower defence.** Four turrets, each with three levels (level 3 is its final form): Pulse (fast, close), Lance (a piercing beam that hits everything in a line), Nova mortar (slow, splash), and Prism (a chain beam that splits its light from one lit Hollow to the next — best against a crowd; its final form sprays the neighbours too). Place them with keys 1/2/3/4 or the build bar, then click the field. Click a turret to select it and press U to upgrade it. Turrets only fire inside the light.
- **The Wraith.** A sixth Hollow that phases: half its life solid and hittable, half a ghost no weapon can touch — but a ghost cannot feed on the lantern or ram your ship, either. It is slow, it has little hide, and it pays three prisms. Three Wraiths on the field hunt as a haunting, phasing in step.
- **Radiance.** Kills feed a meter; a full meter breaks into a Radiant Burst — six seconds of wider light and weapons that hit half as hard again, plus prisms from the light itself. Halfway up the climb the next kill glimmers for a bonus prism.
- **The lantern.** It has 100 light. Every Hollow that reaches it feeds and deals damage; at 0 the light dies and the game ends. Mend it with prisms (B). Its glow shrinks every wave — rekindle it (R).
- **20 waves, bosses, mutators.** A boss every 5 waves: a Warden at 5, 10 and 15, and the three-phase Hollow Sun at 20 — radial bursts, spiral fire, a final burn. Later waves carry mutators: Dark Surge (the light shrinks), Swarm (twice the Hollow), Armored (thick hides), Swift (the Hollow runs), Gilded (rich hides, double prisms), Blood Moon (red light, hungry dark, half as many prisms again). Wave clears pay score and prisms; every 5th wave clears a sector for a bigger bonus.
- **The ship.** Fly it, shoot the swarm, dodge their plasma, bank prisms to charge your Nova (X clears the sky). Three ships. Fire-rate and hull upgrades, bought with prisms.
- **Win and endless.** Fell the Hollow Sun at wave 20 and the light endures — then keep going in the Endless Afterglow, where the waves never stop scaling.

## Play

Open `game/index.html` in a desktop browser (or `node serve.ts` and open http://localhost:8080). No build step, no network — the whole game is static files under `game/`.

- **Move** — Arrow keys / WASD / Mouse (the ship steers toward your pointer)
- **Fire** — Space (hold) / Click (hold)
- **Nova** — X / Right-click: clears the sky, spends one charge
- **Build** — 1 / 2 / 3 / 4, then click the field to place a turret; click a turret to select it, **U** to upgrade
- **Rekindle** — R: +60 light radius · **Mend** — B: +25 lantern light · **Fire+** — F · **Hull+1** — H
- **Pause** — P · **Mute** — M

Prisms drop from kills as green diamonds — fly over them to bank them. Every 5 banked prisms charges a Nova (max 3). A kill streak raises the score multiplier (up to x5) and pays milestones: every 10th kill in a row banks +2 prisms, every 25th charges a Nova.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `game/` — the playable game, plain static files: `index.html` and `src/` (one job per file: `config`, `random`, `audio`, `world`, `input`, `render`, `shots`, `main`, plus the Prism update's own modules — `prism`, `wraith`, `mutators`, `radiance` — and the Streak's `combo`)
  - `world.js` — the simulation: the ship, the Hollow, the lantern and its light, turrets, prisms, bosses, waves, mutators, victory and the Afterglow
  - `render.js` — the look: the lantern's glow and the dark beyond it, turrets, boss bars, the build bar, title / pause / victory / game-over screens
  - `prism.js` — the Prism turret's chain beam: hopping, falloff, final-form spray
  - `wraith.js` — the Wraith's phase: solid and ghost, the haunting, its own ghost drawing
  - `mutators.js` — the new mutators' rules: prism drops, HUD tints, the Afterglow rotation
  - `radiance.js` — the Radiance meter: kills feed it, a full meter bursts, halfway glimmers
  - `shots.js` — the staged screenshot scenes: title, a wave, the Warden fight, the fallen light, the Prism update
- `screenshots/` — 3–4 real renders of the game's own code: title, play, action, game over
- `shots.json` — the `?shot=` scenes the screenshots were taken from (seeded, repeatable)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `serve.ts` — a tiny static server for playing locally (not part of the entry)

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=781caceh&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
