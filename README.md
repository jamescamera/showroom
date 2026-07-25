# Showroom

An index of the live projects. Each piece is a card: still image, hover clip, link out.
The rail restocks itself from GitHub every night.

## How a project gets on the rail

It already is. Any repo of yours with **GitHub Pages switched on** appears automatically.
Build a new site, enable Pages, and it's on the rail by morning.

To see it immediately: **Actions → Restock showroom → Run workflow**.

To keep a repo *off* the rail, add its name to the `EXCLUDE` list at the top of
`scripts/build-showroom.mjs`.

## Card copy

- **Title** — from the `TITLES` map in the script, else the repo description up to a
  dash, else the repo name tidied up.
- **Description** — the rest of the repo description. Optional. Set it on GitHub via
  the gear beside **About** (desktop layout only — mobile hides it).

## Setup, once

1. Create a repo called `showroom`, drop these files in, push to `main`.
2. **Settings → Pages →** source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. **Settings → Actions → General → Workflow permissions →** *Read and write permissions*.
4. Run the workflow manually to build the first `projects.json`.

Live at `https://<you>.github.io/showroom/`.

## Running it locally

```bash
npm install playwright
npx playwright install chromium
node scripts/build-showroom.mjs
```

`ffmpeg` needs to be on your PATH for the hover clips. Without it you still get stills.

## Notes

- Archived repos still appear, marked **Archived** and dimmed.
- Camera-based projects are captured with a fake webcam feed so they render something
  rather than an unanswered permission prompt.
- If the run finds nothing, it leaves the existing manifest alone rather than emptying
  the site.
- Until `projects.json` exists, the page shows a small hardcoded seed list at the
  bottom of `index.html`. Delete that block once the real manifest is building.
