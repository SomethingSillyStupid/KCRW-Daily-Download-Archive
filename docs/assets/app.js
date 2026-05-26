const state = {
  tracks: [],
  currentIndex: 0,
  isShuffle: false,
  history: []
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

const formatDate = (value) => {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
};

const downloadName = (track) => {
  const safe = `${track.artist || "KCRW"} - ${track.title || "Today's Top Tune"}`
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "todays-top-tune"}.mp3`;
};

const visibleTracks = () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return state.tracks;
  return state.tracks.filter((track) => {
    return [track.title, track.artist, track.summary]
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

  nowTitle.textContent = track.title || "Today's Top Tune";
  nowMeta.textContent = [track.artist, formatDate(track.publishedAt)]
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

    const title = document.createElement("span");
    title.className = "track-title";
    title.textContent = track.title || "Today's Top Tune";

    const meta = document.createElement("span");
    meta.className = "track-meta";
    meta.textContent = [track.artist, formatDate(track.publishedAt)]
      .filter(Boolean)
      .join(" · ");

    const link = document.createElement("a");
    link.className = "download";
    link.href = track.audioUrl;
    link.download = downloadName(track);
    link.textContent = "Download";

    button.append(title, meta);
    item.append(button, link);
    trackList.append(item);
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

const loadTracks = async () => {
  const response = await fetch("./data/tracks.json", { cache: "no-store" });
  const data = await response.json();
  state.tracks = data.tracks || [];
  updatedAt.textContent = data.updatedAt
    ? `Updated ${formatDate(data.updatedAt)}`
    : "Waiting for first update";

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
audio.addEventListener("play", () => {
  playButton.dataset.playing = "true";
  playButton.setAttribute("aria-label", "Pause");
});
audio.addEventListener("pause", () => {
  playButton.dataset.playing = "false";
  playButton.setAttribute("aria-label", "Play");
});
audio.addEventListener("ended", playNext);

loadTracks();
