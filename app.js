/* Line Dance Library — web (PWA) sibling of the native app.
   Shares the native JSON export schema so a library here imports into the iOS app later. */

// ---- Birthday banner: today only. Set to false tomorrow to remove it. ----
const SHOW_BIRTHDAY = true;

const STORAGE_KEY = "ldb.songs.v1";
const SEED_FLAG = "ldb.seeded.v1";
const ART_KEY = "ldb.art.v1";
const SCHEMA_VERSION = 1;

const DIFFICULTIES = [
  { v: "novice", label: "Novice", rgb: "111,152,103" },
  { v: "intermediate", label: "Intermediate", rgb: "207,148,70" },
  { v: "advanced", label: "Advanced", rgb: "202,115,130" },
];
const STATUSES = [
  { v: "learned", label: "Yup", rgb: "111,152,103" },
  { v: "practicing", label: "Practicing", rgb: "207,148,70" },
  { v: "notLearned", label: "Nope", rgb: "139,130,148" },
];
const NOTE_SVG = '<svg class="note" viewBox="0 0 24 24"><path d="M9 18V5l10-2v13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';

// ---- State ----
let songs = [];
let filterDifficulty = null;
let filterStatus = null;
let searchText = "";
let artCache = {};

const $ = (id) => document.getElementById(id);

// ---- Persistence ----
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function loadSongs() {
  try { songs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { songs = []; }
}
function saveSongs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}
function loadArtCache() {
  try { artCache = JSON.parse(localStorage.getItem(ART_KEY)) || {}; }
  catch { artCache = {}; }
}
function saveArtCache() {
  try { localStorage.setItem(ART_KEY, JSON.stringify(artCache)); } catch {}
}

function searchQuery(title, artist) {
  return [title, artist].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}
function identityKey(s) {
  const isrc = (s.isrc || "").trim().toLowerCase();
  if (isrc) return "isrc:" + isrc;
  return "ta:" + (s.title || "").trim().toLowerCase() + "|" + (s.artist || "").trim().toLowerCase();
}

function seedIfNeeded() {
  if (localStorage.getItem(SEED_FLAG)) return;
  const seed = (window.SEED_SONGS || []).map((s) => ({
    id: uuid(),
    title: s.title,
    artist: s.artist || "",
    isrc: null,
    difficulty: null,
    status: "notLearned",
    spotifyQuery: s.spotifyQuery || searchQuery(s.title, s.artist),
    appleMusicQuery: s.appleMusicQuery || searchQuery(s.title, s.artist),
    spotifyUrl: s.spotifyUrl || "",
    spotifyUri: s.spotifyUri || "",
    video: null,
    dateAdded: new Date().toISOString(),
    source: "imported",
  }));
  songs = seed;
  saveSongs();
  localStorage.setItem(SEED_FLAG, "1");
}

// ---- Helpers ----
function meta(list, v) { return list.find((x) => x.v === v); }
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function spotifyHref(s) {
  if (s.spotifyUrl) return s.spotifyUrl;
  const q = encodeURIComponent(s.spotifyQuery || searchQuery(s.title, s.artist));
  return "https://open.spotify.com/search/" + q;
}
function appleHref(s) {
  const q = encodeURIComponent(s.appleMusicQuery || searchQuery(s.title, s.artist));
  return "https://music.apple.com/search?term=" + q;
}
function videoHref(v) {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

// ---- Album art via Spotify oEmbed (public, no key). Graceful fallback to placeholder. ----
const artObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      loadArt(e.target);
      artObserver.unobserve(e.target);
    }
  }
}, { rootMargin: "200px" });

async function loadArt(el) {
  const url = el.dataset.spotifyurl;
  const id = el.dataset.trackid;
  if (!url || !id) return;
  let thumb = artCache[id];
  if (thumb === undefined) {
    try {
      const res = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(url));
      if (!res.ok) throw new Error("oembed");
      const json = await res.json();
      thumb = json.thumbnail_url || "";
      artCache[id] = thumb;
      saveArtCache();
    } catch {
      thumb = ""; // CORS or offline — keep placeholder, don't retry this session
      artCache[id] = "";
    }
  }
  if (thumb) {
    const img = new Image();
    img.alt = "";
    img.onload = () => { el.innerHTML = ""; el.appendChild(img); };
    img.src = thumb;
  }
}

