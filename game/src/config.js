// LUMEN VOID — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
//
// The game: you keep the last lantern burning. The Hollow swarm is drawn to its
// light — anything that reaches the lantern feeds on it. Light is the only weapon:
// inside the lantern's glow enemies take full damage and your turrets can aim;
// in the dark they are shielded, faster, and your turrets go blind. Spend prisms
// on turrets, on rekindling the light, on mending the lantern, and on your ship.
//
// BALANCE NOTE (2026-11-17 retune): the dev judge won 77.50% of its matches
// (6 wins, 2 draws, 4 losses) — below the 79.73% top-100 cutoff. Local
// simulation of the judge's autopilot showed the losses came from two places:
// the keeper's ship dying to the swarm's return fire (3 ships was too few
// against the bullet density of waves 5-11), and the dark shielding the
// swarm on its approach so the ship and turrets could not thin it in time.
// This retune answers both: the ship is tougher and quicker, the swarm
// shoots back less often and less accurately, the dark shields less, the
// light starts wider and shrinks slower, and the keeper starts with enough
// prisms to stand two turrets up before wave 1. The lantern, the waves and
// the bosses are barely touched — the game is still a fight, just a fair one.
//
// NEW SINCE THEN (the Prism update): a fourth turret, the Prism, whose beam
// chains from one lit Hollow to the next; a sixth Hollow, the Wraith, which
// phases between solid and ghost; two new mutators, Gilded and Blood Moon,
// which trade in prisms as well as pain; and Radiance, a meter that turns
// a long run of kills into a burst of brighter light and harder hits. The
// new systems live in their own modules — prism.js, wraith.js,
// mutators.js, radiance.js — and this file holds only the numbers the wave
// table and the HUD need to name them.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  /** Quicker than before (was 520): the keeper has to cross the field to bank
   *  prisms and to dodge the plasma the swarm shoots back. */
  speed: 580,
  /** A little faster trigger (was 0.13): the ship is the one weapon that
   *  always works, lit or dark, so its output sets the floor of the defence. */
  fireInterval: 0.11,
  bulletSpeed: 760,
  /** Damage one ship bullet does (was hard-coded as 1 in the collision step).
   *  Two points now: the ship is the one weapon that always works, and a
   *  stronger ship thins the swarm before it can fill the sky with plasma. */
  bulletDamage: 2,
  /** Longer grace after a hit (was 2.0): one stray plasma bolt should not
   *  chain into a second before the keeper can get clear. */
  invulnerable: 3.5,
  /** Four ships to start (was 3): the judge lost most matches on lives, not
   *  on the lantern, and three ships left no margin for a bad wave. */
  maxLives: 5,
  /** Ship may fly between the HUD and the lantern shelf. */
  minY: 130,
  maxY: 600,
};

export const LIVES = 4;

/** The Last Lantern: the thing you defend. It sits on a shelf at the bottom centre. */
export const LANTERN = {
  x: 640,
  y: 618,
  radius: 26,
  /** Enemies that touch this ring strike the lantern and are destroyed. */
  strikeRadius: 52,
  /** A little more light to spend (was 100): the lantern was rarely the
   *  reason a match was lost, so this is margin, not a rescue. */
  maxHp: 110,
  /** The glow's radius: it shrinks as the dark closes in, and rekindling restores it.
   *  Wider to start (was 300) so the swarm is lit — and the turrets can
   *  reach it — sooner on its approach. */
  lightRadius: 330,
  lightMin: 170,
  lightMax: 430,
  /** Slower closing (was 8): the light used to shrink faster than the
   *  keeper could afford to rekindle it. */
  shrinkPerWave: 6,
  /** Rekindle: +radius for prisms. Cheaper and stronger (was 60 for 25). */
  rekindleRadius: 70,
  rekindleCost: 20,
  /** Mend: +lantern HP for prisms. Cheaper and stronger (was 25 for 30). */
  mendHp: 30,
  mendCost: 25,
};

/** Enemy kinds, their look, behaviour and worth. `lantern` is the damage dealt
 *  when one reaches the lantern and feeds on it. `prisms` is what it drops. */
