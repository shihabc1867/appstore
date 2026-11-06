import {
  db, collection, doc, addDoc, setDoc, deleteDoc
} from "./firebase.js";
import { loadApps, getApp, clearCache } from "./store.js";
import {
  $, esc, safeUrl, setTop, today, toast
} from "./util.js";

/* ---------- Admin home: list of all apps ---------- */
export async function showAdmin() {
  setTop("Admin", "#/");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list;
  try {
    list = await loadApps();
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  const rows = list.map((a) => `
    <div class="row">
      <img class="ico" alt="" loading="lazy"
       src="${esc(safeUrl(a.iconUrl))}">
      <div class="info">
        <b>${esc(a.name)}</b>
        <span class="mut">v${esc(a.version || "-")}</span>
        ${a.published === false
          ? '<span class="tag warn">Hidden</span>'
          : '<span class="tag">Live</span>'}
      </div>
      <button class="btn ghost" data-edit="${esc(a.id)}">
        Edit
      </button>
    </div>`).join("");
  v.innerHTML = `
    <button id="btnNew" class="btn block"
     style="margin-bottom:14px">+ Add new app</button>
    <button id="btnVault" class="btn ghost block"
     style="margin-bottom:14px">Private vault</button>
    ${rows || '<p class="mut">No apps yet.</p>'}`;
  $("btnNew").onclick = () => {
    location.hash = "#/admin/new";
  };
  $("btnVault").onclick = () => {
    location.hash = "#/vault";
  };
  v.onclick = (e) => {
    const b = e.target.closest("[data-edit]");
    if (b) location.hash = "#/admin/edit/" + b.dataset.edit;
  };
}

/* ---------- Add / Edit form ---------- */
function field(label, id, val, hint) {
  return `
    <label class="lbl" for="${id}">${label}</label>
    <input id="${id}" class="inp"
     value="${esc(val)}">
    ${hint ? `<p class="mut hint">${hint}</p>` : ""}`;
}

export async function showForm(id) {
  setTop(id ? "Edit app" : "Add app", "#/admin");
  const v = $("view");
  let a = {
    published: true, screenshots: []
  };
  if (id) {
    v.innerHTML = '<p class="mut">Loading...</p>';
    try { a = await getApp(id); } catch (e) { a = null; }
    if (!a) {
      v.innerHTML = '<p class="err">App not found.</p>';
      return;
    }
  }
  v.innerHTML = `
    ${field("Name *", "f_name", a.name)}
    ${field("Short line", "f_tagline", a.tagline)}
    ${field("Category", "f_category", a.category)}
    ${field("Version", "f_version", a.version)}
    ${field("Size (e.g. 12 MB)", "f_size", a.size)}
    ${field("Icon image link", "f_icon", a.iconUrl,
      "A direct https link to a PNG or JPG.")}
    ${field("Download link", "f_dl", a.downloadUrl,
      "Best: GitHub Releases APK link.")}
    <label class="lbl" for="f_shots">
      Screenshot links (one per line)</label>
    <textarea id="f_shots" class="inp" rows="4">${
      esc((a.screenshots || []).join("\n"))}</textarea>
    <label class="lbl" for="f_desc">Full description</label>
    <textarea id="f_desc" class="inp" rows="8">${
      esc(a.description)}</textarea>
    <label class="chk">
      <input type="checkbox" id="f_pub"
       ${a.published !== false ? "checked" : ""}>
      Visible to users
    </label>
    <p id="f_err" class="err"></p>
    <button id="f_save" class="btn block">Save</button>
    ${id ? `<button id="f_del" class="btn block danger"
      style="margin-top:12px">Delete app</button>` : ""}`;

  $("f_save").onclick = () => save(id);
  if (id) $("f_del").onclick = () => remove(id);
}

function val(id) { return $(id).value.trim(); }

async function save(id) {
  const err = $("f_err");
  err.textContent = "";
  if (!val("f_name")) {
    err.textContent = "Name is required.";
    return;
  }
  const urls = [
    ["f_icon", "Icon link"], ["f_dl", "Download link"]
  ];
  for (const [k, label] of urls) {
    if (val(k) && !safeUrl(val(k))) {
      err.textContent = label + " must start with https://";
      return;
    }
  }
  const shots = val("f_shots").split("\n")
    .map((s) => s.trim()).filter(Boolean);
  if (shots.some((s) => !safeUrl(s))) {
    err.textContent = "Every screenshot link must be https://";
    return;
  }
  const data = {
    name: val("f_name"),
    tagline: val("f_tagline"),
    category: val("f_category"),
    version: val("f_version"),
    size: val("f_size"),
    iconUrl: val("f_icon"),
    downloadUrl: val("f_dl"),
    screenshots: shots,
    description: $("f_desc").value.trim(),
    published: $("f_pub").checked,
    updated: today()
  };
  $("f_save").disabled = true;
  try {
    if (id) {
      await setDoc(doc(db, "apps", id), data, { merge: true });
    } else {
      data.createdAt = Date.now();
      await addDoc(collection(db, "apps"), data);
    }
    clearCache();
    toast("Saved");
    location.hash = "#/admin";
  } catch (e) {
    err.textContent = "Save failed: " + (e.code || e.message);
    $("f_save").disabled = false;
  }
}

async function remove(id) {
  if (!confirm("Delete this app for good?")) return;
  try {
    await deleteDoc(doc(db, "apps", id));
    clearCache();
    toast("Deleted");
    location.hash = "#/admin";
  } catch (e) {
    $("f_err").textContent =
      "Delete failed: " + (e.code || e.message);
  }
}
