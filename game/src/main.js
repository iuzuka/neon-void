// LUMEN VOID boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between five
// screens: title, play, paused, victory and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|action|over (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, PLAYER, STEP, UPGRADE } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_BOSS, EVENT_HIT, EVENT_LANTERN_HIT, EVENT_NOVA, EVENT_OVER,
  EVENT_SECTOR, EVENT_WAVE_CLEAR, EVENT_WIN,
} from './world.js';
import {
  ACTION_BUILD_LANCE, ACTION_BUILD_NOVA, ACTION_BUILD_PRISM, ACTION_BUILD_PULSE, ACTION_CONFIRM,
  ACTION_FIRE, ACTION_HULL, ACTION_MEND, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE,
  ACTION_REKINDLE, ACTION_UPGRADE, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

/** The build bar's strip at the bottom of the field, and its item layout. */
const BUILD_BAR_Y = FIELD.height - 34;
const BUILD_BAR_X0 = 16;
const BUILD_BAR_W = 108;
const BUILD_BAR_GAP = 10;
const BUILD_BAR_KEYS = ['1', '2', '3', '4', 'r', 'b', 'f', 'h'];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// The best score lives in local storage so it survives a reload. If storage
// is off (a private window), it just lasts this visit.
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
    // Storage can be off: the best score then lasts this visit only.
  }
}

