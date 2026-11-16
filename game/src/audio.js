// Every sound in NEON VOID, synthesised with WebAudio — no audio files, nothing
// loaded over the network. The context is created on the first user gesture; until
// then every call is a safe no-op, so the game plays fine with sound off.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return context !== null;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** A short oscillator blip that slides from `from` Hz to `to` Hz. */
  function blip(from, to, seconds, type, volume) {
    if (!ensure() || muted) return;
    try {
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + seconds);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  /** A burst of filtered noise, for explosions and the Nova. */
  function noise(seconds, cutoff, volume) {
    if (!ensure() || muted) return;
    try {
      const now = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + seconds);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    laser() {
      blip(880, 220, 0.09, 'square', 0.12);
    },
    enemyDown() {
      noise(0.22, 2400, 0.25);
      blip(320, 60, 0.18, 'sawtooth', 0.14);
    },
    playerHit() {
      noise(0.4, 1800, 0.4);
      blip(220, 40, 0.35, 'sawtooth', 0.25);
    },
    pickup() {
      blip(660, 1320, 0.12, 'sine', 0.2);
    },
    novaReady() {
      blip(520, 1040, 0.18, 'triangle', 0.2);
    },
    nova() {
      noise(0.7, 5200, 0.4);
      blip(180, 1400, 0.55, 'sawtooth', 0.16);
    },
    waveClear() {
      blip(523, 523, 0.1, 'triangle', 0.2);
      setTimeout(() => blip(659, 659, 0.1, 'triangle', 0.2), 90);
      setTimeout(() => blip(784, 784, 0.22, 'triangle', 0.22), 180);
    },
    sectorClear() {
      blip(523, 523, 0.12, 'triangle', 0.22);
      setTimeout(() => blip(659, 659, 0.12, 'triangle', 0.22), 110);
      setTimeout(() => blip(784, 784, 0.12, 'triangle', 0.22), 220);
      setTimeout(() => blip(1046, 1046, 0.3, 'triangle', 0.24), 330);
    },
    gameOver() {
      blip(392, 392, 0.2, 'triangle', 0.22);
      setTimeout(() => blip(330, 330, 0.2, 'triangle', 0.22), 190);
      setTimeout(() => blip(262, 196, 0.5, 'triangle', 0.22), 380);
    },
    click() {
      blip(1200, 900, 0.05, 'sine', 0.12);
    },
  };
}
