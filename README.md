# KCRW Today's Top Tune

A small GitHub Pages app that refreshes KCRW's "Today's Top Tune" library every weekday, saves a personal MP3 archive, and gives you an in-browser player with download links.

By default, the updater stores MP3 files in `docs/tracks/` so the site keeps working after KCRW's weekday download links rotate. Keep the repository and Pages site private/personal unless you have permission to redistribute the files.

## Local use

```bash
npm run update
npm run serve
```

Then open `http://localhost:4173`.

## GitHub Pages setup

1. Push this folder to a GitHub repository.
2. In the repository settings, enable GitHub Pages with GitHub Actions as the source.
3. The workflow in `.github/workflows/update-pages.yml` runs every weekday at 7:20 AM Pacific time, downloads the current track, updates `docs/data/tracks.json`, commits the change, and deploys the site.

Run the workflow manually from the Actions tab any time you want an immediate refresh.

## Bulk downloads

The library page includes a date-range picker and a **Download ZIP** button. The ZIP is built in the browser (no server needed) from the tracks in the selected range, with each MP3 named from its metadata:

```text
Jordan Patterson - Cinderella.mp3
```

Leave the dates at their defaults to download the entire archive. The button label shows how many tracks the current range covers; while a ZIP is building it turns into a Cancel button with a progress bar.

## ID3 metadata

Every archived MP3 is tagged (ID3v2.3, stream copy — no re-encode) so imports into Apple Music/iTunes sort cleanly:

- **Artist / Title** from the track metadata
- **Album**: exactly `Today's Top Tune`
- **Album artist**: `KCRW` (keeps the album grouped as one compilation)
- **Track number**: chronological library position, and the air date as the year tag

`node scripts/tag-existing.mjs` re-tags any already-archived files that predate this behavior; it is idempotent and skips files that are already tagged.

## Archive size

The library keeps the most recent 180 tracks in `docs/data/tracks.json` (`MAX_TRACKS` in `scripts/update-kcrw.mjs`). Older MP3 files are not deleted automatically.

## Link-only mode

If you ever want to avoid storing MP3 files and only point at KCRW's current URLs:

```bash
ARCHIVE_AUDIO=false npm run update
```
