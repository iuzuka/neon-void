// The new mutators — Gilded and Blood Moon — and the rules that make them
// more than a label. A mutator is a trade, and the old four already trade
// in the obvious currencies: thicker hides, faster feet, a smaller light,
// more bodies. These two trade in the one currency the old four never
// touch: prisms. They make a wave harder and richer at the same time, so
// the keeper's choice is not "can I survive this" but "is this wave worth
// farming".
//
// Gilded: every Hollow wears a gilded hide — one more hit to kill — but a
// gilded Hollow drops twice the prisms and is worth half as much score
// again. It is the wave to farm: bring a Prism and a full Nova and the
// wave pays for the next two turrets.
//
// Blood Moon: the moon rises red and the light thins to 85% of itself,
// while the Hollow runs a tenth faster — but every kill pays half as many
// prisms again. It is the wave to endure: the light is small and the
// swarm is quick, and the prisms are the apology.
//
// The numbers live in config.js, beside the old mutators, so the wave
// table and the HUD can read them the same way. This module holds the
// rules config cannot express: how many prisms a kill actually drops,
// what colour the HUD wears for a mutator, which mutators the Endless
// Afterglow may draw, and the one-line trade each mutator offers.

import { MUTATORS } from './config.js';

/** What colour the HUD wears for a mutator's label. The old four are
 *  gold; the new two get their own ink — Gilded is gold too (it is, after
 *  all, gilded), Blood Moon is red, so the keeper knows the moon is up
 *  before reading a word. */
export const MUTATOR_TINTS = {
  darksurge: '#ffd23e',
  swarm: '#ffd23e',
  armored: '#ffd23e',
  swift: '#ffd23e',
  gilded: '#ffe9a3',
  bloodmoon: '#ff5c6e',
};

/** The colour for a mutator's HUD label, falling back to gold for any
 *  mutator this table has never heard of. */
export function mutatorTint(mutId) {
  return MUTATOR_TINTS[mutId] || '#ffd23e';
}

/** How many prisms a kill actually drops. The wave's mutator may multiply
 *  the drop — Gilded doubles it, Blood Moon pays half again — and the
 *  count is rounded so a mutator never pays a fraction of a prism. An
 *  enemy with no prism multiplier on it pays its plain worth. `base` is
 *  the kind's plain prism worth. */
export function prismDropFor(enemy, base) {
  const mult = enemy.prismMult || 1;
  return Math.max(1, Math.round(base * mult));
}

/** The one-line trade each mutator offers, for the title screen and the
 *  dossier: what it costs the keeper and what it pays. The label itself
 *  is the shout; this is the small print. */
export function describeMutator(mutId) {
  const lines = {
    darksurge: 'The light shrinks — rekindle early, fight close.',
    swarm: 'Twice the Hollow, thinner hides — the Prism earns its keep.',
    armored: 'Thick hides, slow march — bring damage, not speed.',
    swift: 'The Hollow runs — it is worth less, so kill it faster.',
    gilded: 'Rich hides, double prisms — the wave to farm.',
    bloodmoon: 'Red light, hungry dark — half as many prisms again.',
  };
  return lines[mutId] || '';
}

/** The mutators the Endless Afterglow may draw, in the order the waves
 *  cycle them. The new two are in the rotation, but rarer than the old
 *  four — the Afterglow is endless, so a rich wave every sixth wave is
 *  plenty, and a red moon every sixth keeps the dark honest without
 *  making every wave a farm. */
export function afterglowMutators() {
  return ['swarm', 'armored', 'swift', 'darksurge', 'gilded', 'bloodmoon'];
}

/** How hard a mutator makes its wave, from 1 (a breeze) to 5 (a wall),
 *  for the title screen and the dossier. The old four are the baseline;
 *  Gilded is a 2 — it is harder to kill but it pays, so a keeper who is
 *  ahead calls it a gift — and Blood Moon is a 4, because a smaller light
 *  is the one hardship no amount of prisms fixes in the moment. */
export function mutatorDifficulty(mutId) {
  const ratings = {
    darksurge: 3,
    swarm: 3,
    armored: 3,
    swift: 2,
    gilded: 2,
    bloodmoon: 4,
  };
  return ratings[mutId] || 3;
}

/** The banner's second line for a mutator wave: the shout and the trade,
 *  in one breath. The world wears this under the wave number, so the
 *  keeper knows the price and the pay before the first Hollow arrives. */
export function mutatorBannerSub(mutId) {
  const mut = MUTATORS[mutId];
  if (!mut) return '';
  const trade = describeMutator(mutId);
  return trade ? `${mut.label}  •  ${trade}` : mut.label;
}

/** Every mutator the game knows, as a small table for the title screen:
 *  its id, its label, and its trade. The title screen builds its mutator
 *  line from this, so adding a mutator to the game adds it to the pitch
 *  without touching the renderer. */
export function mutatorSummary() {
  return Object.keys(MUTATORS).map((id) => ({
    id,
    label: MUTATORS[id].label,
    trade: describeMutator(id),
  }));
}
