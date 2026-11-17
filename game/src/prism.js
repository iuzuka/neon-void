// The Prism turret — the fourth turret, and the only one that splits its
// light. A Pulse sprays, a Lance pierces, a Nova lobs; a Prism takes one
// beam and shares it. It locks the nearest lit Hollow, then the beam leaps
// to the closest lit Hollow near that one, and again, and again — each hop
// a little weaker, so a tight pack melts and a lone drifter still takes the
// full hit. It is the turret for a crowded sky: against one enemy it is an
// expensive Pulse, against a swarm it is the best damage per prism in the
// game. Its final form grows one more link and learns to spray: every hop
// also stings the enemies crowded around the one it lights, so a maxed
// Prism can light six enemies and scorch their neighbours with a single
// shot.
//
// The chain lives in this module so the world only has to ask for it: give
// firePrism the turret, its target and the world's damage and lighting
// hooks, and it does the hopping, the hurting and the beam drawing. The
// beams it pushes are the same beam records the Lance uses, so the
// renderer needs no new code to draw them.

import { TURRET } from './config.js';

/** The chain's shape: how far a hop may reach, how much weaker each hop
 *  is, how long a hop's beam stays on screen, and what the final form adds. */
export const PRISM_CHAIN = {
  /** How many enemies one shot may light: the first target plus hops. */
  links: 5,
  /** A hop may only reach an enemy this close to the last one lit. A short
   *  leash keeps the chain honest — it rewards a packed swarm, it does not
   *  snipe stragglers across the field. */
  linkRange: 175,
  /** Each hop keeps this share of the shot's damage: 1, 0.7, 0.49, 0.343...
   *  The first enemy always takes the full hit; the tail of the chain is a
   *  burn, not a kill. */
  falloff: 0.7,
  /** Seconds a chain beam stays visible. */
  beamLife: 0.16,
  /** A final-form Prism grows one more link. */
  finalFormBonusLinks: 1,
  /** A final-form hop also stings the enemies crowded around the one it
   *  lights, out to this radius. */
  finalSplashRadius: 46,
  /** That sting is this share of the hop's own damage. */
  finalSplashShare: 0.25,
};

/** How many enemies a Prism of this level lights with one shot. The final
 *  form (level 3) grows one more link, so a maxed Prism can light six. */
export function prismLinks(level) {
  return PRISM_CHAIN.links + (level >= 3 ? PRISM_CHAIN.finalFormBonusLinks : 0);
}

/** The damage a shot deals to the enemy at this position in the chain:
 *  full damage to the first, then the falloff compounds with every hop. */
export function prismDamageAt(damage, index) {
  return damage * Math.pow(PRISM_CHAIN.falloff, index);
}

/** A beam record for one hop, from (ax, ay) to (bx, by), in the shape the
 *  renderer's beam list expects: an origin, a unit direction, a length, a
 *  life and a colour. The renderer draws it like any other beam. */
export function prismBeamSegment(ax, ay, bx, by, colour) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: ax,
    y: ay,
    nx: dx / len,
    ny: dy / len,
    len,
    life: PRISM_CHAIN.beamLife,
    max: PRISM_CHAIN.beamLife,
    colour,
  };
}

/** The nearest lit enemy to (x, y) that is not already in the chain and
 *  lies within one hop's reach of it. The chain only ever touches lit
 *  enemies: a Prism is a light weapon, and the dark hides what it would
 *  hit. An enemy the chain has already lit is never lit twice by one shot. */
