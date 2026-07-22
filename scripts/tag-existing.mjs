import { readFile, writeFile } from "node:fs/promises";
import { ALBUM_TITLE, readAlbumTag, tagAudio, titleParts } from "./metadata.mjs";

// One-time backfill: writes ID3 tags (artist/title/album "Today's Top Tune")
// into every already-archived MP3 and records a chronological trackNumber in
// tracks.json. Safe to re-run — files that already carry the album tag are
// skipped.

const ROOT = new URL("..", import.meta.url);
const DATA_FILE = new URL("docs/data/tracks.json", ROOT);
const TRACK_DIR = new URL("docs/tracks/", ROOT);

const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
const chronological = [...(data.tracks || [])].sort(
  (a, b) => new Date(a.publishedAt) - new Date(b.publishedAt) || a.id.localeCompare(b.id)
);

let tagged = 0;
let skipped = 0;
let missing = 0;

for (const [index, track] of chronological.entries()) {
  track.trackNumber = index + 1;

  if (!track.artist) {
    const parts = titleParts(track.title);
    track.artist = parts.artist;
    track.title = parts.title;
  }

  if (!track.audioUrl?.startsWith("./tracks/")) {
    missing += 1;
    continue;
  }

  const filename = track.audioUrl.replace("./tracks/", "");
  const file = new URL(filename, TRACK_DIR);
  const album = await readAlbumTag(file).catch(() => "");
  if (album === ALBUM_TITLE) {
    skipped += 1;
    continue;
  }

  await tagAudio(file, {
    artist: track.artist,
    title: track.title,
    date: track.publishedAt.slice(0, 10),
    trackNumber: track.trackNumber
  });
  tagged += 1;
  console.log(`Tagged #${track.trackNumber}: ${track.artist} - ${track.title}`);
}

await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Done: ${tagged} tagged, ${skipped} already tagged, ${missing} without local audio.`);