// Stage a screenshot scene: paint it twice (so the first frame's layout has
// settled) and then flag it ready for the screenshot tool.
function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false, world.lightRadius());
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

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset(false);
    accumulator = 0;
    laserTimer = 0;
    novaQueued = false;
    isNewBest = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce('Playing. Build your turrets, then hold the light.');
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

  function winGame() {
    screen = SCREEN_WIN;
    audio.victory();
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      saveBest(best);
    }
    announce(`Victory. The Hollow Sun has fallen. Score ${world.state.score}.`);
  }

  // Where the ship steers: the keyboard first; otherwise it chases the
  // pointer, slowing as it nears it, and stops within 12 px of it.
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

  // A build-bar item, by its key: pick a turret kind to place, or buy one
  // of the lantern/ship actions. Keys 1-4 toggle the turret choice.
  function buildBarAction(key) {
    const st = world.state;
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      const kind = key === '1' ? 'pulse' : key === '2' ? 'lance' : key === '3' ? 'nova' : 'prism';
      st.buildChoice = st.buildChoice === kind ? null : kind;
      announce(st.buildChoice ? `${kind} turret selected. Click the field to place it.` : 'Turret deselected.');
      return;
    }
    if (key === 'r' && world.rekindle()) { audio.rekindle(); announce('The light is rekindled.'); }
    else if (key === 'b' && world.mend()) { audio.upgrade(); announce('The lantern is mended.'); }
    else if (key === 'f' && world.upgradeFire()) { audio.upgrade(); announce('Fire rate up.'); }
    else if (key === 'h' && world.upgradeHull()) { audio.upgrade(); announce('Hull reinforced. One more ship.'); }
  }

  // A click on the field: place the chosen turret where clicked, or (with
  // nothing chosen) select the turret under the click so U can upgrade it.
  function fieldClick(point) {
    const st = world.state;
    if (st.buildChoice) {
      if (world.placeTurret(st.buildChoice, point.x, point.y)) {
        audio.build();
        announce(`${st.buildChoice} turret placed.`);
        st.buildChoice = null;
      } else {
        announce('Cannot build there — too close to the lantern or another turret, or not enough prisms.');
      }
      return;
    }
    const turret = world.selectTurretAt(point.x, point.y);
    if (turret) announce(`${turret.kind} turret selected. Press U to upgrade it.`);
  }

  // A click anywhere: on the build bar it picks that bar item; on the field
  // it places or selects a turret. A click on the bar's empty right side
  // does nothing.
  function handleClick() {
    const point = input.takeClick();
    if (!point || screen !== SCREEN_PLAY) return;
    if (point.y >= BUILD_BAR_Y) {
      const index = Math.floor((point.x - BUILD_BAR_X0) / (BUILD_BAR_W + BUILD_BAR_GAP));
      if (index >= 0 && index < BUILD_BAR_KEYS.length) {
        const itemX = BUILD_BAR_X0 + index * (BUILD_BAR_W + BUILD_BAR_GAP);
        if (point.x >= itemX && point.x <= itemX + BUILD_BAR_W) {
          buildBarAction(BUILD_BAR_KEYS[index]);
          return;
        }
      }
      return;
    }
    fieldClick(point);
  }

  // Drain the queued input actions for this frame: mute, the Nova, the
  // build keys (while playing), upgrading the selected turret, and the
  // screen changes — start on confirm, endless after a win, fresh game
  // with R on the victory screen, pause and resume.
  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_NOVA) novaQueued = true;
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_BUILD_PULSE) buildBarAction('1');
      if (actions & ACTION_BUILD_LANCE) buildBarAction('2');
      if (actions & ACTION_BUILD_NOVA) buildBarAction('3');
      if (actions & ACTION_BUILD_PRISM) buildBarAction('4');
      if (actions & ACTION_REKINDLE) buildBarAction('r');
      if (actions & ACTION_MEND) buildBarAction('b');
      if (actions & ACTION_FIRE) buildBarAction('f');
      if (actions & ACTION_HULL) buildBarAction('h');
      if (actions & ACTION_UPGRADE) {
        if (world.upgradeSelected()) {
          audio.upgrade();
          announce('Turret upgraded.');
        }
      }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_WIN) {
      // Space / click on the victory screen enters the Endless Afterglow.
      world.continueEndless();
      screen = SCREEN_PLAY;
      announce('The Endless Afterglow. The dark does not end — neither do you.');
    } else if (actions & ACTION_REKINDLE && screen === SCREEN_WIN) {
      // R on the victory screen starts a fresh game.
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    handleClick();
  }

  // One fixed world step, plus its sounds and announcements. On the title
  // screen the world idles as a live demo (the ship weaves and fires on its
  // own). The victory screen is frozen — the Afterglow resumes from there.
  function step() {
    if (screen === SCREEN_TITLE) {
      const sway = Math.sin(world.state.time * 0.9) * 0.6;
      world.step(STEP, { x: sway, y: 0 }, true, false, true);
      return;
    }
    if (screen === SCREEN_WIN) return;
    const firing = input.firing();
    const beforeNova = world.state.player.nova;
    const beforePrisms = world.state.prisms;
    const useNova = novaQueued;
    novaQueued = false;
    const events = world.step(STEP, movement(), firing, useNova, false);
    if (firing) {
      laserTimer -= STEP;
      if (laserTimer <= 0) {
        // The laser sound follows the ship's real fire rate, which quickens
        // with its fire level — not just the base interval.
        laserTimer = PLAYER.fireInterval * Math.pow(UPGRADE.fire.step, world.state.player.fireLevel);
        audio.laser();
      }
    } else {
      laserTimer = 0;
    }
    if (world.state.player.nova > beforeNova) audio.novaReady();
    else if (world.state.prisms > beforePrisms) audio.pickup();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_SECTOR) audio.sectorClear();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_LANTERN_HIT) {
      audio.lanternHit();
      announce(`The Hollow feeds on the lantern. ${Math.ceil(world.state.lantern.hp)} light left.`);
    }
    if (events & EVENT_HIT) {
      audio.playerHit();
      announce(world.state.player.lives === 1 ? 'Hit. 1 ship left.' : `Hit. ${world.state.player.lives} ships left.`);
    }
    if (events & EVENT_WIN) winGame();
    else if (events & EVENT_OVER) endGame();
  }

  // The frame loop: bank real time (capped), run as many fixed steps as it
  // covers, then paint. Pausing or a win/over screen drains the bank so no
  // steps run until play resumes.
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
    renderer.draw(world.state, screen, best, isNewBest, world.lightRadius());
  }

  // Leaving the tab pauses a running game rather than letting the swarm in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Void. Press Space or click to keep the light.');
  // A handle for automated play-tests (and curious players): the live world,
  // the current screen and the best score. It changes nothing in the game.
  window.__lumenVoid = {
    world,
    getScreen: () => screen,
    getBest: () => best,
  };
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
