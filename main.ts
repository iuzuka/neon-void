// LUMEN VOID's entrypoint (Node 22, standard library only). The game itself
// is this directory's game/ folder: plain static files a desktop browser loads
// offline (game/index.html plus its ES modules, no library, no network
// request). This program hands the game in. It copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, using the vendored make.fun library.
//
// Before anything is copied, it runs a pre-flight check: the scorer refuses
// an entry that breaks its caps, so a bad hand-in is caught here, loudly,
// instead of being discovered after the fact. The caps come from the
// scorer's own gate (reference/gate.json).
//
// Serve the game locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps: only text_max_bytes shapes the dossier's bytes. The
// rest refuse an entry the scorer would refuse — more than 4 screenshots or
// one over 256 KiB; more than 993 files in game/ or 48 MiB of game files in
// all; or a path under game/ over 1000 bytes. (game/ counts beside /output's
// own 1000-entry cap, its screenshots/ and dossier.json.)
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Walk a directory tree and collect every file's path and size.
function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else found.push({ path, bytes: info.size });
    }
  };
  walk(root);
  return found;
}

// Pre-flight: refuse to hand in an entry the scorer would refuse, and say
// exactly which cap it breaks so the fix is obvious. Returns a list of
// problems; an empty list means the entry is safe to hand in.
function preflight() {
  const problems = [];
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');

  if (!existsSync(join(gameDir, 'index.html'))) {
    problems.push('game/index.html is missing — the browser has no entrypoint');
  }
  if (!existsSync(join(gameDir, 'src', 'main.js'))) {
    problems.push('game/src/main.js is missing — the game has no boot module');
  }
  if (existsSync(gameDir)) {
    const files = listFiles(gameDir);
    if (files.length > DOSSIER_LIMITS.game_max_files) {
      problems.push(`game/ holds ${files.length} files, over the cap of ${DOSSIER_LIMITS.game_max_files}`);
    }
    const total = files.reduce((sum, f) => sum + f.bytes, 0);
    if (total > DOSSIER_LIMITS.game_max_bytes) {
      problems.push(`game/ totals ${total} bytes, over the cap of ${DOSSIER_LIMITS.game_max_bytes}`);
    }
    for (const f of files) {
      if (Buffer.byteLength(f.path) > DOSSIER_LIMITS.game_path_max_bytes) {
        problems.push(`path too long: ${f.path}`);
      }
    }
  }
  if (existsSync(shotsDir)) {
    const shots = listFiles(shotsDir);
    if (shots.length > DOSSIER_LIMITS.screenshots.max) {
      problems.push(`${shots.length} screenshots, over the cap of ${DOSSIER_LIMITS.screenshots.max}`);
    }
    for (const shot of shots) {
      if (shot.bytes > DOSSIER_LIMITS.screenshots.max_bytes) {
        problems.push(`screenshot ${shot.path} is ${shot.bytes} bytes, over the cap of ${DOSSIER_LIMITS.screenshots.max_bytes}`);
      }
    }
  }
  return problems;
}

function handIn() {
  const problems = preflight();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`pre-flight: ${problem}`);
    throw new Error(`hand-in refused: ${problems.length} pre-flight problem(s)`);
  }
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_LIMITS));
}

handIn();
