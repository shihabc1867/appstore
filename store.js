import {
  db, collection, doc, getDocs, getDoc,
  query, where, updateDoc, increment
} from "./firebase.js";
import { state } from "./auth.js";
import {
  $, esc, imgUrl, dlUrl, iconSrc, setTop
} from "./util.js";
import { renderAppVault } from "./vault.js";
import { renderReviews } from "./reviews.js";
import {
  baseline, pending, markSeen, markAll
} from "./notify.js";

let cache = null;
let cat = "all";
let search = "";
let flags = {};
let offline = false;
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
        ${flags[a.id] ? flagTag(flags[a.id]) : badge(a)}
        ${a.published === false
          ? '<span class="tag warn">Hidden</span>' : ""}
        <span class="mut dl">
          ↓ ${esc(a.downloads || 0)}</span>
      </div>
      <button class="btn ghost" data-id="${esc(a.id)}">
        Details
      </button>
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
  if (!cats.length) return "";
  return ["all"].concat(cats).map((c) => `
    <button class="chip ${cat === c ? "on" : ""}"
     data-c="${esc(c)}">${
      c === "all" ? "All" : esc(c)}</button>`).join("");
}

function filtered(list) {
  const f = search.toLowerCase();
  return list.filter((a) =>
    (cat === "all" || a.category === cat) &&
    [a.name, a.tagline, a.category].join(" ")
      .toLowerCase().includes(f)
  );
}

export async function showList() {
  setTop("My App Store", null);
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
  baseline(list);
  const pend = pending(list);
  flags = {};
  pend.forEach((x) => { flags[x.app.id] = x.type; });
  const cats = categories(list);
  if (cat !== "all" && !cats.includes(cat)) cat = "all";
  v.innerHTML = `
    ${offline
      ? `<div class="note off">You are offline.
          Showing the last saved list.</div>` : ""}
    ${banner(pend)}
    <input id="q" class="search" value="${esc(search)}"
     placeholder="Search apps...">
    <div id="chips" class="chips">${chips(cats)}</div>
    <div id="list">${rows(filtered(list))}</div>`;
  const redraw = () => {
    $("list").innerHTML = rows(filtered(list));
  };
  $("q").oninput = (e) => {
    search = e.target.value;
    redraw();
  };
  $("chips").onclick = (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    cat = b.dataset.c;
    $("chips").innerHTML = chips(cats);
    redraw();
  };
  $("list").onclick = (e) => {
    const el = e.target.closest("[data-id]");
    if (el) location.hash = "#/app/" + el.dataset.id;
  };
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
  v.innerHTML = `
    <div class="top">
      <img class="ico big" alt=""
       src="${esc(iconSrc(a))}">
      <div class="info">
        <h2>${esc(a.name)}</h2>
        <span class="mut">${esc(a.tagline)}</span>
        <div>${badge(a)}</div>
      </div>
    </div>
    ${actionHtml(a, dl)}
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
    <h3>About this app</h3>
    <p class="desc">${esc(a.description || "")}</p>`;
  markSeen(a);
  const link = $("dlLink");
  if (link) link.onclick = () => countDownload(a);
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