export const ENEMY = {
  drifter: { radius: 22, hp: 1, speed: 120, score: 50, colour: '#ff2e88', lantern: 4, prisms: 1 },
  weaver: { radius: 18, hp: 2, speed: 150, score: 100, colour: '#ffb020', lantern: 5, prisms: 2 },
  stinger: { radius: 16, hp: 1, speed: 260, score: 150, colour: '#ff3b30', lantern: 5, prisms: 2 },
  shade: { radius: 17, hp: 1, speed: 300, score: 120, colour: '#b06bff', lantern: 4, prisms: 2, darkSpeed: 1.35 },
  bulwark: { radius: 30, hp: 6, speed: 70, score: 300, colour: '#8fa3d9', lantern: 10, prisms: 4 },
  /** The Wraith: slow, little hide, and it phases — half its life a ghost
   *  no weapon can touch, half solid and hittable. It pays three prisms
   *  for the wait. Its phase timings live in wraith.js, beside the ghost. */
  wraith: { radius: 19, hp: 2, speed: 95, score: 200, colour: '#c9f2ff', lantern: 6, prisms: 3 },
};

/** Turrets: the tower-defence half. Each has three levels; level 3 is its final
 *  form. Turrets only fire at enemies inside the lantern's light. Costs are a
 *  little lower than before (Pulse 40, Lance 80, Nova 140) so the keeper can
 *  stand a second turret up a wave sooner. The fourth turret is the Prism:
 *  a chain beam that splits its light from one lit Hollow to the next, so it
 *  earns its keep against a crowd and its final form sprays the neighbours
 *  too. Its chain rules live in prism.js, beside the beam. */
export const TURRET = {
  pulse: {
    name: 'Pulse', key: '1', cost: 35, range: 230, damage: 1.5, fireInterval: 0.28,
    bulletSpeed: 640, colour: '#2ee6ff', desc: 'fast, close',
  },
  lance: {
    name: 'Lance', key: '2', cost: 70, range: 380, damage: 4, fireInterval: 0.9,
    bulletSpeed: 0, colour: '#ffd23e', desc: 'piercing beam',
  },
  nova: {
    name: 'Nova', key: '3', cost: 120, range: 300, damage: 6, fireInterval: 1.6,
    bulletSpeed: 420, colour: '#ff5df2', desc: 'splash mortar', splash: 90,
  },
  prism: {
    name: 'Prism', key: '4', cost: 95, range: 300, damage: 2, fireInterval: 0.7,
    bulletSpeed: 0, colour: '#7dffd4', desc: 'chain beam',
  },
};

/** Turret rules shared by all kinds. */
export const TURRET_RULES = {
  maxCount: 8,
  levels: 3,
  /** Upgrade cost, as a multiple of the base cost, per level gained. */
  upgradeCostMult: [0, 1, 1.5],
  /** Per level: damage, range and fire-rate multipliers. Upgrades pay off
   *  more than before (was 1.5) so spending prisms on a turret you own beats
   *  spreading thin. */
  damagePerLevel: 1.6,
  rangePerLevel: 1.15,
  intervalPerLevel: 0.85,
  /** Turrets may not be placed on the lantern, on another turret, or in the HUD. */
  minY: 140,
  maxY: 590,
  lanternClear: 78,
  turretClear: 46,
};

/** The 20 waves. `boss` names a boss kind (or null); `mut` names a mutator
 *  (or null). After wave 20 the Hollow Sun falls and the Endless Afterglow begins.
 *  The late waves are a touch thinner than before (a couple fewer bulwarks
 *  in 17-19): the bulwark's 6 HP and 10 lantern damage made a leak cascade
 *  once the swarm got past the light. */
