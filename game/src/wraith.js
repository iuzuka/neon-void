// The Wraith — the sixth kind of Hollow, and the only one that cheats the
// light. Every other Hollow is hurt by the light and shielded by the dark;
// a Wraith phases between the two. Half its life it is solid, drifting
// toward the lantern like any other Hollow, lit and hittable. The other
// half it is a ghost: it slips through the dark faster, and no bullet, no
// beam and no turret can touch it — but a ghost cannot feed, either, so it
// passes through the lantern's ring without striking, and it cannot ram the
// keeper's ship. It is a patience test, not a wall: it is slow, it has
// little hide, and it pays three prisms when it finally falls, so a keeper
// who waits for the solid half is paid for the wait.
//
// The phase is a timer on the enemy itself. The world asks this module
// three questions every step — is it solid, how fast does it move, and
// has its phase just turned — and this module answers from that timer.
// The drawing lives here too, so the renderer only has to hand a Wraith
// over and let it draw its own ghost.

const TAU = Math.PI * 2;

/** The Wraith's phase: how long it stays solid, how long it stays a
 *  ghost, how much faster a ghost slips, and the pale colour it wears. */
export const WRAITH = {
  /** Seconds solid, hittable, feeding. */
  solidSeconds: 1.1,
  /** Seconds a ghost, untouchable, harmless. */
  ghostSeconds: 0.7,
  /** A ghost slips this much faster than a solid Wraith. */
  ghostSpeedMult: 1.3,
  /** How far a Wraith weaves sideways as it drifts, in pixels per second. */
  weave: 26,
  /** The pale colour of a Wraith, solid or ghost. */
  colour: '#c9f2ff',
  /** A ghost is drawn this transparent; a solid one is drawn whole. */
  ghostAlpha: 0.35,
};

/** Give a freshly spawned Wraith its phase. It always starts solid, with a
 *  full solid timer, and a random flicker phase so two Wraiths never blink
 *  in step. The world calls this right after it builds the enemy. */
export function initWraith(enemy, random) {
  enemy.intangible = false;
  enemy.phaseTimer = WRAITH.solidSeconds;
  enemy.flicker = random() * TAU;
}

/** Whether a Wraith can be hurt, targeted, or rammed right now. A ghost
 *  is none of those things; a solid Wraith is all of them. Anything that
 *  is not a Wraith is always solid — this is only ever asked of one. */
export function wraithIsSolid(enemy) {
  return !enemy.intangible;
}

/** How fast a Wraith moves, as a multiple of its own speed. A ghost slips
 *  faster through the dark; a solid Wraith drifts at its own pace. */
export function wraithSpeedMult(enemy) {
  return enemy.intangible ? WRAITH.ghostSpeedMult : 1;
}

/** Advance a Wraith's phase by one step. The timer runs down; when it
 *  empties, the Wraith turns — solid to ghost, ghost to solid — and the
 *  timer refills with the new phase's length. While it drifts it also
 *  weaves sideways, a slow sine that makes its path harder to lead than a
 *  drifter's. Returns 'ghost' or 'solid' on the step the phase turns, so
 *  the world can flash the change, and null on every other step. */
export function stepWraith(enemy, dt) {
  enemy.flicker += dt * 3;
  enemy.phaseTimer -= dt;
  enemy.x += Math.sin(enemy.flicker) * WRAITH.weave * dt;
  if (enemy.phaseTimer > 0) return null;
  if (enemy.intangible) {
    enemy.intangible = false;
    enemy.phaseTimer = WRAITH.solidSeconds;
    return 'solid';
  }
  enemy.intangible = true;
  enemy.phaseTimer = WRAITH.ghostSeconds;
  return 'ghost';
}

/** A haunting: three or more Wraiths on the field at once. Wraiths hunt
 *  in threes, and when a third one arrives they fall into step — their
 *  phases align, so the whole pack turns solid and ghost together. A
 *  keeper who sees three Wraiths blink as one is seeing a haunting, and
 *  the right answer is the same as for one Wraith, only louder: wait for
 *  the solid half, then spend everything. */
export const HAUNTING_COUNT = 3;

/** Whether a haunting is on: count the living Wraiths and say if there
 *  are three or more. The world asks this when a Wraith spawns, so the
 *  pack can be synced the moment it forms. */
export function wraithHaunting(enemies) {
  let count = 0;
  for (const e of enemies) {
    if (e.active && e.kind === 'wraith') count += 1;
  }
  return count >= HAUNTING_COUNT;
}

/** Sync a haunting: bring every living Wraith's phase timer to the
 *  shortest one among them, so the pack turns together from here on.
 *  Only the timer is touched — a ghost stays a ghost and a solid Wraith
 *  stays solid until the shared timer empties, so the sync never grants
 *  a free turn or steals one. Returns true when it synced a pack. */
export function syncWraithPhases(enemies) {
  let shortest = Infinity;
  let found = false;
  for (const e of enemies) {
    if (!e.active || e.kind !== 'wraith') continue;
    found = true;
    if (e.phaseTimer < shortest) shortest = e.phaseTimer;
  }
  if (!found) return false;
  for (const e of enemies) {
    if (!e.active || e.kind !== 'wraith') continue;
    e.phaseTimer = shortest;
  }
  return true;
}

/** Draw a Wraith. A solid one is a pale, tattered ghost with a hollow
 *  heart; a ghost-phase one is the same shape drawn faint, half gone
 *  already. `dim` is the light factor the renderer passes every enemy —
 *  1 in the light, dimmer in the dark — so a Wraith in the dark is doubly
 *  faint. The shape is a bell with a torn hem: three points along the
 *  bottom edge, so it reads as cloth, not a rock. */
export function drawWraith(ctx, enemy, dim) {
  const ghost = enemy.intangible;
  const alpha = (ghost ? WRAITH.ghostAlpha : 1) * dim;
  const r = enemy.radius;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.rotation * 0.4);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = WRAITH.colour;
  ctx.fillStyle = 'rgba(10, 8, 28, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.9, -r * 0.4, r * 0.7, r * 0.2);
  ctx.lineTo(r * 0.4, r * 0.75);
  ctx.lineTo(0, r * 0.45);
  ctx.lineTo(-r * 0.4, r * 0.75);
  ctx.lineTo(-r * 0.7, r * 0.2);
  ctx.quadraticCurveTo(-r * 0.9, -r * 0.4, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hollow eyes: two dark pits that stay dark even when the ghost is faint.
  ctx.fillStyle = '#04041a';
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.25, r * 0.16, 0, TAU);
  ctx.arc(r * 0.32, -r * 0.25, r * 0.16, 0, TAU);
  ctx.fill();
  // The heart: a cold core that burns only while the Wraith is solid.
  ctx.fillStyle = ghost ? 'rgba(201, 242, 255, 0.4)' : WRAITH.colour;
  ctx.beginPath();
  ctx.arc(0, r * 0.1, ghost ? 3 : 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, r * 0.1, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  // A ghost-phase Wraith wears a faint ring, so the keeper can see that
  // this one cannot be hit yet — the ring is the tell, not a shield.
  if (ghost) {
    ctx.strokeStyle = 'rgba(201, 242, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r + 7, 0, TAU);
    ctx.stroke();
  }
}
