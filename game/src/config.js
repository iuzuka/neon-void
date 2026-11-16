// LUMEN VOID — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
//
// The game: you keep the last lantern burning. The Hollow swarm is drawn to its
// light — anything that reaches the lantern feeds on it. Light is the only weapon:
// inside the lantern's glow enemies take full damage and your turrets can aim;
// in the dark they are shielded, faster, and your turrets go blind. Spend prisms
// on turrets, on rekindling the light, on mending the lantern, and on your ship.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 520,
  fireInterval: 0.13,
  bulletSpeed: 760,
  invulnerable: 2.0,
  maxLives: 3,
  /** Ship may fly between the HUD and the lantern shelf. */
  minY: 130,
  maxY: 600,
};

export const LIVES = 3;

/** The Last Lantern: the thing you defend. It sits on a shelf at the bottom centre. */
export const LANTERN = {
  x: 640,
  y: 618,
  radius: 26,
  /** Enemies that touch this ring strike the lantern and are destroyed. */
  strikeRadius: 52,
  maxHp: 100,
  /** The glow's radius: it shrinks as the dark closes in, and rekindling restores it. */
  lightRadius: 300,
  lightMin: 150,
  lightMax: 430,
  shrinkPerWave: 8,
  /** Rekindle: +radius for prisms. */
  rekindleRadius: 60,
  rekindleCost: 25,
  /** Mend: +lantern HP for prisms. */
  mendHp: 25,
  mendCost: 30,
};

/** Enemy kinds, their look, behaviour and worth. `lantern` is the damage dealt
 *  when one reaches the lantern and feeds on it. `prisms` is what it drops. */
export const ENEMY = {
  drifter: { radius: 22, hp: 1, speed: 120, score: 50, colour: '#ff2e88', lantern: 4, prisms: 1 },
  weaver: { radius: 18, hp: 2, speed: 150, score: 100, colour: '#ffb020', lantern: 5, prisms: 2 },
  stinger: { radius: 16, hp: 1, speed: 260, score: 150, colour: '#ff3b30', lantern: 5, prisms: 2 },
  shade: { radius: 17, hp: 1, speed: 300, score: 120, colour: '#b06bff', lantern: 4, prisms: 2, darkSpeed: 1.35 },
  bulwark: { radius: 30, hp: 6, speed: 70, score: 300, colour: '#8fa3d9', lantern: 10, prisms: 4 },
};

/** Turrets: the tower-defence half. Each has three levels; level 3 is its final
 *  form. Turrets only fire at enemies inside the lantern's light. */
export const TURRET = {
  pulse: {
    name: 'Pulse', key: '1', cost: 40, range: 230, damage: 1, fireInterval: 0.28,
    bulletSpeed: 640, colour: '#2ee6ff', desc: 'fast, close',
  },
  lance: {
    name: 'Lance', key: '2', cost: 80, range: 380, damage: 3, fireInterval: 0.9,
    bulletSpeed: 0, colour: '#ffd23e', desc: 'piercing beam',
  },
  nova: {
    name: 'Nova', key: '3', cost: 140, range: 300, damage: 5, fireInterval: 1.6,
    bulletSpeed: 420, colour: '#ff5df2', desc: 'splash mortar', splash: 90,
  },
};

/** Turret rules shared by all kinds. */
export const TURRET_RULES = {
  maxCount: 8,
  levels: 3,
  /** Upgrade cost, as a multiple of the base cost, per level gained. */
  upgradeCostMult: [0, 1, 1.5],
  /** Per level: damage, range and fire-rate multipliers. */
  damagePerLevel: 1.5,
  rangePerLevel: 1.15,
  intervalPerLevel: 0.85,
  /** Turrets may not be placed on the lantern, on another turret, or in the HUD. */
  minY: 140,
  maxY: 590,
  lanternClear: 78,
  turretClear: 46,
};

/** The 20 waves. `boss` names a boss kind (or null); `mut` names a mutator
 *  (or null). After wave 20 the Hollow Sun falls and the Endless Afterglow begins. */
