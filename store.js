import {
  db, collection, doc, getDocs, getDoc,
  query, where, updateDoc, increment
} from "./firebase.js";
import { state } from "./auth.js";
import {
  $, esc, imgUrl, dlUrl, iconSrc, setTop, toast
} from "./util.js";
import { renderAppVault } from "./vault.js";
import { renderReviews, loadRatings } from "./reviews.js";
import { reportBox } from "./reports.js";
import { getShots } from "./shots.js";
import { loadFavs, isFav, toggleFav } from "./favs.js";
import {
  loadAnnouncement, annHtml, bindAnn
} from "./announce.js";
import {
  baseline, pending, markSeen, markAll
} from "./notify.js";

let cache = null;
let cat = "all";
let search = "";
let flags = {};
let offline = false;
let sort = "new";
let favIds = [];
let ratings = {};
let timer = null;
const DAY = 86400000;

export function clearCache() { cache = null; }

function cacheKey() {
  return "apps_" + (state.admin ? "a" : "u");
}

function readSaved() {
  try {
    const t = localStorage.getItem(cacheKey());
    return t ? JSON.parse(t) : null;
  } catch (e) { return null; }
}

function writeSaved(list) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(list));
  } catch (e) { /* too big or blocked: ignore */ }
}

/* Admin sees every app. Users see published ones only.
   Offline: shows the last saved list. */
export async function loadApps() {
  if (cache) return cache;
  const saved = readSaved();
  if (!navigator.onLine && saved) {
    offline = true;
    cache = saved;
    return cache;
  }
  const col = collection(db, "apps");
  const q = state.admin
    ? col
    : query(col, where("published", "==", true));
  let snap;
  try {
    snap = await getDocs(q);
  } catch (e) {
    if (!saved) throw e;
    offline = true;
    cache = saved;
    return cache;
  }
  offline = false;
  cache = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (b.createdAt || 0) - (a.createdAt || 0));
  writeSaved(cache);
  return cache;
}

