/**
 * Stocks the showroom.
 *
 * 1. Asks GitHub for every repo that has GitHub Pages switched on.
 * 2. Opens each live site in headless Chromium.
 * 3. Saves a still (thumbs/<slug>.jpg) and a 3s hover clip (thumbs/<slug>.mp4).
 * 4. Writes projects.json.
 *
 * If a capture fails, any existing still/clip on disk is kept rather than
 * dropped — a bad run can never blank out a card that was working.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

const USER = process.env.GH_USER || 'jamescamera';
const TOKEN = process.env.GITHUB_TOKEN || '';
const WANT_CLIPS = process.env.SHOWROOM_CLIPS !== '0';

// Repos to keep off the rail.
const EXCLUDE = new Set([
  'showroom',
  `${USER}.github.io`
]);

// Nicer card titles than the repo name.
const TITLES = {
  'Infinite': 'Infinite Camera',
  '5.5': 'Perfect Breath',
  'spiffy': 'ILSC · FM',
  'thecrate': 'THE CRATE'
};

const THUMBS = 'thumbs';
const MANIFEST = 'projects.json';
const SHOT = { width: 900, height: 1125 };
const SETTLE_MS = 2600;
const CLIP_MS = 3400;

async function fetchRepos() {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'showroom-builder' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { headers });
  if (!res.ok) throw new Error(`GitHub said ${res.status}. ${await res.text()}`);

  const repos = await res.json();

  return repos
    .filter(r => !r.fork && r.has_pages && !EXCLUDE.has(r.name))
    .map(r => ({
      slug: r.name,
      name: prettyName(r),
      note: cardNote(r),
      url: r.homepage || `https://${USER}.github.io/${r.name}/`,
      updated: r.pushed_at,
      archived: r.archived,
      thumb: '',
      clip: ''
    }));
}

function prettyName(repo) {
  if (TITLES[repo.name]) return TITLES[repo.name];

  const desc = (repo.description || '').trim();
  const titled = desc.match(/^([^.—|-]{2,40})\s*[—|-]\s*\S/);
  if (titled) return titled[1].trim();

  return repo.name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function cardNote(repo) {
  const desc = (repo.description || '').trim();
  if (!desc) return '';

  const split = desc.match(/^[^.—|-]{2,40}\s*[—|-]\s*(\S.*)$/);
  return split ? split[1].trim() : desc;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

// One browser per site. Slower by a second or so, but a crash on site 3 can no
// longer take out sites 4 through 12.
async function capture(piece) {
  const still = path.join(THUMBS, `${piece.slug}.jpg`);
  const mp4 = path.join(THUMBS, `${piece.slug}.mp4`);
  const videoDir = path.join(THUMBS, `.raw-${piece.slug}`);

  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: SHOT,
      deviceScaleFactor: 2,
      permissions: ['camera', 'microphone'],
      ...(WANT_CLIPS ? { recordVideo: { dir: videoDir, size: SHOT } } : {})
    });

    const page = await context.newPage();

    try {
      await page.goto(piece.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      // Slow or never-idle page — screenshot whatever rendered anyway.
    }

    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: still, type: 'jpeg', quality: 80 });
    piece.thumb = still;

    if (WANT_CLIPS) await page.waitForTimeout(CLIP_MS);
    await context.close();

    if (WANT_CLIPS && await exists(videoDir)) {
      const webm = (await fs.readdir(videoDir)).find(f => f.endsWith('.webm'));
      if (webm) {
        try {
          await run('ffmpeg', [
            '-y', '-i', path.join(videoDir, webm),
            '-vf', `scale=${SHOT.width}:-2`,
            '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
            mp4
          ]);
          piece.clip = mp4;
        } catch (err) {
          console.warn(`  clip skipped: ${err.message.split('\n')[0]}`);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await fs.rm(videoDir, { recursive: true, force: true }).catch(() => {});
  }

  return piece;
}

// Whatever happened, if there's already artwork on disk for this slug, use it.
async function keepWhatWeHave(piece) {
  const still = path.join(THUMBS, `${piece.slug}.jpg`);
  const mp4 = path.join(THUMBS, `${piece.slug}.mp4`);

  if (!piece.thumb && await exists(still)) {
    piece.thumb = still;
    console.log('  reusing existing still');
  }
  if (!piece.clip && await exists(mp4)) piece.clip = mp4;

  return piece;
}

async function main() {
  await fs.mkdir(THUMBS, { recursive: true });

  const repos = await fetchRepos();
  console.log(`${repos.length} repo(s) with Pages enabled`);

  const pieces = [];
  let shot = 0;

  for (const repo of repos) {
    console.log(`→ ${repo.slug}  ${repo.url}`);
    try {
      await capture(repo);
      shot++;
    } catch (err) {
      console.warn(`  capture failed: ${err.message.split('\n')[0]}`);
    }
    pieces.push(await keepWhatWeHave(repo));
  }

  if (!pieces.length) {
    console.log('Nothing found — leaving the existing manifest alone.');
    return;
  }

  await fs.writeFile(
    MANIFEST,
    JSON.stringify({ generated: new Date().toISOString(), user: USER, projects: pieces }, null, 2)
  );

  const withArt = pieces.filter(p => p.thumb).length;
  console.log(`Wrote ${MANIFEST}: ${pieces.length} piece(s), ${withArt} with artwork, ${shot} freshly shot.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
