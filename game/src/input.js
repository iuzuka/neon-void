// Keyboard and mouse, read every frame: a movement vector, whether the trigger is
// held, the pointer's place on the playfield, and one-shot actions (confirm, pause,
// nova, mute) that the loop consumes once.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOVA = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  let pointer = null;
  let pointerActive = false;
  let mouseHeld = false;

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
  };
}