export async function getApp(id) {
  const hit = (await loadApps()).find((x) => x.id === id);
  if (hit) return hit;
  const s = await getDoc(doc(db, "apps", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/* ---------- Badges ---------- */
function badge(a) {
  const now = Date.now();
  if (a.createdAt && now - a.createdAt < 14 * DAY) {
    return '<span class="tag new">New</span>';
  }
  const u = Date.parse(a.updated || "");
  if (u && now - u < 14 * DAY) {
    return '<span class="tag new">Updated</span>';
  }
  return "";
}

const isWeb = (a) => a.appType !== "apk";

const WEB_HELP = `
  <ol>
    <li>Tap Open app. It opens in your browser.</li>
    <li>In Chrome, tap the menu (three dots, top right).</li>
    <li>Tap Install app, or Add to Home screen.</li>
    <li>Tap Install (or Add). The icon appears on your
      home screen.</li>
  </ol>
  <p class="mut">If you only see Add to Home screen,
    that is fine. It adds a shortcut to the app.</p>`;

const APK_HELP = `
  <ol>
    <li>Tap Download and wait until it finishes.</li>
    <li>Open the downloaded file from your
      notification or Files app.</li>
    <li>If Android says install is blocked, tap
      Settings and allow "Install unknown apps"
      for your browser, then go back and install.</li>
    <li>If Play Protect warns you, tap
      More details, then Install anyway.</li>
  </ol>`;

function actionHtml(a, dl) {
  if (!dl) return '<p class="mut">No link added yet.</p>';
  const web = isWeb(a);
  return `
    <a id="dlLink" href="${esc(dl)}" target="_blank"
     rel="noopener"><button class="btn block"
     style="margin-top:16px">${
      web ? "Open app" : "Download"}</button></a>
    <details class="help">
      <summary>${web
        ? "How to put it on my phone"
        : "Cannot install? Read this"}</summary>
      ${web ? WEB_HELP : APK_HELP}
    </details>`;
}

function flagTag(t) {
  return t === "new"
    ? '<span class="tag new">New for you</span>'
    : '<span class="tag new">Update available</span>';
}

function banner(p) {
  if (!p.length) return "";
  const items = p.map((x) => `
    <div class="nrow" data-id="${esc(x.app.id)}">
      <b>${esc(x.app.name)}</b>
      <span class="mut">${x.type === "new"
        ? "New app"
        : "Updated to v" + esc(x.app.version || "?")
      }</span>
    </div>`).join("");
  return `
    <div id="ban" class="note">
      <div class="nhead">
        <b>${p.length} ${p.length > 1
          ? "updates" : "update"} for you</b>
        <button id="markAll" class="btn ghost small">
          Mark all read</button>
      </div>
      ${items}
    </div>`;
}

function dateOf(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "-";
}

/* ---------- Home list ---------- */
function avgOf(a) {
  const r = ratings[a.id];
  return r && r.n ? r.sum / r.n : 0;
}

function ratingTag(a) {
  const r = ratings[a.id];
  if (!r || !r.n) return "";
  return `<span class="tag">★ ${
    (r.sum / r.n).toFixed(1)} (${r.n})</span>`;
}

const SORTS = {
  new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  dl: (a, b) => (b.downloads || 0) - (a.downloads || 0),
  rating: (a, b) => avgOf(b) - avgOf(a),
  name: (a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
};

const SORT_NAMES = [
  ["new", "Newest"],
  ["dl", "Most downloaded"],
  ["rating", "Top rated"],
  ["name", "A to Z"]
];

function rows(items) {
  if (!items.length) {
    return '<p class="mut">No apps found.</p>';
  }
  return items.map((a) => `
    <div class="row" data-id="${esc(a.id)}">
      <img class="ico" alt="" loading="lazy"
       src="${esc(iconSrc(a))}">
      <div class="info">
        <b>${esc(a.name)}</b>
        <span class="mut">${esc(a.tagline)}</span>
        <span class="tag">${esc(a.category || "App")}</span>
        <span class="tag">${isWeb(a) ? "Web" : "APK"}</span>
        ${ratingTag(a)}
        ${flags[a.id] ? flagTag(flags[a.id]) : badge(a)}
        ${a.published === false
          ? '<span class="tag warn">Hidden</span>' : ""}
        <span class="mut dl">
          ↓ ${esc(a.downloads || 0)}</span>
      </div>
      <div class="side">
        <button class="heart" data-fav="${esc(a.id)}">${
          favIds.includes(a.id) ? "♥" : "♡"}</button>
        <button class="btn ghost small"
         data-id="${esc(a.id)}">Details</button>
      </div>
    </div>`).join("");
}

function categories(list) {
  const set = {};
  list.forEach((a) => {
    if (a.category) set[a.category] = true;
  });
  return Object.keys(set).sort();
}

function chips(cats) {
  const all = [["all", "All"], ["__fav", "★ Favorites"]]
    .concat(cats.map((c) => [c, c]));
  return all.map((c) => `
    <button class="chip ${cat === c[0] ? "on" : ""}"
     data-c="${esc(c[0])}">${esc(c[1])}</button>`).join("");
}

function filtered(list) {
  const f = search.toLowerCase();
  return list.filter((a) =>
    (cat === "all" ||
      (cat === "__fav"
        ? favIds.includes(a.id) : a.category === cat)) &&
    [a.name, a.tagline, a.category].join(" ")
      .toLowerCase().includes(f)
  ).sort(SORTS[sort]);
}

function featHtml(items) {
  if (!items.length) return "";
  return `<div id="feat" class="feat">${items.map((a) => `
    <div class="fcard" data-id="${esc(a.id)}">
      <img class="ico big" alt=""
       src="${esc(iconSrc(a))}">
      <div class="info">
        <span class="tag new">Featured</span>
        <b>${esc(a.name)}</b>
        <span class="mut">${esc(a.tagline)}</span>
      </div>
    </div>`).join("")}</div>`;
}

/* Moves the featured slider every 5 seconds. */
function startSlider() {
  clearInterval(timer);
  const el = $("feat");
  if (!el || el.children.length < 2) return;
  timer = setInterval(() => {
    const f = $("feat");
    if (!f) {
      clearInterval(timer);
      return;
    }
    const n = f.children.length;
    const i = Math.round(f.scrollLeft / f.clientWidth);
    f.scrollTo({
      left: ((i + 1) % n) * f.clientWidth,
      behavior: "smooth"
    });
  }, 5000);
}

export async function showList() {
  setTop("My App Store", null);
  clearInterval(timer);
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading apps...</p>';
  let list;
  try {
    list = await loadApps();
  } catch (e) {
    v.innerHTML = `
      <p class="err">Could not load apps.
        ${esc(e.code || e.message)}</p>
      <button id="retry" class="btn block"
       style="margin-top:12px">Try again</button>`;
    $("retry").onclick = () => showList();
    return;
  }
  const [ann, favs, rt] = await Promise.all([
    loadAnnouncement().catch(() => null),
    loadFavs(),
    loadRatings()
  ]);
  favIds = favs;
  ratings = rt;
  baseline(list);
  const pend = pending(list);
  flags = {};
  pend.forEach((x) => { flags[x.app.id] = x.type; });
  const cats = categories(list);
  if (cat !== "all" && cat !== "__fav" &&
      !cats.includes(cat)) cat = "all";
  const feat = list.filter((a) =>
    a.featured && a.published !== false);
  v.innerHTML = `
    ${offline
      ? `<div class="note off">You are offline.
          Showing the last saved list.</div>` : ""}
    ${annHtml(ann)}
    ${banner(pend)}
    ${featHtml(feat)}
    <div class="srow">
      <input id="q" class="search" value="${esc(search)}"
       placeholder="Search apps...">
      <select id="sortSel" class="inp sel">${
        SORT_NAMES.map((o) => `
        <option value="${o[0]}"
         ${sort === o[0] ? "selected" : ""}>${
          o[1]}</option>`).join("")}</select>
    </div>
    <div id="chips" class="chips">${chips(cats)}</div>
    <div id="list">${rows(filtered(list))}</div>`;
  const redraw = () => {
    $("list").innerHTML = rows(filtered(list));
  };
  bindAnn(ann);
  startSlider();
  $("q").oninput = (e) => {
    search = e.target.value;
    redraw();
  };
  $("sortSel").onchange = (e) => {
    sort = e.target.value;
    redraw();
  };
  $("chips").onclick = (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    cat = b.dataset.c;
    $("chips").innerHTML = chips(cats);
    redraw();
  };
  $("list").onclick = async (e) => {
    const h = e.target.closest("[data-fav]");
    if (h) {
      try {
        favIds = await toggleFav(h.dataset.fav);
        redraw();
      } catch (err) {
        toast("Could not save favorite");
      }
      return;
    }
    const el = e.target.closest("[data-id]");
    if (el) location.hash = "#/app/" + el.dataset.id;
  };
  const feEl = $("feat");
  if (feEl) {
    feEl.onclick = (e) => {
      const el = e.target.closest("[data-id]");
      if (el) location.hash = "#/app/" + el.dataset.id;
    };
  }
  const ban = $("ban");
  if (ban) {
    ban.onclick = (e) => {
      if (e.target.closest("#markAll")) {
        markAll(list);
        showList();
        return;
      }
      const el = e.target.closest("[data-id]");
      if (el) location.hash = "#/app/" + el.dataset.id;
    };
  }
}

/* ---------- Details ---------- */
export async function showDetails(id) {
  setTop("Details", "#/");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let a;
  try {
    a = await getApp(id);
  } catch (e) {
    a = null;
  }
  if (!a) {
    v.innerHTML = '<p class="err">App not found.</p>';
    return;
  }
  const shots = (a.screenshots || [])
    .map(imgUrl).filter(Boolean)
    .map((u) => `<img src="${esc(u)}" alt=""
      loading="lazy">`).join("");
  const dl = dlUrl(a.downloadUrl);
  await loadFavs();
  const rt = (await loadRatings())[a.id];
  v.innerHTML = `
    <div class="top">
      <img class="ico big" alt=""
       src="${esc(iconSrc(a))}">
      <div class="info">
        <h2>${esc(a.name)}</h2>
        <span class="mut">${esc(a.tagline)}</span>
        <div>${badge(a)}${rt && rt.n
          ? `<span class="tag">★ ${
              (rt.sum / rt.n).toFixed(1)} (${rt.n})</span>`
          : ""}</div>
      </div>
    </div>
    ${actionHtml(a, dl)}
    <div class="btnrow">
      <button id="favBtn" class="btn ghost">${
        isFav(a.id) ? "♥ Saved" : "♡ Save"}</button>
      <button id="shareBtn" class="btn ghost">
        Share</button>
    </div>
    <div class="facts">
      <div class="fact"><span>Version</span>
        ${esc(a.version || "-")}</div>
      <div class="fact"><span>Size</span>
        ${esc(a.size || "-")}</div>
      <div class="fact"><span>Category</span>
        ${esc(a.category || "-")}</div>
      <div class="fact"><span>Updated</span>
        ${esc(a.updated || "-")}</div>
      <div class="fact"><span>Downloads</span>
        <b id="dlCount">${esc(a.downloads || 0)}</b></div>
      <div class="fact"><span>Added</span>
        ${esc(dateOf(a.createdAt))}</div>
    </div>
    ${shots ? `<div class="shots">${shots}</div>` : ""}
    ${a.whatsNew ? `
      <h3>What's new</h3>
      <p class="desc">${esc(a.whatsNew)}</p>` : ""}
    ${(a.history || []).length > 1 ? `
      <details class="help">
        <summary>Version history</summary>
        ${a.history.map((h) => `
          <div class="vh">
            <b>v${esc(h.version)}</b>
            <span class="mut">${esc(h.date || "")}</span>
            <p class="desc">${esc(h.whatsNew || "")}</p>
          </div>`).join("")}
      </details>` : ""}
    <h3>About this app</h3>
    <p class="desc">${esc(a.description || "")}</p>`;
  markSeen(a);
  getShots(a.id).then((imgs) => {
    if (!imgs.length || location.hash !== "#/app/" + a.id) {
      return;
    }
    let box = v.querySelector(".shots");
    if (!box) {
      box = document.createElement("div");
      box.className = "shots";
      v.querySelector(".facts").after(box);
    }
    imgs.slice().reverse().forEach((src) => {
      const im = document.createElement("img");
      im.src = src;
      im.alt = "";
      box.prepend(im);
    });
  });
  const link = $("dlLink");
  if (link) link.onclick = () => countDownload(a);
  $("favBtn").onclick = async () => {
    try {
      const ids = await toggleFav(a.id);
      $("favBtn").textContent =
        ids.includes(a.id) ? "♥ Saved" : "♡ Save";
    } catch (err) {
      toast("Could not save favorite");
    }
  };
  $("shareBtn").onclick = () => share(a);
  if (!state.admin) {
    const rp = document.createElement("div");
    v.appendChild(rp);
    reportBox(a, rp);
  }
  const rbox = document.createElement("div");
  v.appendChild(rbox);
  renderReviews(a, rbox);
  if (state.admin) {
    const box = document.createElement("div");
    v.appendChild(box);
    renderAppVault(a.id, box);
  }
}

/* Adds 1 to the counter. Failure never blocks download. */
async function countDownload(a) {
  try {
    await updateDoc(doc(db, "apps", a.id),
      { downloads: increment(1) });
    a.downloads = (a.downloads || 0) + 1;
    const el = $("dlCount");
    if (el) el.textContent = a.downloads;
  } catch (e) { /* ignore */ }
}

/* Opens the phone share sheet, or copies the link. */
async function share(a) {
  const url = location.origin + location.pathname +
    "#/app/" + a.id;
  try {
    if (navigator.share) {
      await navigator.share({
        title: a.name,
        text: a.name + (a.tagline ? " - " + a.tagline : ""),
        url: url
      });
      return;
    }
  } catch (e) {
    if (e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch (e) {
    toast(url);
  }
}