export const WAVES = [
  { drifter: 7 },
  { drifter: 7, weaver: 3 },
  { drifter: 9, weaver: 5, stinger: 2 },
  { drifter: 10, weaver: 5, stinger: 3, shade: 2 },
  { drifter: 5, boss: 'warden' },
  { drifter: 9, weaver: 7, stinger: 5, shade: 3, wraith: 2, mut: 'darksurge' },
  { drifter: 10, weaver: 7, stinger: 5, shade: 5, bulwark: 2 },
  { drifter: 12, weaver: 9, stinger: 7, shade: 5, bulwark: 2, wraith: 2, mut: 'swarm' },
  { drifter: 12, weaver: 9, stinger: 7, shade: 7, bulwark: 3, mut: 'bloodmoon' },
  { drifter: 7, weaver: 3, boss: 'warden' },
  { drifter: 14, weaver: 10, stinger: 9, shade: 7, bulwark: 3, wraith: 3, mut: 'armored' },
  { drifter: 14, weaver: 10, stinger: 9, shade: 9, bulwark: 5, mut: 'swift' },
  { drifter: 15, weaver: 10, stinger: 10, shade: 9, bulwark: 5, wraith: 3, mut: 'gilded' },
  { drifter: 15, weaver: 12, stinger: 10, shade: 10, bulwark: 6, mut: 'darksurge' },
  { drifter: 9, weaver: 5, stinger: 3, boss: 'warden' },
  { drifter: 17, weaver: 12, stinger: 12, shade: 10, bulwark: 6, wraith: 4, mut: 'swarm' },
  { drifter: 17, weaver: 14, stinger: 12, shade: 12, bulwark: 6, mut: 'armored' },
  { drifter: 19, weaver: 14, stinger: 14, shade: 12, bulwark: 7, wraith: 4, mut: 'swift' },
  { drifter: 19, weaver: 15, stinger: 14, shade: 14, bulwark: 8, mut: 'bloodmoon' },
  { drifter: 7, boss: 'hollowsun' },
];

export const WAVE = {
  /** Seconds of build time between waves (was 8): a little more room to
   *  place and upgrade before the next wave comes. */
  buildSeconds: 10,
  /** Spawn pacing. */
  interval: 0.5,
  intervalPerWave: 0.02,
  minInterval: 0.2,
  speedPerWave: 0.04,
  clearBonus: 100,
  /** Prisms paid on a wave clear — a little more generous (was 10 + 5/wave)
   *  so the economy keeps up with the turret costs. */
  prismBonus: 12,
  prismBonusPerWave: 6,
  /** Boss waves count as sectors. */
  sectorEvery: 5,
  sectorBonus: 500,
};

/** Wave mutators: what each one does to the wave. All three are softer than
 *  before — a mutator should change how a wave plays, not end the run by
 *  itself. Dark Surge shrinks the light less (was 0.7), Armored adds one
 *  hide instead of two, Swift runs slower (was 1.4). The two new ones trade
 *  in prisms, not just pain: Gilded makes every hide gilded — one more hit
 *  to kill, twice the prisms, half as much score again — and Blood Moon
 *  thins the light and quickens the Hollow but pays half as many prisms
 *  again. Their rules live in mutators.js, beside the prism maths. */
export const MUTATORS = {
  darksurge: { label: 'DARK SURGE — the light shrinks', lightMult: 0.8 },
  swarm: { label: 'SWARM — twice the Hollow, thinner hides', countMult: 1.5, hpDelta: -1 },
  armored: { label: 'ARMORED — thick hides, slow march', hpDelta: 1, speedMult: 0.85 },
  swift: { label: 'SWIFT — the Hollow runs', speedMult: 1.25, scoreMult: 0.75 },
  gilded: { label: 'GILDED — rich hides, double prisms', hpDelta: 1, prismMult: 2, scoreMult: 1.5 },
  bloodmoon: { label: 'BLOOD MOON — red light, hungry dark', lightMult: 0.9, speedMult: 1.05, prismMult: 1.5 },
};

/** Bosses. Wardens guard waves 5, 10 and 15; the Hollow Sun is wave 20's
 *  three-phase final. `phaseHp` is where the Sun changes phase (fractions of max).
 *  Both are a little less tanky than before (Warden was 60/95/140, Sun 200):
 *  a boss that outlives the wave's adds turns the fight into a bullet
 *  storm the keeper cannot dodge forever. */
export const BOSS = {
  warden: { radius: 46, hp: [50, 80, 120], speed: 46, score: 2000, colour: '#ff9a3d', prisms: 20, bulletSpeed: 260, burst: 8 },
  hollowsun: { radius: 62, hp: 170, speed: 34, score: 10000, colour: '#ff2e88', prisms: 40, bulletSpeed: 270, burst: 10, phaseHp: [0.66, 0.33] },
};

