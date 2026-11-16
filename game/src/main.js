// NEON VOID boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between four screens: title, play, paused and
// game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|action|over (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, FIELD, PLAYER, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_HIT, EVENT_NOVA, EVENT_OVER, EVENT_SECTOR, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let isNewBest = false;
  let accumulator = 0;
  let last = performance.now();
  let laserTimer = 0;
  let novaQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    laserTimer = 0;
    novaQueued = false;
    isNewBest = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce(`Playing. ${world.state.player.lives} ships. Wave 1.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  /** Keyboard first; else the ship steers toward the pointer. */
  function movement() {
    const kb = input.direction();
    if (kb.x !== 0 || kb.y !== 0) return kb;
    const ptr = input.pointer();
    if (!ptr) return { x: 0, y: 0 };
    const dx = ptr.x - world.state.player.x;
    const dy = ptr.y - world.state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) return { x: 0, y: 0 };
    const s = Math.min(1, dist / 90);
    return { x: (dx / dist) * s, y: (dy / dist) * s };
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_NOVA) novaQueued = true;
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title idles over a live demo: the ship weaves and fires on its own.
      const sway = Math.sin(world.state.time * 0.9) * 0.6;
      world.step(STEP, { x: sway, y: 0 }, true, false, true);
      return;
    }
    const firing = input.firing();
    const beforeNova = world.state.player.nova;
    const beforeCores = world.state.player.coresBanked;
    const useNova = novaQueued;
    novaQueued = false;
    const events = world.step(STEP, movement(), firing, useNova, false);
    if (firing) {
      laserTimer -= STEP;
      if (laserTimer <= 0) {
        laserTimer = PLAYER.fireInterval;
        audio.laser();
      }
    } else {
      laserTimer = 0;
    }
    if (world.state.player.nova > beforeNova) audio.novaReady();
    else if (world.state.player.coresBanked > beforeCores) audio.pickup();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_SECTOR) audio.sectorClear();
    if (events & EVENT_HIT) {
      audio.playerHit();
      announce(world.state.player.lives === 1 ? 'Hit. 1 ship left.' : `Hit. ${world.state.player.lives} ships left.`);
    }
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, isNewBest);
  }

  // Leaving the tab pauses a running game rather than letting the swarm in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Void. Press Space or click to launch.');
  // A handle for automated play-tests (and curious players): the live world,
  // the current screen and the best score. It changes nothing in the game.
  window.__neonVoid = {
    world,
    getScreen: () => screen,
    getBest: () => best,
  };
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
