// NEON VOID's look: a canvas renderer that paints the playfield (1280x720 logical,
// scaled to the window) — starfield, neon grid, glowing ships and enemies, particles,
// the HUD, and the title, pause and game-over screens. All art is drawn in code;
// the game ships no image or font files.

import { ENEMY, FIELD, FONT, FONT_MONO, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

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

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rotation);
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
    } else {
      ctx.moveTo(0, e.radius);
      ctx.lineTo(e.radius, -e.radius * 0.8);
      ctx.lineTo(-e.radius, -e.radius * 0.8);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    // Hot core; weavers show a second hit point.
    ctx.fillStyle = e.colour;
    ctx.beginPath();
    ctx.arc(0, 0, e.hp > 1 ? 6 : 4, 0, TAU);
    ctx.fill();
    noGlow();
    ctx.restore();
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
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius * pulse, 0, TAU);
      ctx.fill();
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

  function drawHud(state, best) {
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
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('WAVE', FIELD.width / 2, 34);
    glow('#ff5df2', 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillText(String(state.wave), FIELD.width / 2, 68);
    noGlow();
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
    for (let i = 0; i < 3; i += 1) {
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
    // Cores banked toward the next Nova, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText(`CORES ${p.coresBanked}/5`, 24, FIELD.height - 24);
    ctx.fillStyle = 'rgba(141, 255, 90, 0.35)';
    ctx.fillRect(24, FIELD.height - 18, 100, 5);
    ctx.fillStyle = '#8dff5a';
    ctx.fillRect(24, FIELD.height - 18, 100 * (p.coresBanked / 5), 5);
    // Best, bottom right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`BEST ${best}`, FIELD.width - 24, FIELD.height - 24);
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
    ctx.font = `800 64px ${FONT_MONO}`;
    ctx.fillText(b.text, 0, 0);
    noGlow();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 20px ${FONT_MONO}`;
    ctx.fillText(b.sub, 0, 36);
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
    ctx.font = `800 96px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(255, 46, 136, 0.75)';
    ctx.fillText('NEON VOID', FIELD.width / 2 - 4 + bob * 0.2, 218 + bob);
    ctx.fillStyle = 'rgba(46, 230, 255, 0.75)';
    ctx.fillText('NEON VOID', FIELD.width / 2 + 4 - bob * 0.2, 218 + bob);
    glow(PALETTE.player, 30);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('NEON VOID', FIELD.width / 2, 218 + bob);
    noGlow();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText('A NEON ARCADE SHOOTER', FIELD.width / 2, 258 + bob);
    // How to play.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText('Blast the void swarm. Dodge the shards. Bank cores to charge your Nova.', FIELD.width / 2, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText('Move — Arrow keys / WASD / Mouse      Fire — Space / Click      Nova — X / Right-click', FIELD.width / 2, 362);
    ctx.fillText('Pause — P      Mute — M', FIELD.width / 2, 390);
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 19px ${FONT_MONO}`;
      ctx.fillText(`BEST  ${best}`, FIELD.width / 2, 436);
    }
    // Start prompt, pulsing so it is always visible, never blinking off.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    glow(PALETTE.player, 16);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 26px ${FONT_MONO}`;
    ctx.fillText('PRESS SPACE OR CLICK TO LAUNCH', FIELD.width / 2, 510);
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
    const ph = 380;
    const px = (FIELD.width - pw) / 2;
    const py = 150;
    ctx.fillStyle = 'rgba(13, 16, 48, 0.92)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    glow(PALETTE.player, 14);
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    noGlow();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `800 54px ${FONT_MONO}`;
    glow(PALETTE.danger, 18);
    ctx.fillText('GAME OVER', FIELD.width / 2, py + 78);
    noGlow();
    if (isNewBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 20px ${FONT_MONO}`;
      ctx.fillText('★ NEW BEST ★', FIELD.width / 2, py + 112);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 14px ${FONT_MONO}`;
    ctx.fillText('FINAL SCORE', FIELD.width / 2, py + 158);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 48px ${FONT_MONO}`;
    ctx.fillText(String(state.score), FIELD.width / 2, py + 208);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText(`Wave ${state.wave}  •  ${state.kills} ships down  •  Best ${best}`, FIELD.width / 2, py + 252);
    // Restart prompt, pulsing so it is always visible, never blinking off.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 2.4);
    ctx.save();
    ctx.globalAlpha = pulse;
    glow(PALETTE.player, 14);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText('PRESS SPACE OR CLICK TO FLY AGAIN', FIELD.width / 2, py + 318);
    noGlow();
    ctx.restore();
  }

  function draw(state, screen, best, isNewBest) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.backdropTop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = Math.sin(state.time * 91.7) * state.shake;
    const sy = Math.cos(state.time * 83.3) * state.shake;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offsetX + sx * scale), dpr * (offsetY + sy * scale));
    drawBackground(state);
    drawCores(state);
    for (const e of state.enemies) drawEnemy(e);
    drawBullets(state);
    // The ship flies on the title demo, in play and while paused; on the game-over
    // screen it is gone — it was destroyed.
    if (screen !== SCREEN_OVER) drawPlayer(state);
    drawParticles(state);
    drawFloaters(state);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.55})`;
      ctx.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    }
    drawHud(state, best);
    drawBanner(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best, isNewBest);
  }

  return { draw };
}
