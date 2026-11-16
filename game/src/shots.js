// The screenshot scenes behind ?shot=start|play|action|over. Each one stages a
// real scene — turrets standing, a wave under way, a boss on screen — then plays
// the rules forward for a fixed number of steps, steered by a simple autopilot
// (dodge what is close above, chase the nearest prism or enemy, fire, spend a Nova
// when the sky is full), so the frame is what a short game really looks like and
// the same seed always gives the same frame.

import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const OVER_LIMIT_SECONDS = 120;

/** Steer the ship: dodge the closest threat above, else chase a prism or an enemy. */
function autopilot(state, skill) {
  const p = state.player;
  if (skill === 0) {
    // A careless pilot: it shoots but never moves and never spends a Nova, so the
    // swarm catches it — the frame ends on the game-over screen.
    return { move: { x: 0, y: 0 }, firing: true, nova: false };
  }
  let moveX = 0;
  for (const e of state.enemies) {
    const dy = p.y - e.y;
    if (dy > 0 && dy < 170 && Math.abs(e.x - p.x) < 70) {
      moveX = e.x < p.x ? 1 : -1;
      break;
    }
  }
  if (moveX === 0) {
    // Incoming plasma is dodged the same way, from further out.
    for (const b of state.enemyBullets) {
      const dy = p.y - b.y;
      if (dy > 0 && dy < 200 && Math.abs(b.x - p.x) < 60) {
        moveX = b.x < p.x ? 1 : -1;
        break;
      }
    }
  }
  if (moveX === 0 && skill === 1) {
    // A sharp pilot chases its next kill; a showy one (skill 2) holds its ground
    // and lets the swarm fill the sky, which is what the action shot wants.
    let target = null;
    for (const c of state.cores) {
      if (target === null || c.y > target.y) target = c;
    }
    if (target === null) {
      for (const e of state.enemies) {
        if (target === null || e.y > target.y) target = e;
      }
    }
    if (target !== null) {
      moveX = target.x > p.x + 10 ? 1 : target.x < p.x - 10 ? -1 : 0;
    }
  }
  return {
    move: { x: moveX, y: 0 },
    firing: true,
    nova: skill === 1 && state.enemies.length > 10 && p.nova > 0,
  };
}

function playForward(world, seconds, skill) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const pilot = autopilot(world.state, skill);
    const events = world.step(STEP, pilot.move, pilot.firing, pilot.nova, false);
    if (events & EVENT_OVER) return true;
  }
  return world.state.player.lives <= 0;
}

/**
 * Set `world` to the named scene (start, play, action or over; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name !== 'play' && name !== 'action' && name !== 'over') {
    // Title: the world idles behind the logo, the ship flying its own demo and
    // the keeper's turrets standing guard.
    world.reset(false);
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      const pilot = autopilot(world.state, 1);
      world.step(STEP, pilot.move, pilot.firing, false, true);
    }
    return { screen: SCREEN_TITLE, best: world.state.score };
  }
  if (name === 'over') {
    // The lantern falls: a careless pilot lets the Hollow feed until the light dies.
    world.reset(false);
    playForward(world, OVER_LIMIT_SECONDS, 0);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'action') {
    // Wave 5, the Warden: three turrets (one a final form), the boss on screen,
    // the sky full, the light holding.
    world.stageScene({
      wave: 5,
      prisms: 260,
      turrets: [
        { kind: 'pulse', x: 380, y: 470, level: 3 },
        { kind: 'lance', x: 900, y: 470, level: 2 },
        { kind: 'nova', x: 640, y: 520, level: 1 },
      ],
      spawn: 12,
    });
    playForward(world, 6, 2);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // Play: wave 3, two turrets up, prisms on the field, the light holding.
  world.stageScene({
    wave: 3,
    prisms: 180,
    turrets: [
      { kind: 'pulse', x: 420, y: 480, level: 1 },
      { kind: 'lance', x: 860, y: 480, level: 1 },
    ],
    spawn: 9,
  });
  playForward(world, 4, 1);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
