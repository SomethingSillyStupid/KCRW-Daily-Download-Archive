import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const ROOT = new URL("..", import.meta.url);
const DATA_FILE = new URL("docs/data/tracks.json", ROOT);
const TRACK_DIR = new URL("docs/tracks/", ROOT);
const LATEST_URL = "https://www.kcrw.com/shows/todays-top-tune/latest";
const FEED_URL = "https://feed.cdnstream1.com/zjb/feed/download/0c/01/c0/0c01c01b-56b7-4df8-8efb-6a7162abcfb8.xml";
const ARCHIVE_AUDIO = process.env.ARCHIVE_AUDIO !== "false";
const MAX_TRACKS = Number(process.env.MAX_TRACKS || 90);

const decodeEntities = (value = "") => value
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .trim();

const stripHtml = (value = "") => decodeEntities(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const textFor = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
};

const attrFor = (xml, tag, attr) => {
  const tagMatch = xml.match(new RegExp(`<${tag}\\b([^>]*)>`, "i"));
  if (!tagMatch) return "";
  const attrMatch = tagMatch[1].match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return attrMatch ? decodeEntities(attrMatch[1]) : "";
};

const idFor = (publishedAt, title) => createHash("sha1")
  .update(`${publishedAt}:${title}`)
  .digest("hex")
  .slice(0, 12);

const titleParts = (rawTitle) => {
  const title = rawTitle.replace(/\s+/g, " ").trim();
  const split = title.match(/^(.+?)\s+-\s+(.+)$/);
  if (!split) return { title, artist: "" };
  return { artist: split[1].trim(), title: split[2].trim() };
};

const readExisting = async () => {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    return { updatedAt: null, source: LATEST_URL, tracks: [] };
  }
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "KCRW Daily Download updater (+https://github.com/)"
    }
  });
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  return response.text();
};

const fetchFeedTracks = async () => {
  const xml = await fetchText(FEED_URL);
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  return items.map((item) => {
    const rawTitle = textFor(item, "title");
    const { artist, title } = titleParts(rawTitle);
    const enclosureUrl = attrFor(item, "enclosure", "url");
    const audioUrl = enclosureUrl || textFor(item, "guid");
    const publishedAt = new Date(textFor(item, "pubDate")).toISOString();
    return {
      id: idFor(publishedAt.slice(0, 10), rawTitle),
      title,
      artist,
      summary: stripHtml(textFor(item, "description")),
      publishedAt,
      sourceUrl: textFor(item, "link") || LATEST_URL,
      audioUrl
    };
  }).filter((track) => track.audioUrl);
};

const archiveTrack = async (track, existingTracks) => {
  const existing = existingTracks.find((candidate) => candidate.id === track.id);
  if (existing?.audioUrl?.startsWith("./tracks/")) {
    return {
      ...track,
      originalAudioUrl: existing.originalAudioUrl || track.audioUrl,
      audioUrl: existing.audioUrl
    };
  }

  await mkdir(TRACK_DIR, { recursive: true });
  const filename = `${track.publishedAt.slice(0, 10)}-${track.id}.mp3`;
  const relative = `./tracks/${filename}`;
  const destination = new URL(filename, TRACK_DIR);
  const temporary = new URL(`${filename}.tmp`, TRACK_DIR);

  const response = await fetch(track.audioUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${track.audioUrl}: ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(temporary));
  await rename(temporary, destination);
  return { ...track, originalAudioUrl: track.audioUrl, audioUrl: relative };
};

const mergeTracks = (incoming, existing) => {
  const byId = new Map();
  for (const track of [...incoming, ...(existing.tracks || [])]) {
    if (!byId.has(track.id)) byId.set(track.id, track);
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_TRACKS);
};

const main = async () => {
  const existing = await readExisting();
  const feedTracks = await fetchFeedTracks();

  const incoming = ARCHIVE_AUDIO
    ? await Promise.all(feedTracks.map((track) => archiveTrack(track, existing.tracks || [])))
    : feedTracks;

  const data = {
    updatedAt: new Date().toISOString(),
    source: LATEST_URL,
    archiveAudio: ARCHIVE_AUDIO,
    tracks: mergeTracks(incoming, existing)
  };

  await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${data.tracks.length} tracks. Audio archive: ${ARCHIVE_AUDIO ? "on" : "off"}.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
