// Keyboard and mouse, read every frame: a movement vector, whether the trigger is
// held, the pointer's place on the playfield, and one-shot actions (confirm, pause,
// nova, mute, and the build actions) that the loop consumes once. A click also
// reports its field point, so the game can place or select a turret with it.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOVA = 4;
export const ACTION_MUTE = 8;
export const ACTION_BUILD_PULSE = 16;
export const ACTION_BUILD_LANCE = 32;
export const ACTION_BUILD_NOVA = 64;
export const ACTION_REKINDLE = 128;
export const ACTION_MEND = 256;
export const ACTION_FIRE = 512;
export const ACTION_HULL = 1024;
export const ACTION_UPGRADE = 2048;

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  let pointer = null;
  let pointerActive = false;
  let mouseHeld = false;
  let clickPoint = null;

  function fieldPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD.width,
      y: ((clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  function onKeyDown(event) {
    const key = event.key;
    if (key === ' ' || key.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;
    keys.add(key.length === 1 ? key.toLowerCase() : key);
    if (key === ' ' || key === 'Enter') queued |= ACTION_CONFIRM;
    if (key === 'p' || key === 'P' || key === 'Escape') queued |= ACTION_PAUSE;
    if (key === 'x' || key === 'X') queued |= ACTION_NOVA;
    if (key === 'm' || key === 'M') queued |= ACTION_MUTE;
    if (key === '1') queued |= ACTION_BUILD_PULSE;
    if (key === '2') queued |= ACTION_BUILD_LANCE;
    if (key === '3') queued |= ACTION_BUILD_NOVA;
    if (key === 'r' || key === 'R') queued |= ACTION_REKINDLE;
    if (key === 'b' || key === 'B') queued |= ACTION_MEND;
    if (key === 'f' || key === 'F') queued |= ACTION_FIRE;
    if (key === 'h' || key === 'H') queued |= ACTION_HULL;
    if (key === 'u' || key === 'U') queued |= ACTION_UPGRADE;
  }

  function onKeyUp(event) {
    const key = event.key;
    keys.delete(key.length === 1 ? key.toLowerCase() : key);
  }

  function onPointerMove(event) {
    pointer = fieldPoint(event.clientX, event.clientY);
    pointerActive = true;
  }

  function onPointerDown(event) {
    pointer = fieldPoint(event.clientX, event.clientY);
    pointerActive = true;
    if (event.button === 2) {
      queued |= ACTION_NOVA;
    } else {
      mouseHeld = true;
      clickPoint = pointer;
      queued |= ACTION_CONFIRM;
    }
  }

  function onPointerUp(event) {
    if (event.button !== 2) mouseHeld = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  function down(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    /** Normalised keyboard movement vector, or {x:0,y:0} when no key is held. */
    direction() {
      const x = (down('ArrowRight', 'd') ? 1 : 0) - (down('ArrowLeft', 'a') ? 1 : 0);
      const y = (down('ArrowDown', 's') ? 1 : 0) - (down('ArrowUp', 'w') ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The pointer's place on the playfield, or null when it has never moved. */
    pointer() {
      return pointerActive ? pointer : null;
    },
    /** Space or the left mouse button is held. */
    firing() {
      return keys.has(' ') || mouseHeld;
    },
    /** One-shot actions since the last call; each is delivered once. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    /** The last click's field point, once; null when there was no click. */
    takeClick() {
      const point = clickPoint;
      clickPoint = null;
      return point;
    },
  };
}
