import {
  db, collection, doc, getDocs, getDoc,
  addDoc, setDoc, deleteDoc
} from "./firebase.js";
import {
  $, esc, safeUrl, setTop, today, toast
} from "./util.js";

/* Types of items the admin can keep. */
export const KINDS = [
  ["link", "Link"],
  ["note", "Note"],
  ["image", "Image"],
  ["audio", "Audio"],
  ["video", "Video"],
  ["document", "Document"],
  ["file", "File"]
];
const label = (k) =>
  (KINDS.find((x) => x[0] === k) || [0, "Item"])[1];

let items = null;
let appNames = null;
let filter = "all";
let appFilter = "all";
let search = "";

export function clearVault() { items = null; }

async function loadItems() {
  if (items) return items;
  const snap = await getDocs(collection(db, "private"));
  items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

/* Map of appId -> app name (admin can read all apps). */
async function loadNames() {
  if (appNames) return appNames;
  const snap = await getDocs(collection(db, "apps"));
  appNames = {};
  snap.docs.forEach((d) => {
    appNames[d.id] = d.data().name || "(no name)";
  });
  return appNames;
}

async function getItem(id) {
  const hit = (await loadItems()).find((x) => x.id === id);
  if (hit) return hit;
  const s = await getDoc(doc(db, "private", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

function appLabel(a, names) {
  if (!a.appId) return "General";
  return names[a.appId] || "Unknown app";
}

/* ---------- Rows ---------- */
function oneRow(a, names, showApp) {
  return `
    <div class="row" data-id="${esc(a.id)}">
      <div class="info">
        <b>${esc(a.title)}</b>
        <span class="mut">${esc(
          a.kind === "note" ? a.note : a.url)}</span>
        <span class="tag">${esc(label(a.kind))}</span>
        ${showApp
          ? `<span class="tag">${esc(
              appLabel(a, names))}</span>` : ""}
      </div>
      <button class="btn ghost small"
       data-id="${esc(a.id)}">Open</button>
    </div>`;
}

function rowsHtml(list, names) {
  const f = search.toLowerCase();
  const out = list.filter((a) =>
    (filter === "all" || a.kind === filter) &&
    (appFilter === "all" ||
      (appFilter === "general"
        ? !a.appId : a.appId === appFilter)) &&
    [a.title, a.note, a.url].join(" ")
      .toLowerCase().includes(f)
  );
  if (!out.length) {
    return '<p class="mut">Nothing here yet.</p>';
  }
  return out.map((a) => oneRow(a, names, true)).join("");
}

function chipsHtml() {
  const all = [["all", "All"]].concat(KINDS);
  return all.map((k) => `
    <button class="chip ${filter === k[0] ? "on" : ""}"
     data-k="${k[0]}">${k[1]}</button>`).join("");
}

function appSelectHtml(names, id, selected, withAll) {
  const base = withAll
    ? '<option value="all">All apps</option>' : "";
  const opts = Object.keys(names).map((k) => `
    <option value="${esc(k)}"
     ${selected === k ? "selected" : ""}>${
      esc(names[k])}</option>`).join("");
  return `<select id="${id}" class="inp">
    ${base}
    <option value="${withAll ? "general" : ""}"
     ${selected === "" || selected === "general"
       ? "selected" : ""}>General (no app)</option>
    ${opts}</select>`;
}

/* ---------- Whole vault ---------- */
export async function showVault() {
  setTop("Private vault", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list, names;
  try {
    list = await loadItems();
    names = await loadNames();
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  v.innerHTML = `
    <p class="mut" style="margin-bottom:10px">
      Only you can see this section.</p>
    <button id="vNew" class="btn block"
     style="margin-bottom:14px">+ Add item</button>
    <input id="vq" class="search" value="${esc(search)}"
     placeholder="Search vault...">
    <div style="margin-bottom:12px">
      ${appSelectHtml(names, "vapp", appFilter, true)}
    </div>
    <div id="chips" class="chips">${chipsHtml()}</div>
    <div id="vlist">${rowsHtml(list, names)}</div>`;
  const redraw = () => {
    $("vlist").innerHTML = rowsHtml(list, names);
  };
  $("vNew").onclick = () => {
    location.hash = "#/vault/new";
  };
  $("vq").oninput = (e) => {
    search = e.target.value;
    redraw();
  };
  $("vapp").onchange = (e) => {
    appFilter = e.target.value;
    redraw();
  };
  $("chips").onclick = (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    filter = b.dataset.k;
    $("chips").innerHTML = chipsHtml();
    redraw();
  };
  $("vlist").onclick = (e) => {
    const el = e.target.closest("[data-id]");
    if (el) location.hash = "#/vault/view/" + el.dataset.id;
  };
}

/* ---------- Vault of one app (shown on its Details) ---------- */
export async function renderAppVault(appId, box) {
  box.innerHTML = `
    <h3 style="margin-top:24px">
      Private files (only you)</h3>
    <p class="mut">Loading...</p>`;
  let list;
  try {
    list = (await loadItems())
      .filter((a) => a.appId === appId);
  } catch (e) {
    box.innerHTML = '<p class="err">Vault: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  box.innerHTML = `
    <h3 style="margin:24px 0 10px">
      Private files (only you)</h3>
    <button id="avNew" class="btn ghost block"
     style="margin-bottom:12px">
      + Add private item</button>
    ${list.length
      ? list.map((a) => oneRow(a, {}, false)).join("")
      : '<p class="mut">Nothing added yet.</p>'}`;
  $("avNew").onclick = () => {
    location.hash = "#/vault/new/" + appId;
  };
  box.onclick = (e) => {
    const el = e.target.closest(".row[data-id]");
    if (el) location.hash = "#/vault/view/" + el.dataset.id;
  };
}

/* ---------- Single item ---------- */
function preview(a) {
  const u = safeUrl(a.url);
  if (a.kind === "image" && u) {
    return `<img class="pv" src="${esc(u)}" alt="">`;
  }
  if (a.kind === "audio" && u) {
    return `<audio class="pv" controls
      src="${esc(u)}"></audio>`;
  }
  if (a.kind === "video" && u) {
    return `<video class="pv" controls playsinline
      src="${esc(u)}"></video>`;
  }
  return "";
}

const backOf = (a) =>
  a.appId ? "#/app/" + a.appId : "#/vault";

export async function showVaultItem(id) {
  setTop("Item", "#/vault");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let a, names;
  try {
    a = await getItem(id);
    names = await loadNames();
  } catch (e) { a = null; }
  if (!a) {
    v.innerHTML = '<p class="err">Item not found.</p>';
    return;
  }
  setTop("Item", backOf(a));
  const u = safeUrl(a.url);
  v.innerHTML = `
    <h2>${esc(a.title)}</h2>
    <span class="tag">${esc(label(a.kind))}</span>
    <span class="tag">${esc(appLabel(a, names))}</span>
    <span class="mut">${esc(a.updated || "")}</span>
    ${preview(a)}
    ${a.note
      ? `<p class="desc">${esc(a.note)}</p>` : ""}
    ${u
      ? `<a href="${esc(u)}" target="_blank"
          rel="noopener"><button class="btn block"
          style="margin-top:14px">Open link</button></a>`
      : ""}
    <button id="vEdit" class="btn ghost block"
     style="margin-top:12px">Edit</button>`;
  $("vEdit").onclick = () => {
    location.hash = "#/vault/edit/" + id;
  };
}

/* ---------- Add / Edit ---------- */
export async function showVaultForm(id, presetApp) {
  setTop(id ? "Edit item" : "Add item", "#/vault");
  const v = $("view");
  let a = { kind: "link", appId: presetApp || "" };
  let names;
  v.innerHTML = '<p class="mut">Loading...</p>';
  try {
    names = await loadNames();
    if (id) a = await getItem(id);
  } catch (e) { a = null; }
  if (!a) {
    v.innerHTML = '<p class="err">Item not found.</p>';
    return;
  }
  setTop(id ? "Edit item" : "Add item",
    id ? "#/vault/view/" + id : backOf(a));
  const opts = KINDS.map((k) => `
    <option value="${k[0]}"
     ${a.kind === k[0] ? "selected" : ""}>${k[1]}</option>`
  ).join("");
  v.innerHTML = `
    <label class="lbl" for="v_app">For which app</label>
    ${appSelectHtml(names, "v_app", a.appId || "", false)}
    <label class="lbl" for="v_kind">Type</label>
    <select id="v_kind" class="inp">${opts}</select>
    <label class="lbl" for="v_title">Title *</label>
    <input id="v_title" class="inp"
     value="${esc(a.title)}">
    <label class="lbl" for="v_url">Link</label>
    <input id="v_url" class="inp" value="${esc(a.url)}">
    <p class="mut hint">
      Direct https link. Images, audio and video
      play here if the link is a direct file.</p>
    <label class="lbl" for="v_note">Note</label>
    <textarea id="v_note" class="inp"
     rows="8">${esc(a.note)}</textarea>
    <p id="v_err" class="err"></p>
    <button id="v_save" class="btn block">Save</button>
    ${id ? `<button id="v_del" class="btn block danger"
      style="margin-top:12px">Delete item</button>` : ""}`;
  $("v_save").onclick = () => save(id);
  if (id) $("v_del").onclick = () => remove(id, a);
}

const val = (i) => $(i).value.trim();

async function save(id) {
  const err = $("v_err");
  err.textContent = "";
  const kind = $("v_kind").value;
  if (!val("v_title")) {
    err.textContent = "Title is required.";
    return;
  }
  if (val("v_url") && !safeUrl(val("v_url"))) {
    err.textContent = "Link must start with https://";
    return;
  }
  if (kind === "note" ? !val("v_note") : !val("v_url")) {
    err.textContent = kind === "note"
      ? "Write something in the note."
      : "A link is needed for this type.";
    return;
  }
  const data = {
    appId: $("v_app").value,
    kind: kind,
    title: val("v_title"),
    url: val("v_url"),
    note: $("v_note").value.trim(),
    updated: today()
  };
  $("v_save").disabled = true;
  try {
    if (id) {
      await setDoc(doc(db, "private", id), data,
        { merge: true });
    } else {
      data.createdAt = Date.now();
      await addDoc(collection(db, "private"), data);
    }
    clearVault();
    toast("Saved");
    location.hash = backOf(data);
  } catch (e) {
    err.textContent = "Save failed: " + (e.code || e.message);
    $("v_save").disabled = false;
  }
}

async function remove(id, a) {
  if (!confirm("Delete this item for good?")) return;
  try {
    await deleteDoc(doc(db, "private", id));
    clearVault();
    toast("Deleted");
    location.hash = backOf(a);
  } catch (e) {
    $("v_err").textContent =
      "Delete failed: " + (e.code || e.message);
  }
}
