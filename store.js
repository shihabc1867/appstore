import {
  db, collection, doc, getDocs, getDoc, query, where
} from "./firebase.js";
import { state } from "./auth.js";
import { $, esc, safeUrl, setTop } from "./util.js";
import { renderAppVault } from "./vault.js";

let cache = null;

export function clearCache() { cache = null; }

/* Admin sees every app. Users see published ones only. */
export async function loadApps() {
  if (cache) return cache;
  const col = collection(db, "apps");
  const q = state.admin
    ? col
    : query(col, where("published", "==", true));
  const snap = await getDocs(q);
  cache = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (b.createdAt || 0) - (a.createdAt || 0));
  return cache;
}

export async function getApp(id) {
  const hit = (await loadApps()).find((x) => x.id === id);
  if (hit) return hit;
  const s = await getDoc(doc(db, "apps", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

function rows(items) {
  if (!items.length) {
    return '<p class="mut">No apps found.</p>';
  }
  return items.map((a) => `
    <div class="row" data-id="${esc(a.id)}">
      <img class="ico" alt="" loading="lazy"
       src="${esc(safeUrl(a.iconUrl))}">
      <div class="info">
        <b>${esc(a.name)}</b>
        <span class="mut">${esc(a.tagline)}</span>
        <span class="tag">${esc(a.category || "App")}</span>
        ${a.published === false
          ? '<span class="tag warn">Hidden</span>' : ""}
      </div>
      <button class="btn ghost" data-id="${esc(a.id)}">
        Details
      </button>
    </div>`).join("");
}

function filterApps(list, text) {
  const f = (text || "").toLowerCase();
  return list.filter((a) =>
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
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  v.innerHTML = `
    <input id="q" class="search"
     placeholder="Search apps...">
    <div id="list">${rows(list)}</div>`;
  $("q").oninput = (e) => {
    $("list").innerHTML =
      rows(filterApps(list, e.target.value));
  };
  $("list").onclick = (e) => {
    const el = e.target.closest("[data-id]");
    if (el) location.hash = "#/app/" + el.dataset.id;
  };
}

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
    .map(safeUrl).filter(Boolean)
    .map((u) => `<img src="${esc(u)}" alt=""
      loading="lazy">`).join("");
  const dl = safeUrl(a.downloadUrl);
  v.innerHTML = `
    <div class="top">
      <img class="ico big" alt=""
       src="${esc(safeUrl(a.iconUrl))}">
      <div class="info">
        <h2>${esc(a.name)}</h2>
        <span class="mut">${esc(a.tagline)}</span>
      </div>
    </div>
    ${dl
      ? `<a href="${esc(dl)}" target="_blank"
          rel="noopener"><button class="btn block"
          style="margin-top:16px">Download</button></a>`
      : '<p class="mut">No download yet.</p>'}
    <div class="facts">
      <div class="fact"><span>Version</span>
        ${esc(a.version || "-")}</div>
      <div class="fact"><span>Size</span>
        ${esc(a.size || "-")}</div>
      <div class="fact"><span>Category</span>
        ${esc(a.category || "-")}</div>
      <div class="fact"><span>Updated</span>
        ${esc(a.updated || "-")}</div>
    </div>
    ${shots ? `<div class="shots">${shots}</div>` : ""}
    <h3>About this app</h3>
    <p class="desc">${esc(a.description || "")}</p>`;
  if (state.admin) {
    const box = document.createElement("div");
    v.appendChild(box);
    renderAppVault(a.id, box);
  }
}
