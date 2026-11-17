// LUMEN VOID's simulation: the keeper's ship, its bullets, five kinds of Hollow,
// the Last Lantern and its light, three kinds of turret, prism orbs, bosses, waves
// with mutators, and the Endless Afterglow. Everything advances in fixed steps;
// all randomness comes from the seeded generator, so a staged screenshot is
// repeatable.
//
// The loop: the Hollow is drawn to the lantern. Anything that reaches it feeds
// on it. Inside the lantern's glow enemies take full damage and turrets can aim;
// in the dark they are shielded, faster, and turrets go blind. Kills drop prism
// orbs — spend prisms on turrets, on rekindling the light, on mending the lantern
// and on the ship. Survive 20 waves and the Hollow Sun falls; then the Afterglow.

import {
  BOSS, BULLET, DARK_DAMAGE, ENEMY, ENEMY_BULLET, FIELD, LANTERN,
  LIVES, MUTATORS, NOVA, PLAYER, POOL, PRISM, TURRET, TURRET_RULES,
  UPGRADE, WAVE, WAVES,
} from './config.js';
import { createStreak, streakOnHit, streakOnKill, streakStep } from './combo.js';
import { firePrism } from './prism.js';
import { initWraith, stepWraith, wraithHaunting, wraithIsSolid, wraithSpeedMult, syncWraithPhases } from './wraith.js';
import { afterglowMutators, mutatorBannerSub, prismDropFor } from './mutators.js';
import { createRadiance, radianceDamageMult, radianceGlimmerArmed, radianceLightBonus, radianceOnKill, radianceSpendGlimmer, stepRadiance } from './radiance.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_SECTOR = 8;
export const EVENT_NOVA = 16;
export const EVENT_WIN = 32;
export const EVENT_BOSS = 64;
export const EVENT_LANTERN_HIT = 128;

const TAU = Math.PI * 2;
const TOTAL_WAVES = 20;

function makeStars(random) {
  const stars = [];
  for (let i = 0; i < POOL.stars; i += 1) {
    const layer = i % 3;
    stars.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      layer,
      size: layer === 2 ? 2.2 : layer === 1 ? 1.6 : 1,
      speed: 12 + layer * 22,
      phase: random() * TAU,
    });
  }
  return stars;
}

function freshPlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height - 110,
    radius: PLAYER.radius,
    lives: LIVES,
    invuln: 0,
    fireTimer: 0,
    nova: 2,
    coresBanked: 0,
    thrust: 0,
    fireLevel: 0,
    hullLevel: 0,
  };
}

function freshLantern() {
  return {
    x: LANTERN.x,
    y: LANTERN.y,
    hp: LANTERN.maxHp,
    maxHp: LANTERN.maxHp,
    radius: LANTERN.lightRadius,
    flicker: 0,
  };
}

/** The wave table entry for a wave number (1-based). Past 20, the Afterglow scales. */
export function waveDef(wave) {
  if (wave <= TOTAL_WAVES) return WAVES[wave - 1];
  const n = wave - TOTAL_WAVES;
  const scale = 1 + 0.12 * n;
  const muts = afterglowMutators();
  const def = {
    drifter: Math.round(20 * scale),
    weaver: Math.round(16 * scale),
    stinger: Math.round(14 * scale),
    shade: Math.round(14 * scale),
    bulwark: Math.round(10 * scale),
    wraith: Math.round(4 * scale),
    mut: muts[(wave - 1) % muts.length],
  };
  if (wave % 5 === 0) def.boss = 'warden';
  return def;
}

