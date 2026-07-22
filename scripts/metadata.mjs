import { rename } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALBUM_TITLE = "Today's Top Tune";
export const ALBUM_ARTIST = "KCRW";

// KCRW feed titles usually arrive as `Artist ‘Title’` (curly quotes) with no
// separate artist field, or occasionally as `Artist - Title`.
export const titleParts = (rawTitle) => {
  const title = String(rawTitle || "").replace(/\s+/g, " ").trim();
  const quoted = title.match(/^(.+?)\s*[‘’'"]\s*(.+?)\s*[‘’'"]?\s*$/u);
  if (quoted) return { artist: quoted[1].trim(), title: quoted[2].trim() };
  const split = title.match(/^(.+?)\s+-\s+(.+)$/);
  if (split) return { artist: split[1].trim(), title: split[2].trim() };
  return { title, artist: "" };
};

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const ffmpeg = spawn("ffmpeg", args);
  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => { stderr += chunk; });
  ffmpeg.on("error", (error) => {
    reject(new Error(`Could not run ffmpeg. Install ffmpeg first. ${error.message}`));
  });
  ffmpeg.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-400)}`));
  });
});

// Writes ID3v2.3 tags (stream copy, no re-encode) so the files sort properly
// in Apple Music: artist/title per track, album exactly "Today's Top Tune".
export const tagAudio = async (fileUrl, { artist, title, date, trackNumber }) => {
  const source = fileURLToPath(fileUrl);
  const temporary = `${source}.tagging.mp3`;
  const metadata = [
    ["artist", artist || ALBUM_ARTIST],
    ["title", title || ALBUM_TITLE],
    ["album", ALBUM_TITLE],
    ["album_artist", ALBUM_ARTIST],
    ["date", date || ""],
    ["track", trackNumber ? String(trackNumber) : ""]
  ].filter(([, value]) => value);

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", source,
    "-map", "0:a",
    "-codec", "copy",
    "-id3v2_version", "3",
    ...metadata.flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
    temporary
  ];

  await runFfmpeg(args);
  await rename(temporary, source);
};

export const readAlbumTag = async (fileUrl) => {
  const output = await new Promise((resolve, reject) => {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format_tags=album",
      "-of", "default=noprint_wrappers=1:nokey=1",
      fileURLToPath(fileUrl)
    ]);
    let stdout = "";
    probe.stdout.on("data", (chunk) => { stdout += chunk; });
    probe.on("error", reject);
    probe.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe failed (${code})`))));
  });
  return output.trim();
};
