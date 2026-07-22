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

The library page includes a date-range picker and a **Download ZIP** button. The ZIP is built in the browser (no server needed) from the tracks in the selected range, with each MP3 renamed from its metadata:

```text
2026-07-22 - Jordan Patterson - Cinderella.mp3
```

Leave the dates at their defaults to download the entire archive. The button label shows how many tracks the current range covers; while a ZIP is building it turns into a Cancel button with a progress bar.

## Link-only mode

If you ever want to avoid storing MP3 files and only point at KCRW's current URLs:

```bash
ARCHIVE_AUDIO=false npm run update
```
