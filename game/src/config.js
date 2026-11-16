// NEON VOID — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

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
};

export const LIVES = 3;

/** Enemy kinds, their look, behaviour and worth. */
export const ENEMY = {
  drifter: { radius: 22, hp: 1, speed: 120, score: 50, colour: '#ff2e88' },
  weaver: { radius: 18, hp: 2, speed: 150, score: 100, colour: '#ffb020' },
  stinger: { radius: 16, hp: 1, speed: 260, score: 150, colour: '#ff3b30' },
};

/** Waves: how many enemies, how fast they arrive, how fast they move. */
export const WAVE = {
  baseCount: 10,
  perWave: 5,
  interval: 0.5,
  intervalPerWave: 0.04,
  minInterval: 0.22,
  speedPerWave: 0.055,
  clearBonus: 100,
  sectorEvery: 5,
  sectorBonus: 500,
};

export const CORE = {
  radius: 9,
  fallSpeed: 140,
  score: 25,
  magnetRadius: 140,
  magnetSpeed: 420,
  /** Cores banked to earn one Nova charge. */
  perNova: 5,
  maxNova: 3,
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
  max: 24,
  /** Shots only come from the upper half, aimed at the ship with this error. */
  maxY: 420,
  aimError: 46,
};

/** Particle and floater pool sizes; allocated once, at boot. */
export const POOL = { bullets: 96, enemies: 48, cores: 32, particles: 320, floaters: 24, stars: 110 };

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
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
export const FONT_MONO = '"Cascadia Code", "SF Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-void.best';