export const WAVES = [
  { drifter: 8 },
  { drifter: 8, weaver: 4 },
  { drifter: 10, weaver: 6, stinger: 2 },
  { drifter: 12, weaver: 6, stinger: 4, shade: 2 },
  { drifter: 6, boss: 'warden' },
  { drifter: 10, weaver: 8, stinger: 6, shade: 4, mut: 'darksurge' },
  { drifter: 12, weaver: 8, stinger: 6, shade: 6, bulwark: 2 },
  { drifter: 14, weaver: 10, stinger: 8, shade: 6, bulwark: 2, mut: 'swarm' },
  { drifter: 14, weaver: 10, stinger: 8, shade: 8, bulwark: 4 },
  { drifter: 8, weaver: 4, boss: 'warden' },
  { drifter: 16, weaver: 12, stinger: 10, shade: 8, bulwark: 4, mut: 'armored' },
  { drifter: 16, weaver: 12, stinger: 10, shade: 10, bulwark: 6, mut: 'swift' },
  { drifter: 18, weaver: 12, stinger: 12, shade: 10, bulwark: 6 },
  { drifter: 18, weaver: 14, stinger: 12, shade: 12, bulwark: 8, mut: 'darksurge' },
  { drifter: 10, weaver: 6, stinger: 4, boss: 'warden' },
  { drifter: 20, weaver: 14, stinger: 14, shade: 12, bulwark: 8, mut: 'swarm' },
  { drifter: 20, weaver: 16, stinger: 14, shade: 14, bulwark: 10, mut: 'armored' },
  { drifter: 22, weaver: 16, stinger: 16, shade: 14, bulwark: 10, mut: 'swift' },
  { drifter: 22, weaver: 18, stinger: 16, shade: 16, bulwark: 12, mut: 'darksurge' },
  { drifter: 8, boss: 'hollowsun' },
];

export const WAVE = {
  /** Seconds of build time between waves. */
  buildSeconds: 8,
  /** Spawn pacing. */
  interval: 0.5,
  intervalPerWave: 0.02,
  minInterval: 0.2,
  speedPerWave: 0.04,
  clearBonus: 100,
  /** Prisms paid on a wave clear. */
  prismBonus: 10,
  prismBonusPerWave: 5,
  /** Boss waves count as sectors. */
  sectorEvery: 5,
  sectorBonus: 500,
};

/** Wave mutators: what each one does to the wave. */
export const MUTATORS = {
  darksurge: { label: 'DARK SURGE — the light shrinks', lightMult: 0.7 },
  swarm: { label: 'SWARM — twice the Hollow, thinner hides', countMult: 1.5, hpDelta: -1 },
  armored: { label: 'ARMORED — thick hides, slow march', hpDelta: 2, speedMult: 0.85 },
  swift: { label: 'SWIFT — the Hollow runs', speedMult: 1.4, scoreMult: 0.75 },
};

/** Bosses. Wardens guard waves 5, 10 and 15; the Hollow Sun is wave 20's
 *  three-phase final. `phaseHp` is where the Sun changes phase (fractions of max). */
export const BOSS = {
  warden: { radius: 46, hp: [60, 95, 140], speed: 46, score: 2000, colour: '#ff9a3d', prisms: 20, bulletSpeed: 260, burst: 8 },
  hollowsun: { radius: 62, hp: 200, speed: 34, score: 10000, colour: '#ff2e88', prisms: 40, bulletSpeed: 270, burst: 10, phaseHp: [0.66, 0.33] },
};

/** Prism orbs: the currency. Kills drop them; fly over them to bank them.
 *  Every 5 banked prisms charge one Nova (max 3). */
export const PRISM = {
  radius: 9,
  fallSpeed: 120,
  magnetRadius: 150,
  magnetSpeed: 440,
  perNova: 5,
  maxNova: 3,
  /** Prisms the keeper starts with: enough for one Pulse turret and a little. */
  start: 60,
};

/** Player upgrades, bought with prisms. */
export const UPGRADE = {
  fire: { key: 'f', name: 'Fire rate', cost: 50, max: 3, step: 0.85 },
  hull: { key: 'h', name: 'Hull +1 ship', cost: 60, max: 2 },
};

/** Kill streaks within this many seconds raise the score multiplier. */
export const COMBO = { window: 2.5, max: 5 };

export const NOVA = {
  /** Points each enemy cleared by a Nova is worth, as a share of its score. */
  share: 0.5,
};

export const BULLET = { radius: 5 };

/** Plasma the swarm shoots back: the answer to camping in one spot. */
export const ENEMY_BULLET = {
  radius: 6,
  speed: 300,
  max: 32,
  /** Shots only come from the upper half, aimed at the ship with this error. */
  maxY: 420,
  aimError: 46,
};

/** Damage a bullet does to an enemy in the dark, as a share of full damage. */
export const DARK_DAMAGE = 0.25;

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
