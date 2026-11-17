// Streak — the kill chain that pays for clean flying. Every Hollow the
// keeper drops without taking a hit lengthens the chain; the chain sets
// the score multiplier, and at milestones it pays out in prisms and Nova
// charges. A hit breaks the chain, and the chain cools off if the keeper
// stops killing: four seconds without a kill and the streak is gone. It
// is the game's reward for staying alive and staying accurate — a keeper
// who never gets hit is a keeper who is earning, and the milestones are
// the light's way of saying so.
//
// The streak lives in this module so the world only has to feed it kills
// and hits and ask it what a kill earned, and the renderer only has to
// ask how long the chain is and how much of its window is left. Nothing
// else in the game needs to know the chain exists.

import { STREAK } from './config.js';

/** A fresh chain: no kills, no window, plain multiplier, no best yet.
 *  The world keeps one on its state and feeds it kills; the renderer
 *  reads it for the HUD. */
export function createStreak() {
  return { count: 0, timer: 0, multiplier: 1, best: 0 };
}

/** The multiplier for a chain of this length: the tiers climb from x1 to
 *  x5, so a long chain is worth more than a short one, and the top tier
 *  is a real achievement — thirty-five kills without a hit. */
function tierFor(count) {
  let mult = 1;
  for (const tier of STREAK.tiers) {
    if (count >= tier.at) mult = tier.mult;
  }
  return mult;
}

/** How much of the chain's window is left, 0 to 1, for the HUD bar. A
 *  cold chain shows nothing; a warm one shows the keeper how long it has
 *  to land the next kill before the chain cools off. */
export function streakTimerFraction(streak) {
  if (streak.timer <= 0) return 0;
  return Math.max(0, Math.min(1, streak.timer / STREAK.window));
}

/** Kills until the next multiplier tier, or 0 when the chain is already
 *  at the top tier: the keeper can see how close the next reward is. */
export function streakToNextTier(streak) {
  for (const tier of STREAK.tiers) {
    if (tier.at > streak.count) return tier.at - streak.count;
  }
  return 0;
}

/** The words the HUD wears for the chain: multiplier and length together,
 *  so the keeper can see both the reward and how long the chain has run. */
export function streakLabel(streak) {
  return `COMBO x${streak.multiplier} · ${streak.count}`;
}

/** Feed the chain a kill. The chain grows by one, its window refreshes,
 *  and the multiplier climbs to its tier. At milestones the chain pays
 *  out: every tenth kill in a row banks bonus prisms, and every
 *  twenty-fifth charges a Nova. Returns what the kill earned, so the
 *  world can pay it: { prisms, nova, tierUp }. A boss kill does not feed
 *  the chain — the world only calls this for ordinary kills, the same
 *  kills that feed Radiance, so a boss never breaks or builds a chain. */
export function streakOnKill(streak) {
  const before = streak.multiplier;
  streak.count += 1;
  streak.timer = STREAK.window;
  streak.multiplier = tierFor(streak.count);
  if (streak.count > streak.best) streak.best = streak.count;
  return {
    prisms: streak.count % STREAK.prismEvery === 0 ? STREAK.prismBonus : 0,
    nova: streak.count % STREAK.novaEvery === 0 ? 1 : 0,
    tierUp: streak.multiplier > before,
  };
}

/** Break the chain: a hit ends it. The count, the window and the
 *  multiplier all fall away; the best chain stands, as a record of the
 *  keeper's cleanest flying. The world calls this when the ship is hit. */
export function streakOnHit(streak) {
  streak.count = 0;
  streak.timer = 0;
  streak.multiplier = 1;
}

/** A fresh chain for a new game: the same as a break, kept as its own
 *  word so the world can say what it means when it starts over. */
export function streakReset(streak) {
  streakOnHit(streak);
}

/** Advance the chain by one step. The window counts down; when it runs
 *  out the chain cools off and the count, the window and the multiplier
 *  fall away. A chain that is already cold costs nothing to step. */
export function streakStep(streak, dt) {
  if (streak.timer <= 0) return;
  streak.timer -= dt;
  if (streak.timer <= 0) {
    streak.timer = 0;
    streak.count = 0;
    streak.multiplier = 1;
  }
}

/** The longest chain this game, for the dossier and the game-over screen:
 *  the keeper's cleanest run of kills without a hit. */
export function streakBest(streak) {
  return streak.best;
}