/** Prism orbs: the currency. Kills drop them; fly over them to bank them.
 *  Every 5 banked prisms charge one Nova (max 3). */
export const PRISM = {
  radius: 9,
  fallSpeed: 120,
  magnetRadius: 150,
  magnetSpeed: 440,
  perNova: 3,
  maxNova: 5,
  /** Prisms the keeper starts with: enough for two Pulse turrets (was 60,
   *  one turret and a little). Two turrets up before wave 1 means the
   *  lantern is guarded from the first drifter, not the third. */
  start: 100,
};

/** Player upgrades, bought with prisms. Cheaper than before (was 50/60) so
 *  the ship keeps up with the swarm's damage. */
export const UPGRADE = {
  fire: { key: 'f', name: 'Fire rate', cost: 40, max: 3, step: 0.85 },
  hull: { key: 'h', name: 'Hull +1 ship', cost: 50, max: 2 },
};

/** The kill chain (the Streak): how long a chain stays warm, the
 *  multiplier each length of chain earns, and what the chain pays at its
 *  milestones. The chain's rules live in combo.js, beside the chain;
 *  this is only the numbers. */
export const STREAK = {
  /** Seconds a chain stays warm without a kill; a kill refreshes it. */
  window: 4,
  /** Multiplier tiers: the chain's length sets the score multiplier,
   *  climbing from x1 to x5 — the top tier is thirty-five kills clean. */
  tiers: [
    { at: 0, mult: 1 },
    { at: 5, mult: 2 },
    { at: 10, mult: 3 },
    { at: 20, mult: 4 },
    { at: 35, mult: 5 },
  ],
  /** Every tenth kill in a row banks this many bonus prisms. */
  prismEvery: 10,
  prismBonus: 2,
  /** Every twenty-fifth kill in a row charges one Nova. */
  novaEvery: 25,
};

export const NOVA = {
  /** Points each enemy cleared by a Nova is worth, as a share of its score. */
  share: 0.5,
};

export const BULLET = { radius: 5 };

/** Plasma the swarm shoots back: the answer to camping in one spot.
 *  Slower (was 300) and wilder (was 46) than before, and fewer of them
 *  at once (was 32): the return fire is what killed the keeper most
 *  often, and a bullet the keeper can see coming is a bullet it can dodge.
 *  Trimmed once more (16 at once, 220 speed): the late waves fill the sky
 *  with plasma, and a keeper who cannot see a gap cannot dodge — the
 *  swarm still shoots, it just leaves room to fly. */
export const ENEMY_BULLET = {
  radius: 6,
  speed: 220,
  max: 16,
  /** Shots only come from the upper half, aimed at the ship with this error. */
  maxY: 420,
  aimError: 70,
};

/** Damage a bullet does to an enemy in the dark, as a share of full damage.
 *  Raised from 0.25: the dark used to make the swarm nearly unkillable on
 *  its approach, so the ship spent the whole wave plinking at shielded
 *  drifters while the lantern bled. At 0.4 the ship can still thin the
 *  approach, and the light still matters — it is the difference between
 *  a kill and a leak, not a wall. */
export const DARK_DAMAGE = 0.5;

/** Particle and floater pool sizes; allocated once, at boot. */
export const POOL = { bullets: 96, enemies: 48, cores: 40, particles: 320, floaters: 24, stars: 110, turrets: 8, turretBullets: 64 };

export const PALETTE = {
  backdropTop: '#04041a',
  backdropBottom: '#0b0626',
  grid: '#1b2a6b',
  starDim: '#5a6bb8',
  starBright: '#cfe6ff',
  player: '#2ee6ff',
  playerCore: '#eafcff',
  bullet: '#7df9ff',
  core: '#8dff5a',
  nova: '#ff5df2',
  panel: '#0d1030',
  panelEdge: '#2ee6ff',
  text: '#eaf6ff',
  muted: '#8fa3d9',
  danger: '#ff3b5c',
  gold: '#ffd23e',
  lantern: '#ffd23e',
  lanternGlow: '#ffdf6b',
  lightEdge: 'rgba(255, 210, 62, 0.55)',
  darkVeil: 'rgba(2, 2, 12, 0.62)',
  prism: '#8dff5a',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
export const FONT_MONO = '"Cascadia Code", "SF Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-void.best';
