// Ridgeline Run — hand-in program.
//
// The entry is the plain static site under game/ plus the screenshots under
// screenshots/. This program publishes them the way the bounty expects: it
// copies both trees next to dossier.json in the output directory and lets the
// vendored make.fun library describe them.
//
// Output directory: /output inside the grader, $MAKEFUN_OUTPUT_DIR elsewhere.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps below mirror the scorer's own limits, so a run fails loudly here
// rather than silently shipping an entry the gate would reject. Two of those
// checks (symlinks, index.html size) are cheap to make ourselves before the
// copy, so a broken tree is reported against the repo rather than /output.

import { cpSync, existsSync, mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_DIR = join(repoRoot, 'game');
const SHOTS_DIR = join(repoRoot, 'screenshots');
const OUT_GAME = join(outputDir, 'game');
const OUT_SHOTS = join(outputDir, 'screenshots');

if (!existsSync(GAME_DIR)) {
  throw new Error(`no game directory at ${GAME_DIR}`);
}

const indexHtml = join(GAME_DIR, 'index.html');
if (!existsSync(indexHtml) || statSync(indexHtml).size > 1048576) {
  throw new Error('game/index.html must exist and stay under 1 MiB');
}
assertPlainTree(GAME_DIR);

// Publish the game tree first: plain files only, exactly as served locally.
mkdirSync(outputDir, { recursive: true });
cpSync(GAME_DIR, OUT_GAME, { recursive: true });

// Screenshots are optional at build time but always copied when present.
mkdirSync(OUT_SHOTS, { recursive: true });
if (existsSync(SHOTS_DIR)) {
  cpSync(SHOTS_DIR, OUT_SHOTS, { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// A short, human-readable receipt of what was published (not part of the
// dossier; the scorer reads dossier.json only).
const counts = countTree(OUT_GAME);
console.log(
  `ridgeline-run: ${counts.files} game files, ${counts.bytes} bytes; dossier ${dossier.byteLength} bytes -> ${outputDir}`,
);

function countTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    } else {
      throw new Error(`unexpected non-file entry in game/: ${relative(repoRoot, full)}`);
    }
  }
  return { files, bytes };
}

// The gate refuses a game/ holding a symlink, so refuse it here first: every
// entry must be a directory or a regular file, and nothing else.
function assertPlainTree(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink in game/: ${relative(repoRoot, full)}`);
    }
    if (entry.isDirectory()) assertPlainTree(full);
    else if (!entry.isFile()) throw new Error(`non-regular entry in game/: ${relative(repoRoot, full)}`);
  }
}
