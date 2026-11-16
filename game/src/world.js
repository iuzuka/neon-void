// NEON VOID's simulation: the ship, its bullets, three kinds of enemy, energy cores,
// particles, waves and scoring. Everything advances in fixed steps; all randomness
// comes from the seeded generator, so a staged screenshot is repeatable.

import {
  BULLET, COMBO, CORE, ENEMY, ENEMY_BULLET, FIELD, LIVES, NOVA, PLAYER, POOL, STEP, WAVE,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_SECTOR = 8;
export const EVENT_NOVA = 16;

const TAU = Math.PI * 2;

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
    y: FIELD.height - 90,
    radius: PLAYER.radius,
    lives: LIVES,
    invuln: 0,
    fireTimer: 0,
    nova: 1,
    coresBanked: 0,
    thrust: 0,
  };
}

export function createWorld(random) {
  const state = {
    time: 0,
    player: freshPlayer(),
    bullets: [],
    enemies: [],
    enemyBullets: [],
    cores: [],
    particles: [],
    floaters: [],
    stars: makeStars(random),
    score: 0,
    wave: 1,
    waveSpawned: 0,
    waveTotal: WAVE.baseCount,
    spawnTimer: 0.6,
    waveState: 'fighting',
    waveTimer: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    shake: 0,
    flash: 0,
    banner: null,
    kills: 0,
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

  function spawnEnemy() {
    if (state.enemies.length >= POOL.enemies) return;
    const roll = random();
    let kind = 'drifter';
    if (state.wave >= 3 && roll > 0.78) kind = 'stinger';
    else if (state.wave >= 2 && roll > 0.52) kind = 'weaver';
    const def = ENEMY[kind];
    const speedScale = 1 + WAVE.speedPerWave * (state.wave - 1);
    state.enemies.push({
      kind,
      x: 40 + random() * (FIELD.width - 80),
      y: -30 - random() * 60,
      hp: def.hp,
      radius: def.radius,
      speed: def.speed * speedScale * (0.9 + random() * 0.2),
      score: def.score,
      colour: def.colour,
      phase: random() * TAU,
      sway: 30 + random() * 50,
      rotation: random() * TAU,
      spin: (random() - 0.5) * 2.4,
      fireTimer: 0.5 + random() * 1.0,
      shotInterval: kind === 'drifter' ? 3.4 : kind === 'weaver' ? 2.4 : 2.0,
      active: true,
    });
    state.waveSpawned += 1;
  }

  function dropCore(x, y) {
    if (state.cores.length >= POOL.cores) return;
    state.cores.push({ x, y, vy: CORE.fallSpeed, radius: CORE.radius, active: true, phase: random() * TAU });
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
    if (byNova) {
      award(Math.round(enemy.score * NOVA.share), enemy.x, enemy.y);
    } else {
      registerKill();
      award(enemy.score, enemy.x, enemy.y);
      if (random() < 0.35) dropCore(enemy.x, enemy.y);
    }
  }

  function startWave() {
    state.waveState = 'fighting';
    state.waveSpawned = 0;
    state.waveTotal = WAVE.baseCount + WAVE.perWave * (state.wave - 1);
    state.spawnTimer = 0.7;
    setBanner(`WAVE ${state.wave}`, state.wave % WAVE.sectorEvery === 0 ? 'SECTOR FINALE' : 'HOSTILES INBOUND', 1.8);
  }

  function clearWave() {
    const bonus = WAVE.clearBonus * state.wave;
    state.score += bonus;
    let events = EVENT_WAVE_CLEAR;
    if (state.wave % WAVE.sectorEvery === 0) {
      state.score += WAVE.sectorBonus;
      events |= EVENT_SECTOR;
      setBanner('SECTOR CLEAR', `WAVE BONUS +${bonus}  •  SECTOR BONUS +${WAVE.sectorBonus}`, 2.4);
    } else {
      setBanner('WAVE CLEAR', `BONUS +${bonus}`, 2.2);
    }
    state.waveState = 'breather';
    state.waveTimer = 2.4;
    return events;
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

  function stepPlayer(dt, move, firing, useNova, attract) {
    const player = state.player;
    if (player.invuln > 0) player.invuln -= dt;
    player.x = Math.min(FIELD.width - 24, Math.max(24, player.x + move.x * PLAYER.speed * dt));
    player.y = Math.min(FIELD.height - 24, Math.max(120, player.y + move.y * PLAYER.speed * dt));
    player.thrust = Math.abs(move.x) + Math.abs(move.y) > 0.1 ? 1 : 0;
    if (player.thrust) {
      addParticles(player.x, player.y + 18, '#2ee6ff', 1, 60);
    }
    player.fireTimer -= dt;
    if (firing && player.fireTimer <= 0 && state.bullets.length < POOL.bullets) {
      player.fireTimer = PLAYER.fireInterval;
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
        if (enemy.active) killEnemy(enemy, true);
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

  function stepEnemies(dt, attract) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      enemy.rotation += enemy.spin * dt;
      enemy.phase += dt * 2;
      if (enemy.kind === 'weaver') {
        enemy.x += Math.sin(enemy.phase) * enemy.sway * dt * 2;
        enemy.y += enemy.speed * dt;
      } else if (enemy.kind === 'stinger' && enemy.y > 180) {
        const dx = player.x - enemy.x;
        enemy.x += Math.max(-1, Math.min(1, dx / 60)) * 260 * dt;
        enemy.y += enemy.speed * 1.15 * dt;
      } else {
        enemy.x += Math.sin(enemy.phase * 0.6) * 18 * dt;
        enemy.y += enemy.speed * dt;
      }
      if (enemy.y > FIELD.height + 40) enemy.active = false;
      // Every kind shoots back at the ship, so holding one spot is fatal: the
      // first shot comes soon after the enemy arrives, then every few seconds.
      if (enemy.y > 0 && enemy.y < ENEMY_BULLET.maxY) {
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && state.enemyBullets.length < ENEMY_BULLET.max) {
          enemy.fireTimer = enemy.shotInterval + random() * 1.4;
          const aimX = player.x + (random() - 0.5) * 2 * ENEMY_BULLET.aimError;
          const dx = aimX - enemy.x;
          const dy = player.y - enemy.y;
          const len = Math.hypot(dx, dy) || 1;
          state.enemyBullets.push({
            x: enemy.x,
            y: enemy.y + enemy.radius,
            vx: (dx / len) * ENEMY_BULLET.speed,
            vy: (dy / len) * ENEMY_BULLET.speed,
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
      if (dist < CORE.magnetRadius) {
        core.x += (dx / dist) * CORE.magnetSpeed * dt;
        core.y += (dy / dist) * CORE.magnetSpeed * dt;
      } else {
        core.y += core.vy * dt;
      }
      if (dist < player.radius + core.radius + 6) {
        core.active = false;
        state.score += CORE.score;
        player.coresBanked += 1;
        addFloater(core.x, core.y, `+${CORE.score}`, CORE.score > 0 ? '#8dff5a' : '#eaf6ff');
        if (player.coresBanked >= CORE.perNova && player.nova < CORE.maxNova) {
          player.coresBanked = 0;
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
          enemy.hp -= 1;
          addParticles(bullet.x, bullet.y, enemy.colour, 3, 120);
          if (enemy.hp <= 0) killEnemy(enemy, false);
          break;
        }
      }
    }
    if (player.invuln <= 0 && !attract) {
      for (const enemy of state.enemies) {
        if (!enemy.active) continue;
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
    for (const star of state.stars) {
      star.y += star.speed * dt;
      if (star.y > FIELD.height) {
        star.y = -2;
        star.x = random() * FIELD.width;
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 40 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 1.8 * dt);
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
    stepBullets(dt);
    stepEnemyBullets(dt);
    stepCores(dt);
    events |= collide(attract);
    stepFx(dt);

    if (attract) {
      if (state.enemies.length < 6 && random() < dt * 1.2) spawnEnemy();
      return events;
    }
    if (state.waveState === 'fighting') {
      state.spawnTimer -= dt;
      if (state.waveSpawned < state.waveTotal && state.spawnTimer <= 0) {
        spawnEnemy();
        const interval = Math.max(WAVE.minInterval, WAVE.interval - WAVE.intervalPerWave * (state.wave - 1));
        state.spawnTimer = interval * (0.75 + random() * 0.5);
      }
      if (state.waveSpawned >= state.waveTotal && state.enemies.length === 0) {
        events |= clearWave();
      }
    } else if (state.waveState === 'breather') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.wave += 1;
        startWave();
      }
    }
    return events;
  }

  function reset() {
    state.time = 0;
    state.player = freshPlayer();
    state.bullets = [];
    state.enemies = [];
    state.enemyBullets = [];
    state.cores = [];
    state.particles = [];
    state.floaters = [];
    state.stars = makeStars(random);
    state.score = 0;
    state.wave = 1;
    state.waveSpawned = 0;
    state.waveTotal = WAVE.baseCount;
    state.spawnTimer = 0.6;
    state.waveState = 'fighting';
    state.waveTimer = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.kills = 0;
    setBanner('WAVE 1', 'HOSTILES INBOUND', 1.8);
  }

  reset();
  return { state, step, reset };
}
