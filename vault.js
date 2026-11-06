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
let filter = "all";
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

async function getItem(id) {
  const hit = (await loadItems()).find((x) => x.id === id);
  if (hit) return hit;
  const s = await getDoc(doc(db, "private", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/* ---------- List ---------- */
function rowsHtml(list) {
  const f = search.toLowerCase();
  const out = list.filter((a) =>
    (filter === "all" || a.kind === filter) &&
    [a.title, a.note, a.url].join(" ")
      .toLowerCase().includes(f)
  );
  if (!out.length) {
    return '<p class="mut">Nothing here yet.</p>';
  }
  return out.map((a) => `
    <div class="row" data-id="${esc(a.id)}">
      <div class="info">
        <b>${esc(a.title)}</b>
        <span class="mut">${esc(
          a.kind === "note" ? a.note : a.url)}</span>
        <span class="tag">${esc(label(a.kind))}</span>
      </div>
      <button class="btn ghost small"
       data-id="${esc(a.id)}">Open</button>
    </div>`).join("");
}

function chipsHtml() {
  const all = [["all", "All"]].concat(KINDS);
  return all.map((k) => `
    <button class="chip ${filter === k[0] ? "on" : ""}"
     data-k="${k[0]}">${k[1]}</button>`).join("");
}

export async function showVault() {
  setTop("Private vault", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list;
  try {
    list = await loadItems();
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
    <div id="chips" class="chips">${chipsHtml()}</div>
    <div id="vlist">${rowsHtml(list)}</div>`;
  $("vNew").onclick = () => {
    location.hash = "#/vault/new";
  };
  $("vq").oninput = (e) => {
    search = e.target.value;
    $("vlist").innerHTML = rowsHtml(list);
  };
  $("chips").onclick = (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    filter = b.dataset.k;
    $("chips").innerHTML = chipsHtml();
    $("vlist").innerHTML = rowsHtml(list);
  };
  $("vlist").onclick = (e) => {
    const el = e.target.closest("[data-id]");
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

export async function showVaultItem(id) {
  setTop("Item", "#/vault");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let a;
  try { a = await getItem(id); } catch (e) { a = null; }
  if (!a) {
    v.innerHTML = '<p class="err">Item not found.</p>';
    return;
  }
  const u = safeUrl(a.url);
  v.innerHTML = `
    <h2>${esc(a.title)}</h2>
    <span class="tag">${esc(label(a.kind))}</span>
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
export async function showVaultForm(id) {
  setTop(id ? "Edit item" : "Add item",
    id ? "#/vault/view/" + id : "#/vault");
  const v = $("view");
  let a = { kind: "link" };
  if (id) {
    v.innerHTML = '<p class="mut">Loading...</p>';
    try { a = await getItem(id); } catch (e) { a = null; }
    if (!a) {
      v.innerHTML = '<p class="err">Item not found.</p>';
      return;
    }
  }
  const opts = KINDS.map((k) => `
    <option value="${k[0]}"
     ${a.kind === k[0] ? "selected" : ""}>${k[1]}</option>`
  ).join("");
  v.innerHTML = `
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
  if (id) $("v_del").onclick = () => remove(id);
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
    location.hash = "#/vault";
  } catch (e) {
    err.textContent = "Save failed: " + (e.code || e.message);
    $("v_save").disabled = false;
  }
}

async function remove(id) {
  if (!confirm("Delete this item for good?")) return;
  try {
    await deleteDoc(doc(db, "private", id));
    clearVault();
    toast("Deleted");
    location.hash = "#/vault";
  } catch (e) {
    $("v_err").textContent =
      "Delete failed: " + (e.code || e.message);
  }
}
