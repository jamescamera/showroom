# Showroom

An index of the live projects. Each piece is a card: still image, hover clip, link out.
The rail restocks itself from GitHub every night.

## How a project gets on the rail

1. Open the project's repo on GitHub.
2. Click the gear beside **About**.
3. Add the topic **`showroom`**.
4. Put the live URL in the **Website** field.
5. Write a one-line description — it becomes the card copy.

That's it. The next nightly run screenshots the site, records a 3-second clip, and
adds it here. To see it immediately: **Actions → Restock showroom → Run workflow**.

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

- Naming: the card title comes from the part of the repo description before an em dash
  or pipe, so `Perfect Breath — breathe at 5.5 per minute` titles the card *Perfect Breath*.
  No dash, and it falls back to a tidied repo name.
- Archived repos still appear, marked **Archived** and dimmed.
- Camera-based projects are captured with a fake webcam feed so they render something
  rather than an unanswered permission prompt.
- Until `projects.json` exists, the page shows a small hardcoded seed list at the
  bottom of `index.html`. Delete that block once the real manifest is building.
