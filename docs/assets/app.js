import { zipSync } from "../vendor/fflate.js";

const state = {
  tracks: [],
  currentIndex: 0,
  isShuffle: false,
  history: [],
  dateFrom: "",
  dateTo: "",
  zipRunning: false,
  zipAbort: null
};

const audio = document.querySelector("#audio");
const playButton = document.querySelector("#playButton");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const shuffleButton = document.querySelector("#shuffleButton");
const trackList = document.querySelector("#trackList");
const nowTitle = document.querySelector("#nowTitle");
const nowMeta = document.querySelector("#nowMeta");
const updatedAt = document.querySelector("#updatedAt");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const fromDate = document.querySelector("#fromDate");
const toDate = document.querySelector("#toDate");
const clearDates = document.querySelector("#clearDates");
const zipButton = document.querySelector("#zipButton");
const zipProgress = document.querySelector("#zipProgress");
const zipBarFill = document.querySelector("#zipBarFill");
const zipStatus = document.querySelector("#zipStatus");

const formatDate = (value) => {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
};

const formatBytes = (bytes) => {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

// KCRW feed titles often arrive as `Artist ‘Title’` with no separate artist
// field, so split that shape when the artist is missing.
const QUOTED_TITLE = /^(.+?)\s*[‘’'"]\s*(.+?)\s*[‘’'"]?\s*$/u;

const displayParts = (track) => {
  let artist = (track.artist || "").trim();
  let title = (track.title || "").trim();
  if (!artist && title) {
    const match = title.match(QUOTED_TITLE);
    if (match) {
      artist = match[1].trim();
      title = match[2].trim();
    }
  }
  return { artist, title };
};

const sanitizeName = (value) => value
  .normalize("NFC")
  .replace(/[/\\:*?"<>|\x00-\x1F]/g, "")
  .replace(/\s+/g, " ")
  .replace(/^[\s.]+/, "")
  .replace(/[\s.]+$/, "")
  .trim();

const truncateFileName = (name, maxLength = 150) => {
  const chars = Array.from(name);
  if (chars.length <= maxLength) return name;
  const stem = chars.slice(0, maxLength - 4).join("").replace(/[\s.]+$/, "");
  return `${stem}.mp3`;
};

const downloadName = (track) => {
  const { artist, title } = displayParts(track);
  const safe = sanitizeName(`${artist || "KCRW"} - ${title || "Today's Top Tune"}`);
  return truncateFileName(`${safe || "todays-top-tune"}.mp3`);
};

const zipEntryName = (track, usedNames) => {
  const { artist, title } = displayParts(track);
  const base = sanitizeName(`${artist || "KCRW"} - ${title || "Today's Top Tune"}`);
  const name = truncateFileName(`${base || "todays-top-tune"}.mp3`);
  let candidate = name;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = name.replace(/\.mp3$/i, ` (${counter}).mp3`);
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

const trackDate = (track) => (track.publishedAt || "").slice(0, 10);

const dateFilteredTracks = () => {
  const from = state.dateFrom;
  const to = state.dateTo;
  const [lo, hi] = from && to && from > to ? [to, from] : [from, to];
  return state.tracks.filter((track) => {
    const day = trackDate(track);
    if (lo && day < lo) return false;
    if (hi && day > hi) return false;
    return true;
  });
};

const visibleTracks = () => {
  const query = searchInput.value.trim().toLowerCase();
  const dated = dateFilteredTracks();
  if (!query) return dated;
  return dated.filter((track) => {
    const { artist, title } = displayParts(track);
    return [title, artist, track.summary]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(query));
  });
};

const renderNowPlaying = () => {
  const track = state.tracks[state.currentIndex];
  if (!track) {
    nowTitle.textContent = "No tracks yet";
    nowMeta.textContent = "Run the updater to fill the library.";
    return;
  }

  const { artist, title } = displayParts(track);
  nowTitle.textContent = title || "Today's Top Tune";
  nowMeta.textContent = [artist, formatDate(track.publishedAt)]
    .filter(Boolean)
    .join(" · ");
  audio.src = track.audioUrl;
  playButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  renderTracks();
};

const renderTracks = () => {
  const tracks = visibleTracks();
  trackList.innerHTML = "";
  emptyState.hidden = tracks.length > 0;

  for (const track of tracks) {
    const index = state.tracks.findIndex((candidate) => candidate.id === track.id);
    const item = document.createElement("li");
    item.className = "track";
    item.dataset.active = index === state.currentIndex ? "true" : "false";

    const button = document.createElement("button");
    button.className = "track-main";
    button.type = "button";
    button.addEventListener("click", () => playIndex(index));

    const { artist, title } = displayParts(track);

    const titleEl = document.createElement("span");
    titleEl.className = "track-title";
    titleEl.textContent = title || "Today's Top Tune";

    const meta = document.createElement("span");
    meta.className = "track-meta";
    meta.textContent = [artist, formatDate(track.publishedAt)]
      .filter(Boolean)
      .join(" · ");

    const link = document.createElement("a");
    link.className = "download";
    link.href = track.audioUrl;
    link.download = downloadName(track);
    link.textContent = "Download";

    button.append(titleEl, meta);
    item.append(button, link);
    trackList.append(item);
  }

  updateZipButton();
};

const updateZipButton = () => {
  const count = dateFilteredTracks().length;
  if (state.zipRunning) return;
  zipButton.disabled = count === 0;
  zipButton.textContent = count > 0 ? `Download ZIP (${count})` : "Download ZIP";
};

const setZipProgress = ({ done, total, bytes, failures }) => {
  zipProgress.hidden = false;
  zipBarFill.style.width = `${total ? (done / total) * 100 : 0}%`;
  zipStatus.textContent = `Fetching ${done}/${total} tracks · ${formatBytes(bytes)}${failures ? ` · ${failures} failed` : ""}`;
};

const buildZip = async (tracks, { onProgress, signal } = {}) => {
  const files = {};
  const usedNames = new Set();
  const failures = [];
  let done = 0;
  let bytes = 0;
  const queue = [...tracks];

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const track = queue.shift();
      try {
        const response = await fetch(track.audioUrl, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        files[zipEntryName(track, usedNames)] = data;
        done += 1;
        bytes += data.length;
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") {
          throw new DOMException("Aborted", "AbortError");
        }
        failures.push(downloadName(track));
      }
      onProgress?.({ done, total: tracks.length, bytes, failures: failures.length });
    }
  };

  await Promise.all(Array.from({ length: 4 }, worker));
  const zip = zipSync(files, { level: 0 });
  return { zip, failures, bytes };
};

const runZipDownload = async () => {
  if (state.zipRunning) {
    state.zipAbort?.abort();
    return;
  }

  const tracks = dateFilteredTracks();
  if (!tracks.length) return;

  state.zipRunning = true;
  state.zipAbort = new AbortController();
  zipButton.dataset.running = "true";
  zipButton.disabled = false;
  zipButton.textContent = "Cancel";
  zipProgress.hidden = false;
  zipBarFill.style.width = "0%";
  zipStatus.textContent = `Fetching 0/${tracks.length} tracks…`;

  try {
    const { zip, failures, bytes } = await buildZip(tracks, {
      signal: state.zipAbort.signal,
      onProgress: setZipProgress
    });

    const firstDay = trackDate(tracks[tracks.length - 1]);
    const lastDay = trackDate(tracks[0]);
    const blob = new Blob([zip], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kcrw-top-tunes-${firstDay}-to-${lastDay}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    zipBarFill.style.width = "100%";
    const saved = tracks.length - failures.length;
    zipStatus.textContent = `Saved ${saved} track${saved === 1 ? "" : "s"} (${formatBytes(bytes)})${failures.length ? ` — ${failures.length} failed to fetch` : ""}.`;
  } catch (error) {
    if (error?.name === "AbortError") {
      zipStatus.textContent = "Download cancelled.";
      zipBarFill.style.width = "0%";
    } else {
      zipStatus.textContent = `ZIP failed: ${error.message}`;
    }
  } finally {
    state.zipRunning = false;
    state.zipAbort = null;
    zipButton.dataset.running = "false";
    updateZipButton();
  }
};

const randomIndex = () => {
  if (state.tracks.length < 2) return state.currentIndex;
  let next = state.currentIndex;
  while (next === state.currentIndex) {
    next = Math.floor(Math.random() * state.tracks.length);
  }
  return next;
};

const playIndex = async (index) => {
  if (!state.tracks[index]) return;
  if (index !== state.currentIndex) state.history.push(state.currentIndex);
  state.currentIndex = index;
  renderNowPlaying();
  try {
    await audio.play();
  } catch {
    audio.pause();
  }
};

const togglePlay = async () => {
  if (!audio.src) renderNowPlaying();
  if (audio.paused) {
    await audio.play();
  } else {
    audio.pause();
  }
};

const playNext = () => {
  const next = state.isShuffle
    ? randomIndex()
    : (state.currentIndex + 1) % state.tracks.length;
  playIndex(next);
};

const playPrevious = () => {
  const previous = state.history.pop();
  if (previous !== undefined) {
    playIndex(previous);
    return;
  }
  const next = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
  playIndex(next);
};

const syncDateInputs = () => {
  const days = state.tracks.map(trackDate).filter(Boolean).sort();
  const minDay = days[0] || "";
  const maxDay = days[days.length - 1] || "";
  for (const input of [fromDate, toDate]) {
    input.min = minDay;
    input.max = maxDay;
  }
  state.dateFrom = minDay;
  state.dateTo = maxDay;
  fromDate.value = minDay;
  toDate.value = maxDay;
};

const loadTracks = async () => {
  const response = await fetch("./data/tracks.json", { cache: "no-store" });
  const data = await response.json();
  state.tracks = data.tracks || [];
  updatedAt.textContent = data.updatedAt
    ? `Updated ${formatDate(data.updatedAt)}`
    : "Waiting for first update";

  syncDateInputs();
  renderNowPlaying();
  renderTracks();
};

playButton.addEventListener("click", togglePlay);
prevButton.addEventListener("click", playPrevious);
nextButton.addEventListener("click", playNext);
shuffleButton.addEventListener("click", () => {
  state.isShuffle = !state.isShuffle;
  shuffleButton.dataset.active = String(state.isShuffle);
  shuffleButton.setAttribute("aria-pressed", String(state.isShuffle));
});
searchInput.addEventListener("input", renderTracks);
fromDate.addEventListener("change", () => {
  state.dateFrom = fromDate.value;
  renderTracks();
});
toDate.addEventListener("change", () => {
  state.dateTo = toDate.value;
  renderTracks();
});
clearDates.addEventListener("click", () => {
  syncDateInputs();
  renderTracks();
});
zipButton.addEventListener("click", runZipDownload);
audio.addEventListener("play", () => {
  playButton.dataset.playing = "true";
  playButton.setAttribute("aria-label", "Pause");
});
audio.addEventListener("pause", () => {
  playButton.dataset.playing = "false";
  playButton.setAttribute("aria-label", "Play");
});
audio.addEventListener("ended", playNext);

// Small handle for debugging and automated verification.
window.KCRW = {
  state,
  displayParts,
  downloadName,
  zipEntryName,
  dateFilteredTracks,
  buildZip
};

loadTracks();