export function createWorld(random) {
  const state = {
    time: 0,
    player: freshPlayer(),
    lantern: freshLantern(),
    bullets: [],
    turretBullets: [],
    beams: [],
    enemies: [],
    enemyBullets: [],
    cores: [],
    particles: [],
    floaters: [],
    stars: makeStars(random),
    turrets: [],
    selectedTurret: null,
    buildChoice: null,
    score: 0,
    prisms: PRISM.start,
    prismsCollected: 0,
    wave: 1,
    waveSpawned: 0,
    waveTotal: 0,
    spawnQueue: [],
    spawnTimer: 0.6,
    waveState: 'build',
    waveTimer: WAVE.buildSeconds,
    mutator: null,
    boss: null,
    bossPhase: 0,
    /** The kill chain: consecutive kills without a hit, its window and
     *  its multiplier. The chain's rules live in combo.js. */
    streak: createStreak(),
    shake: 0,
    flash: 0,
    banner: null,
    kills: 0,
    /** Seconds until the next free Nova charge (the Nova slowly recharges
     *  on its own, so the keeper always has a panic button coming). */
    novaTimer: 0,
    won: false,
    endless: false,
    turretsBuilt: 0,
    rekindles: 0,
    mends: 0,
    /** The Radiance meter: kills feed it, a full meter breaks into a
     *  burst of brighter light and harder hits. */
    radiance: createRadiance(),
  };

  function addParticles(x, y, colour, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= POOL.particles) return;
      const angle = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 0.4 + random() * 0.5,
        max: 0.9,
        colour,
        size: 1.5 + random() * 2.5,
      });
    }
  }

  function addFloater(x, y, text, colour) {
    if (state.floaters.length >= POOL.floaters) state.floaters.shift();
    state.floaters.push({ x, y, text, colour, life: 0.9, max: 0.9 });
  }

  function setBanner(text, sub, seconds) {
    state.banner = { text, sub, timer: seconds, max: seconds };
  }

  /** The lantern's effective glow radius this wave: a mutator may shrink
   *  it (Dark Surge, Blood Moon), and a Radiant Burst widens it again. */
  function lightRadius() {
    const base = state.lantern.radius;
    const mut = state.mutator ? MUTATORS[state.mutator] : null;
    const shrunk = mut && mut.lightMult ? base * mut.lightMult : base;
    return shrunk + radianceLightBonus(state.radiance);
  }

  function inLight(x, y) {
    const dx = x - state.lantern.x;
    const dy = y - state.lantern.y;
    return dx * dx + dy * dy < lightRadius() * lightRadius();
  }

  /** Bosses are radiant: they cannot hide in the dark, so they always count as lit. */
  function isLit(enemy) {
    return enemy.isBoss || inLight(enemy.x, enemy.y);
  }

  // Build the spawn queue for a wave: one entry per enemy in the wave
  // table, with the mutator's count multiplier applied, then shuffled so
  // the kinds arrive mixed instead of in blocks.
  function buildSpawnQueue(wave) {
    const def = waveDef(wave);
    const queue = [];
    const mut = def.mut ? MUTATORS[def.mut] : null;
    const kinds = ['drifter', 'weaver', 'stinger', 'shade', 'bulwark', 'wraith'];
    for (const kind of kinds) {
      let count = def[kind] || 0;
      if (mut && mut.countMult) count = Math.round(count * mut.countMult);
      for (let i = 0; i < count; i += 1) queue.push(kind);
    }
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  // Which mutator (if any) a wave carries.
  function mutatorFor(wave) {
    return waveDef(wave).mut || null;
  }

  // Bend a fresh enemy to the wave's mutator: tougher, faster, or worth
  // more, as the mutator says. Health never drops below 1. A mutator that
  // pays in prisms stamps the rate on the enemy, so the kill pays it.
  function applyMutatorTo(enemy) {
    const mut = state.mutator ? MUTATORS[state.mutator] : null;
    if (!mut) return;
    if (mut.hpDelta) enemy.hp = Math.max(1, enemy.hp + mut.hpDelta);
    if (mut.speedMult) enemy.speed *= mut.speedMult;
    if (mut.scoreMult) enemy.score = Math.round(enemy.score * mut.scoreMult);
    if (mut.prismMult) enemy.prismMult = mut.prismMult;
  }

  // Bring one enemy into the field at the top, at a random x, drifting down
  // with a little random sway and spin. Enemies get faster as the waves go
  // on. Each kind shoots back on its own interval — the return fire is what
  // kills the keeper most often, so the intervals are generous.
  function spawnEnemy(kind) {
    if (state.enemies.length >= POOL.enemies) return;
    const def = ENEMY[kind];
    const speedScale = 1 + WAVE.speedPerWave * (state.wave - 1);
    const enemy = {
      kind,
      x: 40 + random() * (FIELD.width - 80),
      y: -30 - random() * 60,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      speed: def.speed * speedScale * (0.9 + random() * 0.2),
      score: def.score,
      colour: def.colour,
      phase: random() * TAU,
      sway: 30 + random() * 50,
      rotation: random() * TAU,
      spin: (random() - 0.5) * 2.4,
      fireTimer: 0.5 + random() * 1.0,
      shotInterval: kind === 'drifter' ? 6.0 : kind === 'weaver' ? 4.0 : kind === 'stinger' ? 3.5 : kind === 'shade' ? 4.5 : 7.0,
      active: true,
      isBoss: false,
    };
    applyMutatorTo(enemy);
    enemy.maxHp = enemy.hp;
    state.enemies.push(enemy);
    if (kind === 'wraith') {
      // A Wraith arrives with its phase; three of them on the field fall
      // into step and hunt as a haunting.
      initWraith(enemy, random);
      if (wraithHaunting(state.enemies)) syncWraithPhases(state.enemies);
    }
    state.waveSpawned += 1;
  }

  // Bring a boss in at the top centre. The Warden grows tougher each time
  // it returns (waves 5, 10, 15 pick the next of its three health pools);
  // the Hollow Sun has a single pool. The boss becomes the state's boss so
  // the HUD and the phase logic can find it.
  function spawnBoss(kind, wave) {
    const def = BOSS[kind];
    const bossIndex = kind === 'warden' ? (wave <= 5 ? 0 : wave <= 10 ? 1 : 2) : 0;
    const hp = kind === 'warden' ? def.hp[bossIndex] : def.hp;
    const boss = {
      kind,
      x: FIELD.width / 2,
      y: 170,
      hp,
      maxHp: hp,
      radius: def.radius,
      speed: def.speed,
      score: def.score,
      colour: def.colour,
      phase: 0,
      rotation: 0,
      spin: 0.4,
      fireTimer: 2.0,
      shotInterval: 2.6,
      active: true,
      isBoss: true,
      driftDir: 1,
      attackTimer: 0,
    };
    state.enemies.push(boss);
    state.boss = boss;
    state.bossPhase = 0;
    return boss;
  }

  // Scatter prism pickups around a point (the pool caps how many can exist
  // at once). They drift down and the keeper banks them by flying over them.
  function dropPrisms(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      if (state.cores.length >= POOL.cores) return;
      state.cores.push({
        x: x + (random() - 0.5) * 36,
        y: y + (random() - 0.5) * 20,
        vy: PRISM.fallSpeed,
        radius: PRISM.radius,
        active: true,
        phase: random() * TAU,
      });
    }
  }

  // Add points, scaled by the current streak multiplier, and float the gain.
  function award(base, x, y) {
    const points = Math.round(base * state.streak.multiplier);
    state.score += points;
    addFloater(x, y, `+${points}`, '#eaf6ff');
    return points;
  }

  // Count a kill toward the streak: the chain grows, its window
  // refreshes, and its multiplier climbs to its tier. Returns what the
  // kill earned at the chain's milestones, so the caller can pay it.
  function registerKill() {
    state.kills += 1;
    return streakOnKill(state.streak);
  }

  // Pay a streak's milestones: bonus prisms bank straight away, and a
  // Nova charge joins the ship's stock (up to the max). A floater says
  // what the chain earned, so the keeper can see the streak paying.
  function payStreak(streak, enemy) {
    if (streak.prisms > 0) {
      state.prisms += streak.prisms;
      addFloater(enemy.x, enemy.y - 30, `STREAK +${streak.prisms} ◈`, '#ffd23e');
    }
    if (streak.nova > 0 && state.player.nova < PRISM.maxNova) {
      state.player.nova += 1;
      addFloater(enemy.x, enemy.y - 48, 'STREAK NOVA +1', '#ff5df2');
    }
  }

  // Feed a kill to the Radiance meter. When the meter breaks into a burst
  // the light drops its prisms and the burst is floated, so the keeper
  // knows the next eight seconds hit three-quarters as hard again. A floater, not a
  // banner, so a boss kill keeps its own banner.
  function feedRadiance(enemy) {
    const result = radianceOnKill(state.radiance, enemy);
    if (!result.burst) return;
    state.prisms += result.prisms;
    addFloater(enemy.x, enemy.y - 30, `RADIANT BURST  +${result.prisms} ◈`, '#ffe9a3');
    addParticles(state.lantern.x, state.lantern.y, '#ffe9a3', 30, 320);
    state.flash = Math.max(state.flash, 0.5);
  }

  // Remove an enemy from the field. A boss pays out its prisms and score,
  // banners its fall, and shakes the screen. A Nova kill pays half score
  // and no combo; a normal kill feeds the combo and drops prisms.
  function killEnemy(enemy, byNova) {
    enemy.active = false;
    addParticles(enemy.x, enemy.y, enemy.colour, 14, 260);
    addParticles(enemy.x, enemy.y, '#ffffff', 4, 160);
    if (enemy.isBoss) {
      state.boss = null;
      dropPrisms(enemy.x, enemy.y, BOSS[enemy.kind].prisms);
      award(enemy.score, enemy.x, enemy.y);
      setBanner(enemy.kind === 'hollowsun' ? 'THE HOLLOW SUN FALLS' : 'WARDEN DOWN', `+${enemy.score}  •  +${BOSS[enemy.kind].prisms} PRISMS`, 2.4);
      addParticles(enemy.x, enemy.y, '#ffd23e', 40, 420);
      state.shake = 18;
      state.flash = 0.7;
      feedRadiance(enemy);
      return;
    }
    if (byNova) {
      award(Math.round(enemy.score * NOVA.share), enemy.x, enemy.y);
    } else {
      const streak = registerKill();
      award(enemy.score, enemy.x, enemy.y);
      dropPrisms(enemy.x, enemy.y, prismDropFor(enemy, ENEMY[enemy.kind].prisms));
      payStreak(streak, enemy);
      if (radianceGlimmerArmed(state.radiance) && radianceSpendGlimmer(state.radiance)) {
        state.prisms += 1;
        addFloater(enemy.x, enemy.y - 30, 'GLIMMER +1 ◈', '#ffe9a3');
      }
      feedRadiance(enemy);
    }
  }

  // Hurt an enemy. Light is the only real weapon: inside the light an
  // enemy takes the full hit, but out in the dark it is shielded and takes
  // only a fraction. A shielded hit that does not kill floats a SHIELDED
  // note so the keeper can see why its shots are weak. A ghost-phase
  // Wraith cannot be hurt at all — the hit passes through it, and a
  // PHASED note says why. A Radiant Burst makes every hit land half as
  // hard again, lit or dark.
  function damageEnemy(enemy, amount, x, y) {
    if (enemy.kind === 'wraith' && !wraithIsSolid(enemy)) {
      addFloater(x, y - 14, 'PHASED', '#c9f2ff');
      return;
    }
    const lit = isLit(enemy);
    const dealt = (lit ? amount : amount * DARK_DAMAGE) * radianceDamageMult(state.radiance);
    enemy.hp -= dealt;
    addParticles(x, y, enemy.colour, 2, 110);
    if (!lit && enemy.hp > 0) {
      addFloater(x, y - 14, 'SHIELDED', '#8fa3d9');
    }
    if (enemy.hp <= 0) killEnemy(enemy, false);
  }

  // Open a wave: set its mutator, build the shuffled spawn queue, and
  // banner it. A boss wave brings the boss in at once and names it; a
  // normal wave just announces the Hollow is coming.
  function startWave() {
    const def = waveDef(state.wave);
    state.mutator = def.mut || null;
    state.waveState = 'fighting';
    state.spawnQueue = buildSpawnQueue(state.wave);
    state.waveTotal = state.spawnQueue.length + (def.boss ? 1 : 0);
    state.waveSpawned = 0;
    state.spawnTimer = 0.7;
    if (def.boss) {
      spawnBoss(def.boss, state.wave);
      const name = def.boss === 'hollowsun' ? 'THE HOLLOW SUN' : 'WARDEN';
      const sub = def.boss === 'hollowsun'
        ? 'THREE PHASES  •  HOLD THE LIGHT'
        : 'A WARDEN OF THE HOLLOW';
      setBanner(`WAVE ${state.wave} — ${name}`, state.mutator ? `${sub}  •  ${mutatorBannerSub(state.mutator)}` : sub, 2.4);
    } else {
      const sub = state.mutator ? mutatorBannerSub(state.mutator) : 'THE HOLLOW COMES FOR THE LIGHT';
      setBanner(`WAVE ${state.wave}`, sub, 1.8);
    }
  }

  // Close a wave: pay the clear bonus (score and prisms), and every few
  // waves pay a sector bonus too. Clearing wave 20 wins the game — unless
  // endless mode is on, in which case the waves keep coming. Otherwise the
  // next wave opens with a build phase.
  function clearWave() {
    const bonus = WAVE.clearBonus * state.wave;
    const prisms = WAVE.prismBonus + WAVE.prismBonusPerWave * state.wave;
    state.score += bonus;
    state.prisms += prisms;
    let events = EVENT_WAVE_CLEAR;
    if (state.wave % WAVE.sectorEvery === 0) {
      state.score += WAVE.sectorBonus;
      events |= EVENT_SECTOR;
      setBanner('SECTOR CLEAR', `SCORE +${bonus + WAVE.sectorBonus}  •  +${prisms} PRISMS`, 2.4);
    } else {
      setBanner('WAVE CLEAR', `SCORE +${bonus}  •  +${prisms} PRISMS`, 2.2);
    }
    if (state.wave >= TOTAL_WAVES && !state.endless) {
      state.won = true;
      events |= EVENT_WIN;
      setBanner('THE LIGHT ENDURES', 'WAVE 20 CLEAR  •  THE HOLLOW SUN HAS FALLEN', 3);
      state.waveState = 'won';
      return events;
    }
    state.wave += 1;
    state.waveState = 'build';
    state.waveTimer = WAVE.buildSeconds;
    return events;
  }

  // An enemy reaches the lantern and feeds on it: the light loses health
  // (how much depends on the kind), the lantern flickers, and the feeder is
  // consumed. If the light hits zero, the game is over.
  function lanternStrike(enemy) {
    const def = ENEMY[enemy.kind] || { lantern: 5 };
    state.lantern.hp -= def.lantern;
    state.lantern.flicker = 1;
    state.shake = Math.max(state.shake, 10);
    addParticles(state.lantern.x, state.lantern.y - 20, '#ff3b5c', 16, 260);
    addFloater(state.lantern.x, state.lantern.y - 60, `-${def.lantern} LIGHT`, '#ff3b5c');
    enemy.active = false;
    addParticles(enemy.x, enemy.y, enemy.colour, 10, 220);
    if (state.lantern.hp <= 0) {
      state.lantern.hp = 0;
      return EVENT_OVER;
    }
    return EVENT_LANTERN_HIT;
  }

  // The keeper is hit: lose a life, gain a grace period, and lose the
  // streak. If that was the last life, the game is over.
  function hitPlayer() {
    const player = state.player;
    player.lives -= 1;
    player.invuln = PLAYER.invulnerable;
    streakOnHit(state.streak);
    state.shake = 14;
    state.flash = 0.5;
    addParticles(player.x, player.y, '#2ee6ff', 26, 340);
    addParticles(player.x, player.y, '#ff3b5c', 12, 220);
    return player.lives <= 0 ? EVENT_OVER : EVENT_HIT;
  }

  // ---- turrets ----
  // A turret's effective numbers at a given level: each level multiplies the
  // base range, damage and fire interval by the per-level factors, so a
  // max-level turret is a genuinely different weapon from a level-1 one.
  function turretLevelStats(kind, level) {
    const def = TURRET[kind];
    const steps = level - 1;
    return {
      range: def.range * Math.pow(TURRET_RULES.rangePerLevel, steps),
      damage: def.damage * Math.pow(TURRET_RULES.damagePerLevel, steps),
      interval: def.fireInterval * Math.pow(TURRET_RULES.intervalPerLevel, steps),
    };
  }

  // Build a turret. The spot must be inside the build band, clear of the
  // lantern and clear of every other turret, and the keeper must afford it.
  // Returns true only when the turret actually goes up.
  function placeTurret(kind, x, y) {
    const def = TURRET[kind];
    if (!def) return false;
    if (state.turrets.length >= TURRET_RULES.maxCount) return false;
    if (state.prisms < def.cost) return false;
    if (y < TURRET_RULES.minY || y > TURRET_RULES.maxY) return false;
    const toLanternX = x - state.lantern.x;
    const toLanternY = y - state.lantern.y;
    const lanternClearSq = TURRET_RULES.lanternClear * TURRET_RULES.lanternClear;
    if (toLanternX * toLanternX + toLanternY * toLanternY < lanternClearSq) return false;
    const turretClearSq = TURRET_RULES.turretClear * TURRET_RULES.turretClear;
    for (const other of state.turrets) {
      const dx = x - other.x;
      const dy = y - other.y;
      if (dx * dx + dy * dy < turretClearSq) return false;
    }
    state.prisms -= def.cost;
    state.turrets.push({
      kind, x, y, level: 1, fireTimer: 0.2, angle: -Math.PI / 2, target: null,
    });
    state.turretsBuilt += 1;
    addParticles(x, y, def.colour, 14, 200);
    addFloater(x, y - 24, `${def.name.toUpperCase()} UP`, def.colour);
    return true;
  }

  // Pick the turret nearest a point (within 34 px) as the selected one, so
  // the next upgrade lands on it. Returns the turret, or null if none is
  // close enough.
  function selectTurretAt(x, y) {
    let best = null;
    let bestDistSq = 34 * 34;
    for (const t of state.turrets) {
      const dx = x - t.x;
      const dy = y - t.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = t;
      }
    }
    state.selectedTurret = best;
    return best;
  }

  // Raise the selected turret one level. The price is the base cost times
  // the multiplier for its current level, so each level costs more than the
  // last. At the top level the turret reaches its final form.
  function upgradeSelected() {
    const t = state.selectedTurret;
    if (!t || t.level >= TURRET_RULES.levels) return false;
    const cost = Math.round(TURRET[t.kind].cost * TURRET_RULES.upgradeCostMult[t.level]);
    if (state.prisms < cost) return false;
    state.prisms -= cost;
    t.level += 1;
    addParticles(t.x, t.y, TURRET[t.kind].colour, 18, 240);
    const label = t.level >= TURRET_RULES.levels ? 'FINAL FORM' : `LEVEL ${t.level}`;
    addFloater(t.x, t.y - 26, label, '#ffd23e');
    return true;
  }

  function rekindle() {
    if (state.prisms < LANTERN.rekindleCost) return false;
    if (state.lantern.radius >= LANTERN.lightMax) return false;
    state.prisms -= LANTERN.rekindleCost;
    state.lantern.radius = Math.min(LANTERN.lightMax, state.lantern.radius + LANTERN.rekindleRadius);
    state.rekindles += 1;
    addParticles(state.lantern.x, state.lantern.y, '#ffd23e', 30, 300);
    addFloater(state.lantern.x, state.lantern.y - 70, 'REKINDLED', '#ffd23e');
    return true;
  }

  function mend() {
    if (state.prisms < LANTERN.mendCost) return false;
    if (state.lantern.hp >= state.lantern.maxHp) return false;
    state.prisms -= LANTERN.mendCost;
    state.lantern.hp = Math.min(state.lantern.maxHp, state.lantern.hp + LANTERN.mendHp);
    state.mends += 1;
    addParticles(state.lantern.x, state.lantern.y, '#8dff5a', 20, 220);
    addFloater(state.lantern.x, state.lantern.y - 70, `+${LANTERN.mendHp} LIGHT`, '#8dff5a');
    return true;
  }

  function upgradeFire() {
    const p = state.player;
    if (p.fireLevel >= UPGRADE.fire.max) return false;
    if (state.prisms < UPGRADE.fire.cost) return false;
    state.prisms -= UPGRADE.fire.cost;
    p.fireLevel += 1;
    addFloater(p.x, p.y - 30, 'FIRE RATE UP', '#2ee6ff');
    return true;
  }

  function upgradeHull() {
    const p = state.player;
    if (p.hullLevel >= UPGRADE.hull.max) return false;
    if (state.prisms < UPGRADE.hull.cost) return false;
    state.prisms -= UPGRADE.hull.cost;
    p.hullLevel += 1;
    p.lives = Math.min(PLAYER.maxLives, p.lives + 1);
    addFloater(p.x, p.y - 30, '+1 SHIP', '#2ee6ff');
    return true;
  }

  // Move and fire the keeper's ship for one step. The ship stays inside the
  // field (and above its floor), leaves a thrust trail when it moves, and
  // fires a three-shot fan straight up — faster as its fire level grows.
  // Spending a Nova is the panic button: it flashes the screen, kills every
  // ordinary enemy on the field, wounds a boss by 50, and clears every
  // plasma bolt in the air.
  function stepPlayer(dt, move, firing, useNova, attract) {
    const player = state.player;
    if (player.invuln > 0) player.invuln -= dt;
    player.x = Math.min(FIELD.width - 24, Math.max(24, player.x + move.x * PLAYER.speed * dt));
    player.y = Math.min(FIELD.height - 24, Math.max(PLAYER.minY, player.y + move.y * PLAYER.speed * dt));
    player.thrust = Math.abs(move.x) + Math.abs(move.y) > 0.1 ? 1 : 0;
    if (player.thrust) {
      addParticles(player.x, player.y + 18, '#2ee6ff', 1, 60);
    }
    const interval = PLAYER.fireInterval * Math.pow(UPGRADE.fire.step, player.fireLevel);
    player.fireTimer -= dt;
    if (firing && player.fireTimer <= 0 && state.bullets.length < POOL.bullets) {
      player.fireTimer = interval;
      state.bullets.push({
        x: player.x, y: player.y - 20, vx: 0, vy: -PLAYER.bulletSpeed, radius: BULLET.radius, active: true,
      });
      state.bullets.push({
        x: player.x - 10, y: player.y - 12, vx: -40, vy: -PLAYER.bulletSpeed * 0.96, radius: BULLET.radius - 1, active: true,
      });
      state.bullets.push({
        x: player.x + 10, y: player.y - 12, vx: 40, vy: -PLAYER.bulletSpeed * 0.96, radius: BULLET.radius - 1, active: true,
      });
    }
    if (useNova && player.nova > 0) {
      player.nova -= 1;
      state.flash = 1;
      state.shake = 18;
      addParticles(player.x, player.y, '#ff5df2', 40, 520);
      for (const enemy of state.enemies) {
        if (!enemy.active) continue;
        if (enemy.isBoss) {
          enemy.hp -= 50;
          if (enemy.hp <= 0) killEnemy(enemy, false);
        } else {
          killEnemy(enemy, true);
        }
      }
      for (const bullet of state.enemyBullets) {
        if (bullet.active) {
          bullet.active = false;
          addParticles(bullet.x, bullet.y, '#ff5df2', 3, 120);
        }
      }
      return EVENT_NOVA;
    }
    return 0;
  }

  // What a turret shoots at: a boss first (the biggest threat, if a lit
  // one is in range), otherwise the nearest lit enemy in range. Turrets
  // can only see what the light touches — anything out in the dark is
  // invisible to them, which is why the light radius matters so much. A
  // ghost-phase Wraith is invisible too: it cannot be aimed at until it
  // turns solid again.
  function nearestLitTarget(turret, stats) {
    const rangeSq = stats.range * stats.range;
    let boss = null;
    let bossDistSq = rangeSq;
    for (const e of state.enemies) {
      if (!e.active || !e.isBoss || !isLit(e)) continue;
      const dx = e.x - turret.x;
      const dy = e.y - turret.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bossDistSq) {
        bossDistSq = distSq;
        boss = e;
      }
    }
    if (boss) return boss;
    let best = null;
    let bestDistSq = rangeSq;
    for (const e of state.enemies) {
      if (!e.active || !isLit(e)) continue;
      if (e.kind === 'wraith' && !wraithIsSolid(e)) continue;
      const dx = e.x - turret.x;
      const dy = e.y - turret.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = e;
      }
    }
    return best;
  }

  // Run every turret for one step: aim at its target (or sweep slowly when
  // it has none), then fire when the timer is up. Each kind fires
  // differently — the lance cuts a piercing beam through everything lit
  // along its line, the nova lobs a splash shell, and the pulse sprays a
  // three-shot fan.
  function stepTurrets(dt) {
    for (const t of state.turrets) {
      const stats = turretLevelStats(t.kind, t.level);
      const target = nearestLitTarget(t, stats);
      t.target = target;
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      } else {
        t.angle += dt * 0.6;
      }
      t.fireTimer -= dt;
      if (!target || t.fireTimer > 0) continue;
      t.fireTimer = stats.interval;
      const def = TURRET[t.kind];
      if (t.kind === 'prism') {
        // The Prism splits its light: one shot, a chain of lit enemies.
        firePrism(state, t, target, stats, {
          damageEnemy,
          isLit,
          spark: addParticles,
        });
      } else if (t.kind === 'lance') {
        const dx = target.x - t.x;
        const dy = target.y - t.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const reach = Math.min(len, stats.range);
        state.beams.push({ x: t.x, y: t.y, nx, ny, len: reach, life: 0.14, max: 0.14, colour: def.colour });
        for (const e of state.enemies) {
          if (!e.active || !isLit(e)) continue;
          const ex = e.x - t.x;
          const ey = e.y - t.y;
          const along = ex * nx + ey * ny;
          if (along < 0 || along > reach + e.radius) continue;
          const perp = Math.abs(ex * ny - ey * nx);
          if (perp < e.radius + 14) damageEnemy(e, stats.damage, e.x, e.y);
        }
      } else if (t.kind === 'nova') {
        const dist = Math.hypot(target.x - t.x, target.y - t.y) || 1;
        state.turretBullets.push({
          x: t.x, y: t.y - 10,
          vx: ((target.x - t.x) / dist) * def.bulletSpeed,
          vy: ((target.y - t.y) / dist) * def.bulletSpeed,
          radius: 7, active: true, kind: 'nova', damage: stats.damage, splash: TURRET.nova.splash,
        });
      } else {
        const base = Math.atan2(target.y - t.y, target.x - t.x);
        for (let i = -1; i <= 1; i += 1) {
          const a = base + i * 0.12;
          state.turretBullets.push({
            x: t.x + Math.cos(a) * 16, y: t.y + Math.sin(a) * 16,
            vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
            radius: 4, active: true, kind: 'pulse', damage: stats.damage, splash: 0,
          });
        }
      }
    }
  }

  // Move every turret shot for one step and resolve its hits. A shot that
  // leaves the field dies. A nova shell bursts on impact, damaging
  // everything inside its splash radius; any other shot just hurts the one
  // enemy it touches. Spent shots are swept out of the list.
  function stepTurretBullets(dt) {
    for (const b of state.turretBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.y > FIELD.height + 20 || b.x < -20 || b.x > FIELD.width + 20) {
        b.active = false;
        continue;
      }
      for (const e of state.enemies) {
        if (!e.active) continue;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const hitRadius = b.radius + e.radius;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          b.active = false;
          if (b.kind === 'nova' && b.splash > 0) {
            addParticles(b.x, b.y, '#ff5df2', 16, 280);
            for (const other of state.enemies) {
              if (!other.active) continue;
              const ox = other.x - b.x;
              const oy = other.y - b.y;
              if (ox * ox + oy * oy < b.splash * b.splash) damageEnemy(other, b.damage, other.x, other.y);
            }
          } else {
            damageEnemy(e, b.damage, b.x, b.y);
          }
          break;
        }
      }
    }
    state.turretBullets = state.turretBullets.filter((b) => b.active);
  }

  // A boss's attack. The Warden fires one pattern; the Hollow Sun has
  // three phases, driven by its remaining health — it cracks into a
  // spiral of fire, then burns faster as it dies, and each phase change
  // banners the shift, shakes the screen, and calls in four shades.
  // Phase 1 is a rotating spiral ring; the other phases are a radial burst
  // plus a three-shot spread aimed at the ship.
  function bossShoot(boss, dt) {
    const def = BOSS[boss.kind];
    boss.fireTimer -= dt;
    if (boss.fireTimer > 0) return;
    const phase = boss.kind === 'hollowsun'
      ? (boss.hp > boss.maxHp * def.phaseHp[0] ? 0 : boss.hp > boss.maxHp * def.phaseHp[1] ? 1 : 2)
      : 0;
    if (boss.kind === 'hollowsun' && phase !== state.bossPhase) {
      state.bossPhase = phase;
      boss.colour = phase === 1 ? '#ff9a3d' : '#ff3b5c';
      setBanner(phase === 1 ? 'THE SUN CRACKS' : 'THE SUN IS DYING', phase === 1 ? 'PHASE II — SPIRAL FIRE' : 'PHASE III — THE LAST BURN', 2);
      state.shake = 16;
      state.flash = 0.6;
      for (let i = 0; i < 4; i += 1) spawnEnemy('shade');
    }
    boss.fireTimer = boss.shotInterval * (phase === 2 ? 0.6 : phase === 1 ? 0.8 : 1);
    const count = def.burst + phase * 4;
    const player = state.player;
    if (phase === 1) {
      const base = boss.phase * 0.7;
      for (let i = 0; i < count; i += 1) {
        const a = base + (i / count) * TAU;
        state.enemyBullets.push({
          x: boss.x, y: boss.y + boss.radius,
          vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
          radius: ENEMY_BULLET.radius, active: true,
        });
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * TAU + boss.phase * 0.3;
        state.enemyBullets.push({
          x: boss.x, y: boss.y + boss.radius,
          vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
          radius: ENEMY_BULLET.radius, active: true,
        });
      }
      for (let i = -1; i <= 1; i += 1) {
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        const len = Math.hypot(dx, dy) || 1;
        const spread = i * 0.22;
        const ca = Math.cos(spread);
        const sa = Math.sin(spread);
        state.enemyBullets.push({
          x: boss.x, y: boss.y + boss.radius,
          vx: ((dx / len) * ca - (dy / len) * sa) * def.bulletSpeed * 1.15,
          vy: ((dx / len) * sa + (dy / len) * ca) * def.bulletSpeed * 1.15,
          radius: ENEMY_BULLET.radius, active: true,
        });
      }
    }
  }

  // Move every enemy for one step. A boss drifts side to side across the
  // top and shoots. Everything else seeks the lantern, weaving as it comes
  // — faster out in the dark (shades fastest of all) — and a stinger also
  // chases the ship sideways. Any enemy in the upper field shoots back at
  // the ship, with a wide aim error, on its own interval.
  function stepEnemies(dt, attract) {
    const player = state.player;
    const lx = state.lantern.x;
    const ly = state.lantern.y;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      enemy.rotation += enemy.spin * dt;
      enemy.phase += dt * 2;
      if (enemy.kind === 'wraith') {
        // A Wraith's phase turns on its own clock, and it weaves as it goes.
        stepWraith(enemy, dt);
      }
      if (enemy.isBoss) {
        enemy.driftDir = enemy.x > FIELD.width - 140 ? -1 : enemy.x < 140 ? 1 : enemy.driftDir;
        enemy.x += enemy.driftDir * enemy.speed * dt;
        enemy.y = 170 + Math.sin(enemy.phase * 0.5) * 26;
        bossShoot(enemy, dt);
        continue;
      }
      const dx = lx - enemy.x;
      const dy = ly - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      let speed = enemy.speed;
      if (!inLight(enemy.x, enemy.y)) {
        speed *= 1.25;
        if (enemy.kind === 'shade') speed *= ENEMY.shade.darkSpeed;
      }
      if (enemy.kind === 'wraith') speed *= wraithSpeedMult(enemy);
      const wobble = Math.sin(enemy.phase) * enemy.sway * dt;
      enemy.x += (dx / dist) * speed * dt + wobble;
      enemy.y += (dy / dist) * speed * dt;
      if (enemy.kind === 'stinger') {
        const pdx = player.x - enemy.x;
        enemy.x += Math.max(-1, Math.min(1, pdx / 60)) * 120 * dt;
      }
      if (enemy.y > FIELD.height + 40) enemy.active = false;
      // A ghost-phase Wraith cannot shoot — it is not really there, so its
      // plasma cannot be either. A solid Wraith shoots like any Hollow.
      const ghosted = enemy.kind === 'wraith' && !wraithIsSolid(enemy);
      if (!ghosted && enemy.y > 0 && enemy.y < ENEMY_BULLET.maxY) {
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && state.enemyBullets.length < ENEMY_BULLET.max) {
          enemy.fireTimer = enemy.shotInterval + random() * 1.4;
          const aimX = player.x + (random() - 0.5) * 2 * ENEMY_BULLET.aimError;
          const adx = aimX - enemy.x;
          const ady = player.y - enemy.y;
          const len = Math.hypot(adx, ady) || 1;
          state.enemyBullets.push({
            x: enemy.x,
            y: enemy.y + enemy.radius,
            vx: (adx / len) * ENEMY_BULLET.speed,
            vy: (ady / len) * ENEMY_BULLET.speed,
            radius: ENEMY_BULLET.radius,
            active: true,
          });
        }
      }
    }
    state.enemies = state.enemies.filter((e) => e.active);
  }

  // Fly the swarm's plasma for one step. A bolt that leaves the field
  // dies; the rest are swept out of the list.
  function stepEnemyBullets(dt) {
    for (const bullet of state.enemyBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y > FIELD.height + 20 || bullet.y < -20 || bullet.x < -20 || bullet.x > FIELD.width + 20) {
        bullet.active = false;
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => b.active);
  }

  // Fly the keeper's shots for one step. They only travel up (and
  // sideways), so anything above the top or past a side edge dies.
  function stepBullets(dt) {
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -20 || bullet.x < -20 || bullet.x > FIELD.width + 20) bullet.active = false;
    }
    state.bullets = state.bullets.filter((b) => b.active);
  }

  // Drift the prism pickups for one step. A prism close to the ship is
  // pulled in by the magnet; the rest fall. Flying over one banks it, and
  // every few banked prisms earn a Nova charge (up to the max). A prism
  // that falls off the bottom is lost.
  function stepCores(dt) {
    const player = state.player;
    for (const core of state.cores) {
      if (!core.active) continue;
      core.phase += dt * 4;
      const dx = player.x - core.x;
      const dy = player.y - core.y;
      const dist = Math.hypot(dx, dy);
      if (dist < PRISM.magnetRadius) {
        core.x += (dx / dist) * PRISM.magnetSpeed * dt;
        core.y += (dy / dist) * PRISM.magnetSpeed * dt;
      } else {
        core.y += core.vy * dt;
      }
      if (dist < player.radius + core.radius + 6) {
        core.active = false;
        state.prisms += 1;
        state.prismsCollected += 1;
        addFloater(core.x, core.y, '+1 ◈', '#8dff5a');
        if (state.prismsCollected >= PRISM.perNova && player.nova < PRISM.maxNova) {
          state.prismsCollected = 0;
          player.nova += 1;
          addFloater(player.x, player.y - 30, 'NOVA +1', '#ff5df2');
        }
      }
      if (core.y > FIELD.height + 20) core.active = false;
    }
    state.cores = state.cores.filter((c) => c.active);
  }

  // Resolve every collision for one step, and return the events it caused.
  // Ship shots hurt whatever they touch. If the keeper is not invulnerable,
  // an enemy that rams it (or a plasma bolt that reaches it) costs a life —
  // but only one hit per step, so a single frame can never take two lives.
  // And the Hollow feeds on the lantern: any enemy that reaches it strikes
  // it. (In attract/demo mode nothing hurts the keeper or the lantern.)
  function collide(attract) {
    const player = state.player;
    let events = 0;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      for (const enemy of state.enemies) {
        if (!enemy.active) continue;
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const hitRadius = bullet.radius + enemy.radius;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          bullet.active = false;
          damageEnemy(enemy, PLAYER.bulletDamage, bullet.x, bullet.y);
          break;
        }
      }
    }
    if (player.invuln <= 0 && !attract) {
      for (const enemy of state.enemies) {
        if (!enemy.active || enemy.isBoss) continue;
        if (enemy.kind === 'wraith' && !wraithIsSolid(enemy)) continue;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const ramRadius = player.radius + enemy.radius - 6;
        if (dx * dx + dy * dy < ramRadius * ramRadius) {
          enemy.active = false;
          addParticles(enemy.x, enemy.y, enemy.colour, 12, 240);
          events |= hitPlayer();
          break;
        }
      }
      if (!(events & (EVENT_HIT | EVENT_OVER))) {
        for (const bullet of state.enemyBullets) {
          if (!bullet.active) continue;
          const dx = player.x - bullet.x;
          const dy = player.y - bullet.y;
          const grazeRadius = player.radius + bullet.radius - 4;
          if (dx * dx + dy * dy < grazeRadius * grazeRadius) {
            bullet.active = false;
            addParticles(bullet.x, bullet.y, '#ff5df2', 8, 180);
            events |= hitPlayer();
            break;
          }
        }
      }
    }
    if (!attract) {
      for (const enemy of state.enemies) {
        if (!enemy.active || enemy.isBoss) continue;
        if (enemy.kind === 'wraith' && !wraithIsSolid(enemy)) continue;
        const dx = enemy.x - state.lantern.x;
        const dy = enemy.y - state.lantern.y;
        const strikeRadius = LANTERN.strikeRadius;
        if (dx * dx + dy * dy < strikeRadius * strikeRadius) {
          events |= lanternStrike(enemy);
          if (events & EVENT_OVER) break;
        }
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floaters) {
      f.y -= 42 * dt;
      f.life -= dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    for (const beam of state.beams) beam.life -= dt;
    state.beams = state.beams.filter((b) => b.life > 0);
    for (const star of state.stars) {
      star.y += star.speed * dt;
      if (star.y > FIELD.height) {
        star.y = -2;
        star.x = random() * FIELD.width;
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 40 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 1.8 * dt);
    if (state.lantern.flicker > 0) state.lantern.flicker = Math.max(0, state.lantern.flicker - 1.5 * dt);
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    // The streak's window counts down; a cold chain falls away.
    streakStep(state.streak, dt);
  }

  function step(dt, move, firing, useNova, attract) {
    state.time += dt;
    // The Nova slowly recharges on its own: a charge every 20 s, up to the
    // max, so the keeper is never left without a panic button for long.
    if (state.player.nova < PRISM.maxNova) {
      state.novaTimer += dt;
      if (state.novaTimer >= 20) {
        state.novaTimer = 0;
        state.player.nova += 1;
        addFloater(state.player.x, state.player.y - 30, 'NOVA +1', '#ff5df2');
      }
    } else {
      state.novaTimer = 0;
    }
    // The Radiance meter leaks and its burst counts down, every step.
    stepRadiance(state.radiance, dt);
    let events = 0;
    events |= stepPlayer(dt, move, firing, useNova, attract);
    stepEnemies(dt, attract);
    stepTurrets(dt);
    stepTurretBullets(dt);
    stepBullets(dt);
    stepEnemyBullets(dt);
    stepCores(dt);
    events |= collide(attract);
    stepFx(dt);

    if (attract) {
      // Title demo: the keeper's turrets stand guard while the swarm comes.
      if (state.turrets.length < 2 && state.time > 1) {
        const spots = [{ x: 420, y: 480 }, { x: 860, y: 480 }];
        const spot = spots[state.turrets.length];
        state.turrets.push({
          kind: state.turrets.length === 0 ? 'pulse' : 'lance', x: spot.x, y: spot.y,
          level: 1, fireTimer: 0.2, angle: -Math.PI / 2, target: null,
        });
      }
      if (state.enemies.length < 6 && random() < dt * 1.2) spawnEnemy('drifter');
      return events;
    }
    if (state.waveState === 'won') return events;
    if (state.waveState === 'build') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        // The dark closes in a little every wave.
        state.lantern.radius = Math.max(LANTERN.lightMin, state.lantern.radius - LANTERN.shrinkPerWave);
        startWave();
      }
      return events;
    }
    if (state.waveState === 'fighting') {
      state.spawnTimer -= dt;
      if (state.spawnQueue.length > 0 && state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        const interval = Math.max(WAVE.minInterval, WAVE.interval - WAVE.intervalPerWave * (state.wave - 1));
        state.spawnTimer = interval * (0.75 + random() * 0.5);
      }
      const bossAlive = state.boss && state.boss.active;
      if (state.spawnQueue.length === 0 && state.enemies.length === 0 && !bossAlive) {
        events |= clearWave();
      }
    }
    return events;
  }

  function reset(demo) {
    state.time = 0;
    state.player = freshPlayer();
    state.lantern = freshLantern();
    state.bullets = [];
    state.turretBullets = [];
    state.beams = [];
    state.enemies = [];
    state.enemyBullets = [];
    state.cores = [];
    state.particles = [];
    state.floaters = [];
    state.stars = makeStars(random);
    state.turrets = [];
    state.selectedTurret = null;
    state.buildChoice = null;
    state.score = 0;
    state.prisms = PRISM.start;
    state.prismsCollected = 0;
    state.wave = 1;
    state.waveSpawned = 0;
    state.waveTotal = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0.6;
    state.waveState = 'build';
    state.waveTimer = WAVE.buildSeconds;
    state.mutator = null;
    state.boss = null;
    state.bossPhase = 0;
    state.streak = createStreak();
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.kills = 0;
    state.novaTimer = 0;
    state.radiance = createRadiance();
    state.won = false;
    state.endless = false;
    state.turretsBuilt = 0;
    state.rekindles = 0;
    state.mends = 0;
    if (demo) {
      // A staged scene already owns its turrets and prisms.
      state.prisms = 240;
    }
    setBanner('HOLD THE LAST LIGHT', 'BUILD — SPEND PRISMS, THEN THE WAVE COMES', 2.6);
  }

  function continueEndless() {
    state.endless = true;
    state.won = false;
    state.wave += 1;
    state.waveState = 'build';
    state.waveTimer = WAVE.buildSeconds;
    setBanner('THE ENDLESS AFTERGLOW', 'THE DARK DOES NOT END — NEITHER DO YOU', 2.6);
  }

  /** Set the world to a chosen scene for a screenshot: turrets standing, a wave
   *  under way, a boss on screen. Used only by the screenshot stager. */
  function stageScene(opts) {
    reset(false);
    state.prisms = opts.prisms ?? 200;
    for (const t of opts.turrets || []) {
      state.turrets.push({
        kind: t.kind, x: t.x, y: t.y, level: t.level || 1,
        fireTimer: 0.1, angle: -Math.PI / 2, target: null,
      });
    }
    state.turretsBuilt = state.turrets.length;
    if (opts.wave) {
      state.wave = opts.wave;
      state.mutator = mutatorFor(opts.wave);
      state.waveState = 'fighting';
      state.spawnQueue = buildSpawnQueue(opts.wave);
      state.waveTotal = state.spawnQueue.length + (waveDef(opts.wave).boss ? 1 : 0);
      state.waveSpawned = 0;
      state.spawnTimer = 0.5;
      const def = waveDef(opts.wave);
      if (def.boss) spawnBoss(def.boss, opts.wave);
      const pre = opts.spawn ?? 10;
      for (let i = 0; i < pre && state.spawnQueue.length > 0; i += 1) {
        spawnEnemy(state.spawnQueue.shift());
        const e = state.enemies[state.enemies.length - 1];
        if (e) e.y = 60 + random() * 320;
      }
      // Forced kinds: spawn these exact enemies as well, so a scene can
      // guarantee a Wraith or a boss is on screen for its screenshot.
      for (const kind of opts.force || []) {
        spawnEnemy(kind);
        const e = state.enemies[state.enemies.length - 1];
        if (e) e.y = 90 + random() * 240;
      }
      if (opts.lanternHp) state.lantern.hp = opts.lanternHp;
      if (opts.lightRadius) state.lantern.radius = opts.lightRadius;
      setBanner(`WAVE ${opts.wave}`, def.boss ? 'A WARDEN OF THE HOLLOW' : 'THE HOLLOW COMES FOR THE LIGHT', 1.8);
    }
  }

  reset(false);
  return {
    state, step, reset, continueEndless, stageScene,
    placeTurret, selectTurretAt, upgradeSelected, rekindle, mend,
    upgradeFire, upgradeHull, lightRadius, inLight,
  };
}