function nextLink(enemies, x, y, chain, isLit) {
  let best = null;
  let bestDistSq = PRISM_CHAIN.linkRange * PRISM_CHAIN.linkRange;
  for (const e of enemies) {
    if (!e.active || chain.includes(e)) continue;
    if (!isLit(e)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  }
  return best;
}

/** Build the chain a Prism shot will light: the first target, then hop
 *  after hop to the nearest lit neighbour, until the link cap is reached
 *  or no lit enemy stands close enough to the last one. The chain is
 *  returned in the order the beam will visit it, first target first. */
export function prismChain(enemies, first, isLit, maxLinks) {
  const chain = [first];
  while (chain.length < maxLinks) {
    const last = chain[chain.length - 1];
    const hop = nextLink(enemies, last.x, last.y, chain, isLit);
    if (!hop) break;
    chain.push(hop);
  }
  return chain;
}

/** The enemies a final-form hop stings around the one it lights: lit,
 *  close to (x, y), and not already in the chain. The sting is a spray,
 *  not a second chain — it never hops onward, and it never touches the
 *  enemy the hop itself is lighting. */
function splashTargets(enemies, x, y, chain, isLit) {
  const hit = [];
  const radiusSq = PRISM_CHAIN.finalSplashRadius * PRISM_CHAIN.finalSplashRadius;
  for (const e of enemies) {
    if (!e.active || chain.includes(e)) continue;
    if (!isLit(e)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy < radiusSq) hit.push(e);
  }
  return hit;
}

/** Fire one Prism shot. `hooks` is the world's damage and lighting:
 *  damageEnemy(enemy, amount, x, y), isLit(enemy), and a spark function
 *  for the impact flashes. The shot lights its chain with falling damage,
 *  draws a beam for every hop, and at final form stings the crowd around
 *  each hop. It returns how many enemies the chain itself lit (the sting
 *  does not count). */
export function firePrism(state, turret, target, stats, hooks) {
  const colour = TURRET.prism.colour;
  const chain = prismChain(state.enemies, target, hooks.isLit, prismLinks(turret.level));
  const finalForm = turret.level >= 3;
  let px = turret.x;
  let py = turret.y;
  for (let i = 0; i < chain.length; i += 1) {
    const enemy = chain[i];
    const damage = prismDamageAt(stats.damage, i);
    state.beams.push(prismBeamSegment(px, py, enemy.x, enemy.y, colour));
    hooks.damageEnemy(enemy, damage, enemy.x, enemy.y);
    hooks.spark(enemy.x, enemy.y, colour, 3, 140);
    if (finalForm) {
      // The final form's spray: the hop stings the crowd around it.
      for (const near of splashTargets(state.enemies, enemy.x, enemy.y, chain, hooks.isLit)) {
        hooks.damageEnemy(near, damage * PRISM_CHAIN.finalSplashShare, near.x, near.y);
        hooks.spark(near.x, near.y, colour, 1, 90);
      }
    }
    px = enemy.x;
    py = enemy.y;
  }
  return chain.length;
}

/** What the build bar and the announcer say about the Prism: its name,
 *  its key, and the one line that tells a keeper when to buy it. */
export const PRISM_INFO = {
  name: 'Prism',
  key: '4',
  desc: 'chain beam',
  tip: 'Chains light between enemies — best against a crowd.',
};

/** The Prism's effective numbers at a level, for the upgrade text and
 *  the dossier: the same range, damage and interval the world's level
 *  rules give every turret, plus the chain this level lights. A keeper
 *  reading the upgrade offer sees exactly what the next level buys. */
export function prismStatsAt(level) {
  const def = TURRET.prism;
  const steps = level - 1;
  return {
    range: Math.round(def.range * Math.pow(1.15, steps)),
    damage: +(def.damage * Math.pow(1.6, steps)).toFixed(1),
    interval: +(def.fireInterval * Math.pow(0.85, steps)).toFixed(2),
    links: prismLinks(level),
    splash: level >= 3,
  };
}

/** The upgrade offer for a Prism at this level: what the next level
 *  buys, in one short line. The renderer wears this on the build bar when
 *  a Prism is selected, so the keeper is choosing a chain, not a number.
 *  Kept short on purpose — the build bar has one line for the offer. */
export function prismUpgradeText(level) {
  const next = prismStatsAt(level + 1);
  const parts = [`LV${level + 1}`, `${next.links} links`];
  if (next.splash) parts.push('spray');
  return parts.join(' · ');
}

/** Whether a Prism of this level lights more than one enemy — the test
 *  the world uses to decide whether a shot is a chain or a single beam.
 *  A level-1 Prism already chains, so this is always true; it exists so
 *  the rule is named, not assumed, and so a future level-0 Prism (a
 *  broken one, a cursed one) would fall back to a single beam. */
export function prismChains(level) {
  return prismLinks(level) > 1;
}