// ---- Rendering ----
function renderFilters() {
  const row = $("filter-row");
  const groups = [
    { list: DIFFICULTIES, current: filterDifficulty, set: (v) => { filterDifficulty = v; } },
    { list: STATUSES, current: filterStatus, set: (v) => { filterStatus = v; } },
  ];
  row.innerHTML = "";
  groups.forEach((g) => {
    g.list.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "chip" + (g.current === opt.v ? " active" : "");
      b.textContent = opt.label;
      b.onclick = () => { g.set(g.current === opt.v ? null : opt.v); renderFilters(); renderList(); };
      row.appendChild(b);
    });
  });
}

function filteredSongs() {
  const q = searchText.trim().toLowerCase();
  return songs
    .filter((s) => {
      const matchSearch = !q || (s.title || "").toLowerCase().includes(q) || (s.artist || "").toLowerCase().includes(q);
      const matchDiff = !filterDifficulty || s.difficulty === filterDifficulty;
      const matchStatus = !filterStatus || s.status === filterStatus;
      return matchSearch && matchDiff && matchStatus;
    })
    .sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
}

function badgeHtml(m) {
  return `<span class="badge" style="background:rgba(${m.rgb},0.16);color:rgb(${m.rgb})">${m.label}</span>`;
}

function renderList() {
  const list = $("list");
  const items = filteredSongs();
  if (songs.length === 0) {
    list.innerHTML = `<div class="empty">${NOTE_SVG}<h2>No songs yet</h2><p>Tap + to add a song.</p></div>`;
    return;
  }
  let html = `<div class="song-count">${items.length} of ${songs.length} song${songs.length === 1 ? "" : "s"}</div>`;
  if (items.length === 0) {
    html += `<div class="empty">${NOTE_SVG}<h2>No matches</h2><p>Try a different search or filter.</p></div>`;
  } else {
    html += items.map((s) => {
      const diff = s.difficulty ? badgeHtml(meta(DIFFICULTIES, s.difficulty)) : "";
      const stat = badgeHtml(meta(STATUSES, s.status));
      return `<div class="row" data-id="${s.id}">
        <div class="art" data-trackid="${escapeHtml(s.spotifyUrl ? s.spotifyUrl.split('/').pop() : '')}" data-spotifyurl="${escapeHtml(s.spotifyUrl || '')}">${NOTE_SVG}</div>
        <div class="row-main">
          <div class="row-title">${escapeHtml(s.title || "Untitled")}</div>
          ${s.artist ? `<div class="row-artist">${escapeHtml(s.artist)}</div>` : ""}
          <div class="badges">${diff}${stat}</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>`;
    }).join("");
  }
  list.innerHTML = html;
  list.querySelectorAll(".row").forEach((r) => {
    r.onclick = () => openDetail(songs.find((s) => s.id === r.dataset.id));
  });
  list.querySelectorAll(".art").forEach((a) => {
    if (a.dataset.spotifyurl) artObserver.observe(a);
  });
}

