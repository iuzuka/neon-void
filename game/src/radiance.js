// Radiance — the meter that turns kills into light. Every Hollow a
// turret or the ship kills feeds the meter a little; a boss feeds it a
// lot. When the meter fills, it breaks into a Radiant Burst: eight seconds
// in which the lantern burns brighter and wider, every weapon hits
// three-quarters as hard again, and a handful of prisms falls from the
// light itself.
// Then the meter empties and the slow climb begins again.
//
// It is the game's answer to a long wave. The combo multiplier rewards a
// fast chain of kills; Radiance rewards a long one. A keeper who is
// losing a wave watches the meter the way a sailor watches the horizon —
// the burst is a second wind, and a wave that ends on a burst is a wave
// that ends with the keeper standing. The burst is not a Nova: it does
// not clear the sky, it only makes the keeper's own weapons better, so it
// never replaces aiming, placing, or spending a Nova at the right moment.
//
// The meter lives in this module so the world only has to feed it kills
// and ask it two questions — how hard do weapons hit now, and how wide is
// the light — and the renderer only has to ask how full it is. Nothing
// else in the game needs to know the meter exists.

/** The meter's shape: how full it gets, what fills it, how fast it
 *  leaks, and what a burst is worth. */
export const RADIANCE = {
  /** The meter fills to this, then breaks. */
  max: 100,
  /** What one ordinary kill feeds the meter. */
  perKill: 6,
  /** What a boss feeds the meter — a Warden or the Sun is half a burst. */
  perBossKill: 50,
  /** The meter leaks this much a second when it is not bursting. A slow
   *  leak, so a quiet build phase does not drain a hard-earned meter, but
   *  a meter left alone between waves still fades. */
  decayPerSecond: 1.2,
  /** How long a burst lasts, in seconds. */
  burstSeconds: 8,
  /** Weapons hit this much harder while the burst burns. */
  damageMult: 1.75,
  /** Prisms the light itself drops when a burst breaks. */
  burstPrisms: 6,
  /** How much wider the light burns while the burst burns. */
  burstLightBonus: 40,
};

/** A fresh meter: empty, not bursting, its halfway gift unspent. The
 *  world keeps one on its state and feeds it kills; the renderer reads
 *  it for the HUD bar. */
export function createRadiance() {
  return { value: 0, burst: 0, glimmerSpent: false };
}

/** Whether the burst is burning right now. */
export function radianceIsBursting(radiance) {
  return radiance.burst > 0;
}

/** How full the meter is, from 0 to 1, for the HUD bar. While a burst
 *  burns the bar shows the burst draining instead, so the keeper can see
 *  how much light is left. */
export function radianceFill(radiance) {
  if (radiance.burst > 0) return radiance.burst / RADIANCE.burstSeconds;
  return radiance.value / RADIANCE.max;
}

/** How hard weapons hit right now: half as hard again while the burst
 *  burns, plain damage otherwise. The world multiplies every hit by this. */
export function radianceDamageMult(radiance) {
  return radiance.burst > 0 ? RADIANCE.damageMult : 1;
}

/** How much wider the light burns right now: forty extra radius while
 *  the burst burns, nothing otherwise. The world adds this to the
 *  lantern's glow. */
export function radianceLightBonus(radiance) {
  return radiance.burst > 0 ? RADIANCE.burstLightBonus : 0;
}

/** The word the HUD wears for the meter: plain while it fills, and a
 *  shout while it burns. */
export function radianceLabel(radiance) {
  return radiance.burst > 0 ? 'RADIANT BURST!' : 'RADIANCE';
}

/** Feed the meter a kill. An ordinary Hollow feeds it a little; a boss
 *  feeds it half a burst. If the feed fills the meter, the burst breaks:
 *  the meter empties, the burst timer starts, and the light drops its
 *  prisms. Returns what happened, so the world can pay the prisms and
 *  banner the burst: { burst: true, prisms: n } on the kill that breaks
 *  it, { burst: false, prisms: 0 } on every other kill. A Nova kill does
 *  not feed the meter — the world only calls this for real kills, the
 *  same kills that feed the combo. */
export function radianceOnKill(radiance, enemy) {
  if (radiance.burst > 0) return { burst: false, prisms: 0 };
  radiance.value += enemy && enemy.isBoss ? RADIANCE.perBossKill : RADIANCE.perKill;
  if (radiance.value < RADIANCE.max) return { burst: false, prisms: 0 };
  radiance.value = 0;
  radiance.burst = RADIANCE.burstSeconds;
  radiance.glimmerSpent = false;
  return { burst: true, prisms: RADIANCE.burstPrisms };
}

/** Advance the meter by one step. A burning burst counts down; when it
 *  empties the light goes back to its plain self. A meter that is not
 *  bursting leaks slowly, so a full meter cannot be hoarded forever. */
export function stepRadiance(radiance, dt) {
  if (radiance.burst > 0) {
    radiance.burst = Math.max(0, radiance.burst - dt);
    return;
  }
  if (radiance.value > 0) {
    radiance.value = Math.max(0, radiance.value - RADIANCE.decayPerSecond * dt);
  }
}

/** The Glimmer: the meter's halfway gift. When the meter crosses half
 *  full, the next kill glimmers — it drops one bonus prism, a spark the
 *  light throws off for the keeper's trouble. It is a small thing, one
 *  prism, but it is the meter saying "keep going" halfway up the climb,
 *  and a keeper who is counting prisms feels it. The glimmer arms once
 *  per climb and spends itself on the next kill; it never stacks, and it
 *  never fires while a burst is burning. */
export const GLIMMER_AT = 0.5;

/** Whether the glimmer is armed: the meter is at least half full, it is
 *  not bursting, and the gift has not been spent on this climb. */
export function radianceGlimmerArmed(radiance) {
  return radiance.burst <= 0 && !radiance.glimmerSpent && radiance.value >= RADIANCE.max * GLIMMER_AT;
}

/** Spend the glimmer on a kill: mark it spent for this climb and say so.
 *  The world calls this when a kill lands while the glimmer is armed, and
 *  drops the bonus prism. When the meter breaks into a burst the glimmer
 *  resets with it, so every climb earns its halfway gift again. */
export function radianceSpendGlimmer(radiance) {
  if (!radianceGlimmerArmed(radiance)) return false;
  radiance.glimmerSpent = true;
  return true;
}

/** How many kills a full meter is worth, for the dossier and the title
 *  screen: ordinary kills alone, or with a boss in the count. A meter
 *  fills on seventeen ordinary kills, or two bosses, or any mix between. */
export function radianceKillsToFill() {
  return Math.ceil(RADIANCE.max / RADIANCE.perKill);
}
