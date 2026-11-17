// LUMEN VOID's look: a canvas renderer that paints the playfield (1280x720 logical,
// scaled to the window) — starfield, neon grid, the lantern's glow and the dark
// beyond it, glowing ships, turrets and enemies, particles, the HUD with its build
// bar, and the title, pause, victory and game-over screens. All art is drawn in
// code; the game ships no image or font files.

import {
  ENEMY, FIELD, FONT, FONT_MONO, LANTERN, MUTATORS, PALETTE, PLAYER, PRISM,
  TURRET, TURRET_RULES, UPGRADE,
} from './config.js';
import { prismUpgradeText } from './prism.js';
import { drawWraith } from './wraith.js';
import { mutatorSummary, mutatorTint } from './mutators.js';
import { radianceFill, radianceIsBursting, radianceLabel } from './radiance.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;
const TOTAL_WAVES = 20;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / FIELD.width, h / FIELD.height);
    offsetX = (w - FIELD.width * scale) / 2;
    offsetY = (h - FIELD.height * scale) / 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  window.addEventListener('resize', resize);
  resize();

  function glow(colour, blur) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
  }

  function noGlow() {
    ctx.shadowBlur = 0;
  }

  function drawBackground(state) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.backdropTop);
    g.addColorStop(1, PALETTE.backdropBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // Neon floor grid, fading toward the top.
    ctx.strokeStyle = PALETTE.grid;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 560);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 560; y <= FIELD.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Parallax starfield, twinkling with time.
    for (const star of state.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(state.time * 2 + star.phase);
      ctx.globalAlpha = (star.layer === 2 ? 0.95 : star.layer === 1 ? 0.7 : 0.45) * twinkle;
      ctx.fillStyle = star.layer === 2 ? PALETTE.starBright : PALETTE.starDim;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  /** The dark beyond the lantern's glow: the background dims outside the light. */
  function drawVeil(state, lightRadius) {
    const lx = state.lantern.x;
    const ly = state.lantern.y;
    const g = ctx.createRadialGradient(lx, ly, lightRadius * 0.55, lx, ly, Math.max(FIELD.width, FIELD.height) * 0.75);
    g.addColorStop(0, 'rgba(2, 2, 12, 0)');
    g.addColorStop(0.55, 'rgba(2, 2, 12, 0.12)');
    g.addColorStop(1, 'rgba(2, 2, 12, 0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // The edge of the light: a faint gold ring so the boundary reads.
    ctx.strokeStyle = PALETTE.lightEdge;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(lx, ly, lightRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawLantern(state) {
    const l = state.lantern;
    const hurt = l.hp / l.maxHp;
    const flicker = 0.8 + 0.2 * Math.sin(state.time * 7) - l.flicker * 0.4;
    // The glow pool on the floor.
    const g = ctx.createRadialGradient(l.x, l.y, 8, l.x, l.y, 130);
    g.addColorStop(0, `rgba(255, 223, 107, ${0.5 * flicker})`);
    g.addColorStop(1, 'rgba(255, 223, 107, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 130, 0, TAU);
    ctx.fill();
    // Pedestal.
    ctx.fillStyle = '#1a1440';
    ctx.strokeStyle = PALETTE.lantern;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.x - 30, l.y + 26);
    ctx.lineTo(l.x + 30, l.y + 26);
    ctx.lineTo(l.x + 22, l.y + 6);
    ctx.lineTo(l.x - 22, l.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The lantern itself: a bright cage. It dims and reddens as it is hurt.
    const core = hurt > 0.5 ? '#ffe98a' : hurt > 0.25 ? '#ffb020' : '#ff3b5c';
    glow(core, 26 * flicker);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 22);
    ctx.lineTo(l.x + 13, l.y - 6);
    ctx.lineTo(l.x + 13, l.y + 8);
    ctx.lineTo(l.x, l.y + 16);
    ctx.lineTo(l.x - 13, l.y + 8);
    ctx.lineTo(l.x - 13, l.y - 6);
    ctx.closePath();
    ctx.fill();
    noGlow();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(l.x, l.y - 2, 4.5 * flicker, 0, TAU);
    ctx.fill();
    // A small flame above the lantern.
    ctx.fillStyle = `rgba(255, 210, 62, ${0.85 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 34 - 4 * Math.sin(state.time * 5));
    ctx.quadraticCurveTo(l.x + 7, l.y - 26, l.x, l.y - 20);
    ctx.quadraticCurveTo(l.x - 7, l.y - 26, l.x, l.y - 34 - 4 * Math.sin(state.time * 5));
    ctx.fill();
  }

  function drawTurrets(state) {
    for (const t of state.turrets) {
      const def = TURRET[t.kind];
      const selected = state.selectedTurret === t;
      if (selected) {
        // Range circle for the selected turret.
        const range = def.range * Math.pow(TURRET_RULES.rangePerLevel, t.level - 1);
        ctx.strokeStyle = 'rgba(46, 230, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(t.x, t.y, range, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.translate(t.x, t.y);
      // Base.
      glow(def.colour, 14);
      ctx.fillStyle = '#101736';
      ctx.strokeStyle = def.colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (t.kind === 'pulse') {
        ctx.moveTo(0, -16);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 16);
        ctx.lineTo(-14, 0);
        ctx.closePath();
      } else if (t.kind === 'lance') {
        ctx.moveTo(0, -18);
        ctx.lineTo(16, -8);
        ctx.lineTo(16, 8);
        ctx.lineTo(0, 18);
        ctx.lineTo(-16, 8);
        ctx.lineTo(-16, -8);
        ctx.closePath();
      } else if (t.kind === 'prism') {
        // A Prism is a crystal: a tall diamond with a cut facet, so it
        // reads as glass, not metal, among the other turrets.
        ctx.moveTo(0, -20);
        ctx.lineTo(11, -6);
        ctx.lineTo(11, 8);
        ctx.lineTo(0, 18);
        ctx.lineTo(-11, 8);
        ctx.lineTo(-11, -6);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, 16, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
      // Barrel, aimed at its target.
      ctx.rotate(t.angle);
      ctx.fillStyle = def.colour;
      if (t.kind === 'pulse') {
        ctx.fillRect(0, -2.5, 22, 5);
      } else if (t.kind === 'lance') {
        ctx.fillRect(0, -3.5, 30, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(24, -1.5, 8, 3);
      } else if (t.kind === 'prism') {
        // A short, wide emitter with a bright crystal tip: the beam leaves
        // from the tip, so the barrel points at the first link.
        ctx.fillRect(0, -4, 16, 8);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(16, -5);
        ctx.lineTo(24, 0);
        ctx.lineTo(16, 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(0, -5, 18, 10);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(18, 0, 4, 0, TAU);
        ctx.fill();
      }
      noGlow();
      ctx.restore();
      // Level pips.
      for (let i = 0; i < TURRET_RULES.levels; i += 1) {
        ctx.fillStyle = i < t.level ? def.colour : 'rgba(90, 100, 140, 0.5)';
        ctx.beginPath();
        ctx.arc(t.x - 12 + i * 12, t.y + 22, 3, 0, TAU);
        ctx.fill();
      }
      if (t.level >= TURRET_RULES.levels) {
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `700 11px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('FINAL', t.x, t.y - 24);
      }
      if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 24, 0, TAU);
        ctx.stroke();
      }
    }
  }

  function drawBeams(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.beams) {
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      glow(b.colour, 18);
      ctx.strokeStyle = b.colour;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + b.nx * b.len, b.y + b.ny * b.len);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + b.nx * b.len, b.y + b.ny * b.len);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    noGlow();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(state.time * 10) % 2 === 0) return; // blink while shielded
    const flicker = 0.75 + 0.25 * Math.sin(state.time * 24);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Engine flame.
    glow('#ff9a3d', 18);
    ctx.fillStyle = `rgba(255, 154, 61, ${0.75 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(-6, 14);
    ctx.lineTo(0, 14 + 14 + 8 * flicker);
    ctx.lineTo(6, 14);
    ctx.closePath();
    ctx.fill();
    // Hull: a dart with a bright core.
    glow(PALETTE.player, 22);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(13, 12);
    ctx.lineTo(5, 8);
    ctx.lineTo(0, 12);
    ctx.lineTo(-5, 8);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(5, 8);
    ctx.lineTo(-5, 8);
    ctx.closePath();
    ctx.fill();
    noGlow();
    // Shield ring while invulnerable.
    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(46, 230, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + 3 * Math.sin(state.time * 8), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(e, inLight) {
    // A Wraith draws its own ghost, solid or faint as its phase says.
    if (e.kind === 'wraith') {
      drawWraith(ctx, e, inLight ? 1 : 0.55);
      return;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rotation);
    const dim = inLight ? 1 : 0.55;
    ctx.globalAlpha = dim;
    glow(e.colour, 16);
    ctx.strokeStyle = e.colour;
    ctx.fillStyle = 'rgba(10, 8, 28, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (e.kind === 'drifter') {
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (e.kind === 'weaver') {
      ctx.moveTo(0, -e.radius);
      ctx.lineTo(e.radius, 0);
      ctx.lineTo(0, e.radius);
      ctx.lineTo(-e.radius, 0);
      ctx.closePath();
    } else if (e.kind === 'stinger') {
      ctx.moveTo(0, e.radius);
      ctx.lineTo(e.radius, -e.radius * 0.8);
      ctx.lineTo(-e.radius, -e.radius * 0.8);
      ctx.closePath();
    } else if (e.kind === 'shade') {
      // A wisp: two crescents.
      ctx.moveTo(0, -e.radius);
      ctx.quadraticCurveTo(e.radius, 0, 0, e.radius);
      ctx.quadraticCurveTo(-e.radius, 0, 0, -e.radius);
      ctx.closePath();
    } else if (e.kind === 'bulwark') {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? e.radius : e.radius * 0.72;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (e.isBoss) {
      // The boss: a large hollow sun / warden sigil.
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU;
        const r = i % 2 === 0 ? e.radius : e.radius * 0.62;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    // Hot core; the boss shows a burning heart.
    ctx.fillStyle = e.colour;
    ctx.beginPath();
    ctx.arc(0, 0, e.isBoss ? 12 : e.hp > 1 ? 6 : 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, e.isBoss ? 5 : 2, 0, TAU);
    ctx.fill();
    noGlow();
    ctx.restore();
    ctx.globalAlpha = 1;
    // A shielded enemy in the dark wears a grey ring, so the rule reads.
    if (!inLight && !e.isBoss) {
      ctx.strokeStyle = 'rgba(143, 163, 217, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 6, 0, TAU);
      ctx.stroke();
    }
    // Boss health bar, right under the boss.
    if (e.isBoss) {
      const w = 110;
      ctx.fillStyle = 'rgba(10, 8, 28, 0.8)';
      ctx.fillRect(e.x - w / 2, e.y + e.radius + 10, w, 7);
      ctx.fillStyle = e.colour;
      ctx.fillRect(e.x - w / 2, e.y + e.radius + 10, w * Math.max(0, e.hp / e.maxHp), 7);
    }
  }

  function drawBullets(state) {
    glow(PALETTE.bullet, 12);
    ctx.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3, 10, 0, 0, TAU);
      ctx.fill();
    }
    noGlow();
    // Turret fire: cyan triplets and magenta mortar shells.
    for (const b of state.turretBullets) {
      glow(b.kind === 'nova' ? '#ff5df2' : '#2ee6ff', 12);
      ctx.fillStyle = b.kind === 'nova' ? '#ff5df2' : '#7df9ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
    }
    noGlow();
    // Incoming plasma: magenta orbs with a hot white heart.
    glow('#ff5df2', 14);
    for (const b of state.enemyBullets) {
      ctx.fillStyle = '#ff5df2';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, TAU);
      ctx.fill();
    }
    noGlow();
  }

  function drawCores(state) {
    for (const c of state.cores) {
      const pulse = 0.7 + 0.3 * Math.sin(c.phase);
      glow('#8dff5a', 16);
      ctx.fillStyle = '#8dff5a';
      // Prism orbs are drawn as small diamonds.
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-c.radius * 0.7 * pulse, -c.radius * 0.7 * pulse, c.radius * 1.4 * pulse, c.radius * 1.4 * pulse);
      ctx.restore();
      ctx.strokeStyle = 'rgba(141, 255, 90, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius + 6 + 2 * Math.sin(c.phase), 0, TAU);
      ctx.stroke();
      noGlow();
    }
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFloaters(state) {
    ctx.textAlign = 'center';
    ctx.font = `700 17px ${FONT_MONO}`;
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.colour;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBossBar(state) {
    const boss = state.boss;
    if (!boss || !boss.active) return;
    const w = 420;
    const x = (FIELD.width - w) / 2;
    const y = 96;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.fillText(boss.kind === 'hollowsun' ? 'THE HOLLOW SUN' : 'WARDEN', FIELD.width / 2, y - 6);
    ctx.fillStyle = 'rgba(10, 8, 28, 0.85)';
    ctx.fillRect(x, y, w, 10);
    ctx.strokeStyle = boss.colour;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, 10);
    ctx.fillStyle = boss.colour;
    ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, boss.hp / boss.maxHp), 8);
    if (boss.kind === 'hollowsun') {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 12px ${FONT_MONO}`;
      ctx.fillText(`PHASE ${state.bossPhase + 1} / 3`, FIELD.width / 2, y + 26);
    }
  }

  function drawHud(state, best, lightRadius) {
    // A faint scrim keeps the HUD readable when the swarm flies behind it.
    const scrim = ctx.createLinearGradient(0, 0, 0, 120);
    scrim.addColorStop(0, 'rgba(3, 3, 14, 0.6)');
    scrim.addColorStop(1, 'rgba(3, 3, 14, 0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, FIELD.width, 120);
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Score, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('SCORE', 24, 34);
    glow(PALETTE.player, 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillText(String(state.score).padStart(6, '0'), 24, 68);
    noGlow();
    // Combo meter under the score.
    if (state.multiplier > 1) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 16px ${FONT_MONO}`;
      ctx.fillText(`COMBO x${state.multiplier}`, 24, 94);
      ctx.fillStyle = 'rgba(255, 210, 62, 0.35)';
      ctx.fillRect(24, 102, 120, 5);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(24, 102, 120 * (state.comboTimer / 2.5), 5);
    }
    // Radiance meter under the score: the climb toward a burst. While a
    // burst burns the bar shows the burst draining instead, so the keeper
    // can see how much light is left.
    const rad = state.radiance;
    ctx.textAlign = 'left';
    ctx.fillStyle = radianceIsBursting(rad) ? '#ffe9a3' : PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText(radianceLabel(rad), 24, 122);
    ctx.fillStyle = 'rgba(255, 233, 163, 0.3)';
    ctx.fillRect(24, 130, 120, 5);
    ctx.fillStyle = radianceIsBursting(rad) ? '#ffe9a3' : '#ffd23e';
    ctx.fillRect(24, 130, 120 * Math.max(0, Math.min(1, radianceFill(rad))), 5);
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText(state.endless ? 'AFTERGLOW WAVE' : `WAVE  ${state.wave} / ${TOTAL_WAVES}`, FIELD.width / 2, 34);
    glow('#ff5df2', 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillText(state.waveState === 'build' ? 'BUILD' : String(state.wave), FIELD.width / 2, 68);
    noGlow();
    if (state.mutator) {
      ctx.fillStyle = mutatorTint(state.mutator);
      ctx.font = `700 13px ${FONT_MONO}`;
      ctx.fillText(MUTATORS[state.mutator].label, FIELD.width / 2, 92);
    }
    // Lives and Nova, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('SHIPS', FIELD.width - 24, 34);
    for (let i = 0; i < PLAYER.maxLives; i += 1) {
      const x = FIELD.width - 36 - i * 30;
      ctx.save();
      ctx.translate(x, 58);
      ctx.fillStyle = i < p.lives ? PALETTE.player : 'rgba(90, 100, 140, 0.4)';
      if (i < p.lives) glow(PALETTE.player, 8);
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    noGlow();
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('NOVA', FIELD.width - 24, 96);
    for (let i = 0; i < PRISM.maxNova; i += 1) {
      const x = FIELD.width - 36 - i * 26;
      ctx.save();
      ctx.translate(x, 112);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = i < p.nova ? PALETTE.nova : 'rgba(90, 100, 140, 0.4)';
      if (i < p.nova) glow(PALETTE.nova, 10);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
    noGlow();
    // Lantern HP + prisms, bottom left (above the build bar).
    const l = state.lantern;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('LANTERN', 24, FIELD.height - 76);
    const hpW = 150;
    ctx.fillStyle = 'rgba(255, 59, 92, 0.3)';
    ctx.fillRect(24, FIELD.height - 68, hpW, 8);
    ctx.fillStyle = l.hp / l.maxHp > 0.5 ? PALETTE.lantern : l.hp / l.maxHp > 0.25 ? '#ffb020' : PALETTE.danger;
    ctx.fillRect(24, FIELD.height - 68, hpW * Math.max(0, l.hp / l.maxHp), 8);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT_MONO}`;
    ctx.fillText(`${Math.ceil(l.hp)}`, 24 + hpW + 10, FIELD.height - 60);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('PRISMS ◈', 24, FIELD.height - 44);
    glow('#8dff5a', 10);
    ctx.fillStyle = '#8dff5a';
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(String(state.prisms), 108, FIELD.height - 42);
    noGlow();
    // Best, bottom right (above the build bar).
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText(`BEST ${best}  •  TURRETS ${state.turrets.length}/${TURRET_RULES.maxCount}`, FIELD.width - 24, FIELD.height - 76);
    ctx.fillText(`LIGHT ${Math.round(lightRadius)}`, FIELD.width - 24, FIELD.height - 44);
  }

  function drawBuildBar(state) {
    const y0 = FIELD.height - 34;
    const h = 30;
    // The build bar: a dark strip with the things prisms buy.
    ctx.fillStyle = 'rgba(13, 16, 48, 0.92)';
    ctx.fillRect(0, y0, FIELD.width, h);
    ctx.strokeStyle = 'rgba(46, 230, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(FIELD.width, y0);
    ctx.stroke();
    const items = [
      { key: '1', label: 'PULSE', cost: TURRET.pulse.cost, colour: TURRET.pulse.colour },
      { key: '2', label: 'LANCE', cost: TURRET.lance.cost, colour: TURRET.lance.colour },
      { key: '3', label: 'NOVA', cost: TURRET.nova.cost, colour: TURRET.nova.colour },
      { key: '4', label: 'PRISM', cost: TURRET.prism.cost, colour: TURRET.prism.colour },
      { key: 'R', label: 'REKINDLE', cost: 25, colour: PALETTE.lantern },
      { key: 'B', label: 'MEND', cost: 30, colour: '#8dff5a' },
      { key: 'F', label: 'FIRE+', cost: UPGRADE.fire.cost, colour: PALETTE.player },
      { key: 'H', label: 'HULL+1', cost: UPGRADE.hull.cost, colour: PALETTE.player },
    ];
    const selected = state.buildChoice;
    let x = 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 13px ${FONT_MONO}`;
    for (const item of items) {
      const afford = state.prisms >= item.cost;
      const isSel = selected === item.key.toLowerCase();
      const w = 108;
      if (isSel) {
        ctx.fillStyle = 'rgba(46, 230, 255, 0.25)';
        ctx.fillRect(x - 4, y0 + 3, w, h - 6);
        ctx.strokeStyle = PALETTE.player;
        ctx.strokeRect(x - 4, y0 + 3, w, h - 6);
      }
      ctx.fillStyle = afford ? item.colour : 'rgba(143, 163, 217, 0.55)';
      ctx.fillText(`[${item.key}] ${item.label}`, x, y0 + h / 2 + 1);
      ctx.fillStyle = afford ? PALETTE.text : 'rgba(143, 163, 217, 0.55)';
      ctx.fillText(`◈${item.cost}`, x + 78, y0 + h / 2 + 1);
      x += w + 10;
    }
    // Selected turret upgrade, right side. A Prism's offer names its
    // chain, so the keeper is choosing links, not just a level.
    const sel = state.selectedTurret;
    if (sel) {
      const def = TURRET[sel.kind];
      const canUp = sel.level < TURRET_RULES.levels;
      const cost = canUp ? Math.round(def.cost * TURRET_RULES.upgradeCostMult[sel.level]) : 0;
      const detail = sel.kind === 'prism' && canUp ? prismUpgradeText(sel.level) : `LV${sel.level + 1}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = canUp ? PALETTE.gold : PALETTE.muted;
      ctx.fillText(canUp ? `[U] UPGRADE ${def.name} → ${detail}  ◈${cost}` : `${def.name} — FINAL FORM`, FIELD.width - 16, y0 + h / 2 + 1);
    } else if (state.waveState === 'build') {
      ctx.textAlign = 'right';
      const t = Math.max(0, state.waveTimer);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(`BUILD — NEXT WAVE IN ${Math.ceil(t)}s`, FIELD.width - 16, y0 + h / 2 + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawBanner(state) {
    const b = state.banner;
    if (!b) return;
    const age = b.max - b.timer;
    const pop = Math.min(1, age / 0.18);
    const fade = Math.min(1, b.timer / 0.4);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(FIELD.width / 2, 300);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    glow('#ff5df2', 24);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 56px ${FONT_MONO}`;
    ctx.fillText(b.text, 0, 0);
    noGlow();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 19px ${FONT_MONO}`;
    ctx.fillText(b.sub, 0, 34);
    ctx.restore();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(3, 3, 14, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTitle(state, best) {
    dim(0.62);
    const bob = Math.sin(state.time * 1.6) * 6;
    ctx.textAlign = 'center';
    // Chromatic logo: magenta and cyan ghosts behind the white face.
    ctx.font = `800 92px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(255, 46, 136, 0.75)';
    ctx.fillText('LUMEN VOID', FIELD.width / 2 - 4 + bob * 0.2, 200 + bob);
    ctx.fillStyle = 'rgba(46, 230, 255, 0.75)';
    ctx.fillText('LUMEN VOID', FIELD.width / 2 + 4 - bob * 0.2, 200 + bob);
    glow(PALETTE.lantern, 30);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('LUMEN VOID', FIELD.width / 2, 200 + bob);
    noGlow();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText('HOLD THE LAST LIGHT', FIELD.width / 2, 242 + bob);
    // The pitch: what the game is.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText('The Hollow is drawn to the lantern. Light is the only weapon: inside the glow', FIELD.width / 2, 306);
    ctx.fillText('enemies burn and turrets can aim — in the dark they are shielded and fast.', FIELD.width / 2, 332);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText('20 waves  •  4 turrets with final forms  •  bosses every 5 waves, a 3-phase sun at 20', FIELD.width / 2, 366);
    const mutNames = mutatorSummary().map((m) => m.label.split(' — ')[0].toLowerCase()).join(' · ');
    ctx.fillText(`mutators: ${mutNames}  •  wraiths phase in and out  •  radiance fills toward a burst`, FIELD.width / 2, 392);
    ctx.fillText('Move — Arrows / WASD / Mouse      Fire — Space / Click      Nova — X / Right-click', FIELD.width / 2, 428);
    ctx.fillText('Build — 1 / 2 / 3 / 4, then click the field      Upgrade — click a turret, press U', FIELD.width / 2, 452);
    ctx.fillText('Rekindle — R      Mend — B      Fire+ — F      Hull — H      Pause — P      Mute — M', FIELD.width / 2, 476);
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 19px ${FONT_MONO}`;
      ctx.fillText(`BEST  ${best}`, FIELD.width / 2, 516);
    }
    // Start prompt, pulsing so it is always visible, never blinking off.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    glow(PALETTE.lantern, 16);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 26px ${FONT_MONO}`;
    ctx.fillText('PRESS SPACE OR CLICK TO KEEP THE LIGHT', FIELD.width / 2, 566);
    noGlow();
    ctx.restore();
  }

  function drawPaused() {
    dim(0.55);
    ctx.textAlign = 'center';
    glow(PALETTE.player, 20);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 56px ${FONT_MONO}`;
    ctx.fillText('PAUSED', FIELD.width / 2, 340);
    noGlow();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText('Press P to keep flying', FIELD.width / 2, 384);
  }

  function drawOver(state, best, isNewBest) {
    dim(0.6);
    // Results panel.
    const pw = 560;
    const ph = 400;
    const px = (FIELD.width - pw) / 2;
    const py = 140;
    ctx.fillStyle = 'rgba(13, 16, 48, 0.92)';
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 2;
    glow(PALETTE.danger, 14);
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    noGlow();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `800 48px ${FONT_MONO}`;
    glow(PALETTE.danger, 18);
    ctx.fillText('THE LIGHT DIES', FIELD.width / 2, py + 72);
    noGlow();
    if (isNewBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 20px ${FONT_MONO}`;
      ctx.fillText('★ NEW BEST ★', FIELD.width / 2, py + 106);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 14px ${FONT_MONO}`;
    ctx.fillText('FINAL SCORE', FIELD.width / 2, py + 152);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 48px ${FONT_MONO}`;
    ctx.fillText(String(state.score), FIELD.width / 2, py + 202);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText(`Wave ${state.wave}  •  ${state.kills} Hollow down  •  ${state.turretsBuilt} turrets built  •  Best ${best}`, FIELD.width / 2, py + 246);
    // Restart prompt, pulsing so it is always visible, never blinking off.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    glow(PALETTE.lantern, 14);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText('PRESS SPACE OR CLICK TO LIGHT IT AGAIN', FIELD.width / 2, py + 318);
    noGlow();
    ctx.restore();
  }

  function drawWin(state, best, isNewBest) {
    dim(0.6);
    const pw = 600;
    const ph = 420;
    const px = (FIELD.width - pw) / 2;
    const py = 130;
    ctx.fillStyle = 'rgba(13, 16, 48, 0.94)';
    ctx.strokeStyle = PALETTE.lantern;
    ctx.lineWidth = 2;
    glow(PALETTE.lantern, 16);
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    noGlow();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.lantern;
    ctx.font = `800 46px ${FONT_MONO}`;
    glow(PALETTE.lantern, 20);
    ctx.fillText('THE LIGHT ENDURES', FIELD.width / 2, py + 70);
    noGlow();
    if (isNewBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 20px ${FONT_MONO}`;
      ctx.fillText('★ NEW BEST ★', FIELD.width / 2, py + 104);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 14px ${FONT_MONO}`;
    ctx.fillText('THE HOLLOW SUN HAS FALLEN  •  FINAL SCORE', FIELD.width / 2, py + 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 48px ${FONT_MONO}`;
    ctx.fillText(String(state.score), FIELD.width / 2, py + 200);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText(`20 waves  •  ${state.kills} Hollow down  •  ${state.turretsBuilt} turrets built  •  Best ${best}`, FIELD.width / 2, py + 244);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText('The dark does not end — neither do you.', FIELD.width / 2, py + 284);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    glow(PALETTE.lantern, 14);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 21px ${FONT_MONO}`;
    ctx.fillText('SPACE — ENDLESS AFTERGLOW      R — PLAY AGAIN', FIELD.width / 2, py + 336);
    noGlow();
    ctx.restore();
  }

  function draw(state, screen, best, isNewBest, lightRadius) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.backdropTop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = Math.sin(state.time * 91.7) * state.shake;
    const sy = Math.cos(state.time * 83.3) * state.shake;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offsetX + sx * scale), dpr * (offsetY + sy * scale));
    drawBackground(state);
    drawVeil(state, lightRadius);
    drawLantern(state);
    drawTurrets(state);
    drawCores(state);
    for (const e of state.enemies) {
      const dx = e.x - state.lantern.x;
      const dy = e.y - state.lantern.y;
      drawEnemy(e, e.isBoss || dx * dx + dy * dy < lightRadius * lightRadius);
    }
    drawBeams(state);
    drawBullets(state);
    // The ship flies on the title demo, in play and while paused; on the game-over
    // and victory screens it is gone — it was destroyed, or it stands down.
    if (screen !== SCREEN_OVER && screen !== SCREEN_WIN) drawPlayer(state);
    drawParticles(state);
    drawFloaters(state);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.55})`;
      ctx.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    }
    drawBossBar(state);
    drawHud(state, best, lightRadius);
    drawBuildBar(state);
    drawBanner(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best, isNewBest);
    else if (screen === SCREEN_WIN) drawWin(state, best, isNewBest);
  }

  return { draw };
}