// ---- Detail / edit / add ----
function openDetail(existing) {
  const isAdd = !existing;
  const s = existing || {
    id: uuid(), title: "", artist: "", isrc: null, difficulty: null, status: "notLearned",
    spotifyQuery: "", appleMusicQuery: "", spotifyUrl: "", spotifyUri: "", video: null,
    dateAdded: new Date().toISOString(), source: "manual",
  };
  const sheet = $("detail-sheet");

  const segDiff = ["<div class='seg'>"].concat(
    DIFFICULTIES.map((d) => `<button data-diff="${d.v}" class="${s.difficulty === d.v ? "on" : ""}" style="${s.difficulty === d.v ? `background:rgb(${d.rgb})` : ""}">${d.label}</button>`)
  ).concat("</div>").join("");
  const segStat = ["<div class='seg'>"].concat(
    STATUSES.map((d) => `<button data-status="${d.v}" class="${s.status === d.v ? "on" : ""}" style="${s.status === d.v ? `background:rgb(${d.rgb})` : ""}">${d.label}</button>`)
  ).concat("</div>").join("");

  sheet.innerHTML = `
    <div class="detail-head">
      <div class="detail-art" data-trackid="${escapeHtml(s.spotifyUrl ? s.spotifyUrl.split('/').pop() : '')}" data-spotifyurl="${escapeHtml(s.spotifyUrl || '')}">${NOTE_SVG}</div>
      <div style="min-width:0">
        ${isAdd ? "" : `<div class="detail-title">${escapeHtml(s.title || "Untitled")}</div>${s.artist ? `<div class="detail-artist">${escapeHtml(s.artist)}</div>` : ""}`}
      </div>
    </div>
    ${isAdd ? `
      <div class="field-label">Song</div>
      <input class="text-input" id="f-title" placeholder="Title" value="${escapeHtml(s.title)}" />
      <div style="height:8px"></div>
      <input class="text-input" id="f-artist" placeholder="Artist" value="${escapeHtml(s.artist)}" />
    ` : ""}
    <div class="field-label">Difficulty</div>
    ${segDiff}
    <div class="field-label">Status?</div>
    ${segStat}
    <div class="field-label">Reference video</div>
    <input class="text-input" id="f-video" placeholder="Video URL (e.g. YouTube)" value="${escapeHtml(s.video || "")}" />
    <div class="detail-actions">
      ${isAdd ? `<button class="btn btn-primary" id="d-save">Add to Library</button>` : `
        <a class="btn btn-spotify" href="${escapeHtml(spotifyHref(s))}" target="_blank" rel="noopener">Open in Spotify</a>
        <a class="btn btn-secondary" href="${escapeHtml(appleHref(s))}" target="_blank" rel="noopener">Open in Apple Music</a>
        ${videoHref(s.video) ? `<a class="btn btn-secondary" href="${escapeHtml(videoHref(s.video))}" target="_blank" rel="noopener">Open reference video</a>` : ""}
        <button class="btn btn-danger" id="d-delete">Delete song</button>
      `}
      <button class="btn btn-secondary" id="d-done">${isAdd ? "Cancel" : "Done"}</button>
    </div>
  `;

  // difficulty toggle
  sheet.querySelectorAll("[data-diff]").forEach((b) => {
    b.onclick = () => {
      s.difficulty = s.difficulty === b.dataset.diff ? null : b.dataset.diff;
      if (!isAdd) commit(s);
      openDetail(isAdd ? s : songs.find((x) => x.id === s.id));
    };
  });
  // status toggle
  sheet.querySelectorAll("[data-status]").forEach((b) => {
    b.onclick = () => {
      s.status = b.dataset.status;
      if (!isAdd) commit(s);
      openDetail(isAdd ? s : songs.find((x) => x.id === s.id));
    };
  });
  // video edit
  const vid = $("f-video");
  if (vid) vid.onchange = () => { s.video = vid.value.trim() || null; if (!isAdd) commit(s); };

  if (isAdd) {
    $("d-save").onclick = () => {
      const t = ($("f-title").value || "").trim();
      if (!t) { toast("Add a title first"); return; }
      s.title = t;
      s.artist = ($("f-artist").value || "").trim();
      s.video = ($("f-video").value || "").trim() || null;
      s.spotifyQuery = searchQuery(s.title, s.artist);
      s.appleMusicQuery = s.spotifyQuery;
      songs.push(s);
      saveSongs();
      closeDetail();
      renderList();
      toast("Added “" + s.title + "”");
    };
  } else {
    $("d-delete").onclick = () => {
      if (confirm("Delete “" + (s.title || "this song") + "”?")) {
        songs = songs.filter((x) => x.id !== s.id);
        saveSongs();
        closeDetail();
        renderList();
        toast("Deleted");
      }
    };
    const art = sheet.querySelector(".detail-art");
    if (art && art.dataset.spotifyurl) loadArt(art);
  }

  $("d-done").onclick = closeDetail;
  show($("detail-overlay"));
}

