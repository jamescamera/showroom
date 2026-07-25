/**
 * Stocks the showroom.
 *
 * 1. Asks GitHub for every repo tagged with TOPIC.
 * 2. Opens each live site in headless Chromium.
 * 3. Saves a still (thumbs/<slug>.jpg) and a 3s hover clip (thumbs/<slug>.mp4).
 * 4. Writes projects.json.
 *
 * Run: node scripts/build-showroom.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

const USER = process.env.GH_USER || 'jamescamera';
const TOPIC = process.env.SHOWROOM_TOPIC || 'showroom';
const TOKEN = process.env.GITHUB_TOKEN || '';

const THUMBS = 'thumbs';
const MANIFEST = 'projects.json';
const SHOT = { width: 900, height: 1125 };   // 4:5, matches the card
const CLIP_MS = 3400;

/* ---------- 1. what's in stock ---------- */

async function fetchRepos() {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'showroom-builder' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { headers });
  if (!res.ok) throw new Error(`GitHub said ${res.status}. ${await res.text()}`);

  const repos = await res.json();

  return repos
    .filter(r => !r.fork && (r.topics || []).includes(TOPIC))
    .map(r => ({
      slug: r.name,
      name: prettyName(r),
      note: r.description || '',
      url: r.homepage || (r.has_pages ? `https://${USER}.github.io/${r.name}/` : ''),
      updated: r.pushed_at,
      archived: r.archived,
      thumb: '',
      clip: ''
    }));
}

// A repo called "5.5" shouldn't be the display name. Prefer the first line of
// the description if it reads like a title, else tidy up the repo name.
function prettyName(repo) {
  const desc = (repo.description || '').trim();
  const titled = desc.match(/^([^.—|]{2,40})\s*[—|]/);
  if (titled) return titled[1].trim();
  return repo.name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------- 2. photograph it ---------- */

async function capture(browser, piece) {
  if (!piece.url) return piece;

  const videoDir = path.join(THUMBS, `.raw-${piece.slug}`);
  const context = await browser.newContext({
    viewport: SHOT,
    deviceScaleFactor: 2,
    permissions: ['camera', 'microphone'],
    recordVideo: { dir: videoDir, size: SHOT }
  });

  const page = await context.newPage();

  try {
    await page.goto(piece.url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    // networkidle never settles on animated pages — that's fine, carry on.
  }

  // Let intros, boot sequences and canvas loops get past frame one.
  await page.waitForTimeout(2200);

  const still = path.join(THUMBS, `${piece.slug}.jpg`);
  await page.screenshot({ path: still, type: 'jpeg', quality: 80 });
  piece.thumb = still;

  await page.waitForTimeout(CLIP_MS);
  await context.close();          // flushes the .webm

  const webm = (await fs.readdir(videoDir)).find(f => f.endsWith('.webm'));
  if (webm) {
    const mp4 = path.join(THUMBS, `${piece.slug}.mp4`);
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
      console.warn(`  clip skipped for ${piece.slug}: ${err.message.split('\n')[0]}`);
    }
  }

  await fs.rm(videoDir, { recursive: true, force: true });
  return piece;
}

/* ---------- 3. write the manifest ---------- */

async function main() {
  await fs.mkdir(THUMBS, { recursive: true });

  const repos = await fetchRepos();
  console.log(`${repos.length} repo(s) tagged "${TOPIC}"`);

  if (!repos.length) {
    console.log('Nothing tagged yet — add the topic to a repo and re-run.');
  }

  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  const pieces = [];
  for (const repo of repos) {
    console.log(`→ ${repo.slug} ${repo.url || '(no live url)'}`);
    try {
      pieces.push(await capture(browser, repo));
    } catch (err) {
      console.warn(`  capture failed: ${err.message.split('\n')[0]}`);
      pieces.push(repo);
    }
  }

  await browser.close();

  await fs.writeFile(
    MANIFEST,
    JSON.stringify({ generated: new Date().toISOString(), user: USER, projects: pieces }, null, 2)
  );

  console.log(`Wrote ${MANIFEST} with ${pieces.length} piece(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
