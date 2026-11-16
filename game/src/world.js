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
  BOSS, BULLET, COMBO, DARK_DAMAGE, ENEMY, ENEMY_BULLET, FIELD, LANTERN,
  LIVES, MUTATORS, NOVA, PLAYER, POOL, PRISM, TURRET, TURRET_RULES,
  UPGRADE, WAVE, WAVES,
} from './config.js';

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
    nova: 1,
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
  const muts = ['swarm', 'armored', 'swift', 'darksurge'];
  const def = {
    drifter: Math.round(20 * scale),
    weaver: Math.round(16 * scale),
    stinger: Math.round(14 * scale),
    shade: Math.round(14 * scale),
    bulwark: Math.round(10 * scale),
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
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    shake: 0,
    flash: 0,
    banner: null,
    kills: 0,
    won: false,
    endless: false,
    turretsBuilt: 0,
    rekindles: 0,
    mends: 0,
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

  /** The lantern's effective glow radius this wave (mutators can shrink it). */
  function lightRadius() {
    const base = state.lantern.radius;
    if (state.mutator === 'darksurge') return base * (MUTATORS.darksurge.lightMult || 0.7);
    return base;
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

  function buildSpawnQueue(wave) {
    const def = waveDef(wave);
    const queue = [];
    const mut = def.mut ? MUTATORS[def.mut] : null;
    const kinds = ['drifter', 'weaver', 'stinger', 'shade', 'bulwark'];
    for (const kind of kinds) {
      let count = def[kind] || 0;
      if (mut && mut.countMult) count = Math.round(count * mut.countMult);
      for (let i = 0; i < count; i += 1) queue.push(kind);
    }
    // Shuffle so the kinds arrive mixed, not in blocks.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  function mutatorFor(wave) {
    const def = waveDef(wave);
    return def.mut || null;
  }

  function applyMutatorTo(enemy) {
    const mut = state.mutator ? MUTATORS[state.mutator] : null;
    if (!mut) return;
    if (mut.hpDelta) enemy.hp = Math.max(1, enemy.hp + mut.hpDelta);
    if (mut.speedMult) enemy.speed *= mut.speedMult;
    if (mut.scoreMult) enemy.score = Math.round(enemy.score * mut.scoreMult);
  }

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
      shotInterval: kind === 'drifter' ? 3.4 : kind === 'weaver' ? 2.4 : kind === 'stinger' ? 2.0 : kind === 'shade' ? 2.8 : 4.5,
      active: true,
      isBoss: false,
    };
    applyMutatorTo(enemy);
    enemy.maxHp = enemy.hp;
    state.enemies.push(enemy);
    state.waveSpawned += 1;
  }

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

  function award(base, x, y) {
    const points = Math.round(base * state.multiplier);
    state.score += points;
    addFloater(x, y, `+${points}`, '#eaf6ff');
    return points;
  }

  function registerKill() {
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(state.combo, COMBO.max);
  }

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
      return;
    }
    if (byNova) {
      award(Math.round(enemy.score * NOVA.share), enemy.x, enemy.y);
    } else {
      registerKill();
      award(enemy.score, enemy.x, enemy.y);
      dropPrisms(enemy.x, enemy.y, ENEMY[enemy.kind].prisms);
    }
  }

  function damageEnemy(enemy, amount, x, y) {
    const lit = isLit(enemy);
    const dealt = lit ? amount : amount * DARK_DAMAGE;
    enemy.hp -= dealt;
    addParticles(x, y, enemy.colour, 2, 110);
    if (!lit && enemy.hp > 0) {
      addFloater(x, y - 14, 'SHIELDED', '#8fa3d9');
    }
    if (enemy.hp <= 0) killEnemy(enemy, false);
  }

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
      setBanner(`WAVE ${state.wave} — ${name}`, state.mutator ? `${sub}  •  ${MUTATORS[state.mutator].label}` : sub, 2.4);
    } else {
      const sub = state.mutator ? MUTATORS[state.mutator].label : 'THE HOLLOW COMES FOR THE LIGHT';
      setBanner(`WAVE ${state.wave}`, sub, 1.8);
    }
  }

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

  function hitPlayer() {
    const player = state.player;
    player.lives -= 1;
    player.invuln = PLAYER.invulnerable;
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    state.shake = 14;
    state.flash = 0.5;
    addParticles(player.x, player.y, '#2ee6ff', 26, 340);
    addParticles(player.x, player.y, '#ff3b5c', 12, 220);
    return player.lives <= 0 ? EVENT_OVER : EVENT_HIT;
  }

  // ---- turrets ----
  function turretLevelStats(kind, level) {
    const def = TURRET[kind];
    const lv = level - 1;
    return {
      range: def.range * Math.pow(TURRET_RULES.rangePerLevel, lv),
      damage: def.damage * Math.pow(TURRET_RULES.damagePerLevel, lv),
      interval: def.fireInterval * Math.pow(TURRET_RULES.intervalPerLevel, lv),
    };
  }

  function placeTurret(kind, x, y) {
    const def = TURRET[kind];
    if (!def) return false;
    if (state.turrets.length >= TURRET_RULES.maxCount) return false;
    if (state.prisms < def.cost) return false;
    if (y < TURRET_RULES.minY || y > TURRET_RULES.maxY) return false;
    const dlx = x - state.lantern.x;
    const dly = y - state.lantern.y;
    if (dlx * dlx + dly * dly < TURRET_RULES.lanternClear * TURRET_RULES.lanternClear) return false;
    for (const t of state.turrets) {
      const dx = x - t.x;
      const dy = y - t.y;
      if (dx * dx + dy * dy < TURRET_RULES.turretClear * TURRET_RULES.turretClear) return false;
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

  function selectTurretAt(x, y) {
    let best = null;
    let bestD = 34 * 34;
    for (const t of state.turrets) {
      const dx = x - t.x;
      const dy = y - t.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    state.selectedTurret = best;
    return best;
  }

  function upgradeSelected() {
    const t = state.selectedTurret;
    if (!t || t.level >= TURRET_RULES.levels) return false;
    const cost = Math.round(TURRET[t.kind].cost * TURRET_RULES.upgradeCostMult[t.level]);
    if (state.prisms < cost) return false;
    state.prisms -= cost;
    t.level += 1;
    addParticles(t.x, t.y, TURRET[t.kind].colour, 18, 240);
    addFloater(t.x, t.y - 26, t.level >= TURRET_RULES.levels ? 'FINAL FORM' : `LEVEL ${t.level}`, '#ffd23e');
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

  // ---- combat steps ----
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

  function nearestLitTarget(turret, stats) {
    // Turrets focus a boss first — the big threat — then the nearest lit enemy.
    let boss = null;
    let bossD = stats.range * stats.range;
    for (const e of state.enemies) {
      if (!e.active || !e.isBoss || !isLit(e)) continue;
      const dx = e.x - turret.x;
      const dy = e.y - turret.y;
      const d = dx * dx + dy * dy;
      if (d < bossD) {
        bossD = d;
        boss = e;
      }
    }
    if (boss) return boss;
    let best = null;
    let bestD = stats.range * stats.range;
    for (const e of state.enemies) {
      if (!e.active) continue;
      if (!isLit(e)) continue;
      const dx = e.x - turret.x;
      const dy = e.y - turret.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

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
      if (t.kind === 'lance') {
        // Piercing beam: every enemy near the line from the turret to the
        // farthest lit enemy in that direction takes the hit.
        const dx = target.x - t.x;
        const dy = target.y - t.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        state.beams.push({ x: t.x, y: t.y, nx, ny, len: Math.min(len, stats.range), life: 0.14, max: 0.14, colour: def.colour });
        for (const e of state.enemies) {
          if (!e.active || !isLit(e)) continue;
          const ex = e.x - t.x;
          const ey = e.y - t.y;
          const along = ex * nx + ey * ny;
          if (along < 0 || along > Math.min(len, stats.range) + e.radius) continue;
          const perp = Math.abs(ex * ny - ey * nx);
          if (perp < e.radius + 14) damageEnemy(e, stats.damage, e.x, e.y);
        }
      } else if (t.kind === 'nova') {
        state.turretBullets.push({
          x: t.x, y: t.y - 10, vx: (target.x - t.x) / (Math.hypot(target.x - t.x, target.y - t.y) || 1) * def.bulletSpeed,
          vy: (target.y - t.y) / (Math.hypot(target.x - t.x, target.y - t.y) || 1) * def.bulletSpeed,
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
        const r = b.radius + e.radius;
        if (dx * dx + dy * dy < r * r) {
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
    const n = def.burst + phase * 4;
    const player = state.player;
    if (phase === 1) {
      // Spiral: a rotating ring.
      const base = boss.phase * 0.7;
      for (let i = 0; i < n; i += 1) {
        const a = base + (i / n) * TAU;
        state.enemyBullets.push({
          x: boss.x, y: boss.y + boss.radius,
          vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
          radius: ENEMY_BULLET.radius, active: true,
        });
      }
    } else {
      // Radial burst, plus an aimed spread at the ship.
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * TAU + boss.phase * 0.3;
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

  function stepEnemies(dt, attract) {
    const player = state.player;
    const lx = state.lantern.x;
    const ly = state.lantern.y;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      enemy.rotation += enemy.spin * dt;
      enemy.phase += dt * 2;
      if (enemy.isBoss) {
        enemy.driftDir = enemy.x > FIELD.width - 140 ? -1 : enemy.x < 140 ? 1 : enemy.driftDir;
        enemy.x += enemy.driftDir * enemy.speed * dt;
        enemy.y = 170 + Math.sin(enemy.phase * 0.5) * 26;
        bossShoot(enemy, dt);
        continue;
      }
      // The Hollow seeks the lantern, weaving as it comes.
      const dx = lx - enemy.x;
      const dy = ly - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      let speed = enemy.speed;
      if (!inLight(enemy.x, enemy.y)) {
        speed *= 1.25;
        if (enemy.kind === 'shade') speed *= ENEMY.shade.darkSpeed;
      }
      const wobble = Math.sin(enemy.phase) * enemy.sway * dt;
      enemy.x += (dx / dist) * speed * dt + wobble;
      enemy.y += (dy / dist) * speed * dt;
      if (enemy.kind === 'stinger') {
        const pdx = player.x - enemy.x;
        enemy.x += Math.max(-1, Math.min(1, pdx / 60)) * 120 * dt;
      }
      if (enemy.y > FIELD.height + 40) enemy.active = false;
      // Every kind shoots back at the ship when it is in the upper field.
      if (enemy.y > 0 && enemy.y < ENEMY_BULLET.maxY) {
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

  function stepBullets(dt) {
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -20 || bullet.x < -20 || bullet.x > FIELD.width + 20) bullet.active = false;
    }
    state.bullets = state.bullets.filter((b) => b.active);
  }

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

  function collide(attract) {
    const player = state.player;
    let events = 0;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      for (const enemy of state.enemies) {
        if (!enemy.active) continue;
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const r = bullet.radius + enemy.radius;
        if (dx * dx + dy * dy < r * r) {
          bullet.active = false;
          damageEnemy(enemy, 1, bullet.x, bullet.y);
          break;
        }
      }
    }
    if (player.invuln <= 0 && !attract) {
      for (const enemy of state.enemies) {
        if (!enemy.active || enemy.isBoss) continue;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const r = player.radius + enemy.radius - 6;
        if (dx * dx + dy * dy < r * r) {
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
          const r = player.radius + bullet.radius - 4;
          if (dx * dx + dy * dy < r * r) {
            bullet.active = false;
            addParticles(bullet.x, bullet.y, '#ff5df2', 8, 180);
            events |= hitPlayer();
            break;
          }
        }
      }
    }
    // The Hollow feeds on the lantern.
    if (!attract) {
      for (const enemy of state.enemies) {
        if (!enemy.active || enemy.isBoss) continue;
        const dx = enemy.x - state.lantern.x;
        const dy = enemy.y - state.lantern.y;
        const r = LANTERN.strikeRadius;
        if (dx * dx + dy * dy < r * r) {
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
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }
  }

  function step(dt, move, firing, useNova, attract) {
    state.time += dt;
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
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.kills = 0;
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