function commit(s) {
  const i = songs.findIndex((x) => x.id === s.id);
  if (i >= 0) songs[i] = s;
  saveSongs();
  renderList();
}
function closeDetail() { hide($("detail-overlay")); }

// ---- Export / import ----
function toDTO(s) {
  return {
    title: s.title, artist: s.artist, isrc: s.isrc || null,
    difficulty: s.difficulty || null,
    spotifyQuery: s.spotifyQuery || searchQuery(s.title, s.artist),
    appleMusicQuery: s.appleMusicQuery || searchQuery(s.title, s.artist),
    video: s.video || null,
    spotifyUrl: s.spotifyUrl || null, // extra; native import ignores unknown keys
  };
}
function exportLibrary() {
  const data = { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), songs: songs.map(toDTO) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "line-dance-library.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  hide($("menu-overlay"));
}
function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.songs || [];
      const seen = new Set(songs.map(identityKey));
      let added = 0, skipped = 0;
      incoming.forEach((dto) => {
        const title = (dto.title || "").trim();
        const artist = (dto.artist || "").trim();
        const isrc = (dto.isrc || "").trim();
        if (!title && !isrc) { skipped++; return; }
        const key = identityKey({ title, artist, isrc });
        if (seen.has(key)) { skipped++; return; }
        seen.add(key);
        const q = searchQuery(title || "Untitled", artist);
        songs.push({
          id: uuid(), title: title || "Untitled", artist, isrc: isrc || null,
          difficulty: ["novice", "intermediate", "advanced"].includes(dto.difficulty) ? dto.difficulty : null,
          status: "notLearned",
          spotifyQuery: dto.spotifyQuery || q,
          appleMusicQuery: dto.appleMusicQuery || q,
          spotifyUrl: dto.spotifyUrl || "", spotifyUri: "",
          video: (dto.video || "").trim() || null,
          dateAdded: new Date().toISOString(), source: "imported",
        });
        added++;
      });
      saveSongs();
      renderList();
      hide($("menu-overlay"));
      toast(`Added ${added} song${added === 1 ? "" : "s"}. Skipped ${skipped}.`);
    } catch {
      toast("That file couldn't be imported.");
    }
  };
  reader.readAsText(file);
}

// ---- UI utils ----
function show(el) { el.classList.remove("hidden"); el.setAttribute("aria-hidden", "false"); }
function hide(el) { el.classList.add("hidden"); el.setAttribute("aria-hidden", "true"); }
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// ---- Birthday ----
function maybeBirthday() {
  if (!SHOW_BIRTHDAY) return;
  if (sessionStorage.getItem("ldb.bday.dismissed")) return;
  show($("birthday-overlay"));
}
function dismissBirthday() {
  sessionStorage.setItem("ldb.bday.dismissed", "1");
  hide($("birthday-overlay"));
}

// ---- Wire up ----
function init() {
  loadArtCache();
  loadSongs();
  seedIfNeeded();
  renderFilters();
  renderList();

  $("search").oninput = (e) => { searchText = e.target.value; renderList(); };
  $("add-btn").onclick = () => openDetail(null);
  $("menu-btn").onclick = () => show($("menu-overlay"));
  $("export-btn").onclick = exportLibrary;
  $("import-btn").onclick = () => $("import-file").click();
  $("import-file").onchange = (e) => { if (e.target.files[0]) importLibrary(e.target.files[0]); e.target.value = ""; };

  document.querySelectorAll("[data-close-menu]").forEach((b) => (b.onclick = () => hide($("menu-overlay"))));
  $("menu-overlay").onclick = (e) => { if (e.target.id === "menu-overlay") hide($("menu-overlay")); };
  $("detail-overlay").onclick = (e) => { if (e.target.id === "detail-overlay") closeDetail(); };

  $("birthday-close").onclick = dismissBirthday;
  $("birthday-enter").onclick = dismissBirthday;
  $("birthday-overlay").onclick = (e) => { if (e.target.id === "birthday-overlay") dismissBirthday(); };

  maybeBirthday();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}

init();
