import {
  db, collection, doc, addDoc, setDoc, deleteDoc, getDocs
} from "./firebase.js";
import { loadApps, getApp, clearCache } from "./store.js";
import { renderAnnounceEditor } from "./announce.js";
import { openReportsCount } from "./reports.js";
import {
  $, esc, safeUrl, imgUrl, iconSrc, setTop, today, toast
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
       src="${esc(iconSrc(a))}">
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
    <button id="btnDash" class="btn ghost block"
     style="margin-bottom:14px">Dashboard</button>
    <button id="btnReports" class="btn ghost block"
     style="margin-bottom:14px">Reports</button>
    <button id="btnVault" class="btn ghost block"
     style="margin-bottom:14px">Private vault</button>
    <button id="btnUsers" class="btn ghost block"
     style="margin-bottom:14px">Users and logins</button>
    <button id="btnBackup" class="btn ghost block"
     style="margin-bottom:14px">Download backup</button>
    <button id="btnRestore" class="btn ghost block"
     style="margin-bottom:14px">Restore from backup</button>
    ${rows || '<p class="mut">No apps yet.</p>'}
    <div id="annBox"></div>`;
  renderAnnounceEditor($("annBox"));
  $("btnNew").onclick = () => {
    location.hash = "#/admin/new";
  };
  $("btnVault").onclick = () => {
    location.hash = "#/vault";
  };
  $("btnDash").onclick = () => {
    location.hash = "#/dashboard";
  };
  $("btnReports").onclick = () => {
    location.hash = "#/reports";
  };
  openReportsCount().then((n) => {
    const b = $("btnReports");
    if (b && n) b.textContent = "Reports (" + n + " open)";
  }).catch(() => {});
  $("btnUsers").onclick = () => {
    location.hash = "#/users";
  };
  $("btnBackup").onclick = backup;
  $("btnRestore").onclick = () => {
    location.hash = "#/restore";
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
  iconData = a.iconData || "";
  orig = { history: a.history || [] };
  v.innerHTML = `
    ${field("Name *", "f_name", a.name)}
    ${field("Short line", "f_tagline", a.tagline)}
    <label class="lbl" for="f_type">App type</label>
    <select id="f_type" class="inp">
      <option value="web"
       ${a.appType !== "apk" ? "selected" : ""}>
        Web app (opens in browser)</option>
      <option value="apk"
       ${a.appType === "apk" ? "selected" : ""}>
        Android APK (download file)</option>
    </select>
    ${field("Category", "f_category", a.category)}
    ${field("Version", "f_version", a.version)}
    ${field("Size (e.g. 12 MB)", "f_size", a.size)}
    <label class="lbl">Logo</label>
    <div class="top">
      <img id="f_prev" class="ico big" alt="">
      <div>
        <button id="f_pick" type="button"
         class="btn ghost small">Choose from phone</button>
        <button id="f_clear" type="button"
         class="btn ghost small"
         style="margin-left:8px">Remove</button>
      </div>
    </div>
    <input id="f_file" type="file" accept="image/*"
     class="hide">
    ${field("Or logo image link", "f_icon", a.iconUrl,
      "Direct image link. GitHub or Google Drive " +
      "(shared with anyone) links also work.")}
    ${field("App link", "f_dl", a.downloadUrl,
      "Web app: its https address. APK: GitHub " +
      "Releases link or shared Google Drive link.")}
    <label class="lbl" for="f_shots">
      Screenshot links (one per line)</label>
    <textarea id="f_shots" class="inp" rows="4">${
      esc((a.screenshots || []).join("\n"))}</textarea>
    <label class="lbl" for="f_desc">Full description</label>
    <textarea id="f_desc" class="inp" rows="8">${
      esc(a.description)}</textarea>
    <label class="lbl" for="f_whats">
      What's new in this version</label>
    <textarea id="f_whats" class="inp" rows="4">${
      esc(a.whatsNew)}</textarea>
    <p class="mut hint">
      Change "Version" when you release an update.
      Users then see an update notice.</p>
    <label class="chk">
      <input type="checkbox" id="f_feat"
       ${a.featured ? "checked" : ""}>
      Featured on home (slider)
    </label>
    <label class="chk">
      <input type="checkbox" id="f_pub"
       ${a.published !== false ? "checked" : ""}>
      Visible to users
    </label>
    <p id="f_err" class="err"></p>
    <button id="f_save" class="btn block">Save</button>
    ${id ? `<button id="f_del" class="btn block danger"
      style="margin-top:12px">Delete app</button>` : ""}`;

  const prev = () => {
    const src = iconData || imgUrl($("f_icon").value);
    if (src) $("f_prev").setAttribute("src", src);
    else $("f_prev").removeAttribute("src");
  };
  prev();
  $("f_icon").oninput = prev;
  $("f_pick").onclick = () => $("f_file").click();
  $("f_clear").onclick = () => {
    iconData = "";
    $("f_icon").value = "";
    prev();
  };
  $("f_file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const d = await toIcon(file);
      if (d.length > 150000) {
        throw new Error("Image is too big");
      }
      iconData = d;
      prev();
    } catch (err) {
      $("f_err").textContent =
        "Could not use this image: " + err.message;
    }
  };
  $("f_save").onclick = () => save(id);
  if (id) $("f_del").onclick = () => remove(id);
}

function val(id) { return $(id).value.trim(); }

/* Picked logo, shrunk to a small square picture. */
let iconData = "";

/* Old values of the app being edited (for version history). */
let orig = { history: [] };

/* Adds this version to the app's history list. */
function nextHistory(prev, data) {
  const h = (prev || []).slice();
  const v = data.version;
  if (!v) return h;
  if (h.length && h[0].version === v) {
    h[0] = {
      version: v, whatsNew: data.whatsNew, date: h[0].date
    };
  } else {
    h.unshift({
      version: v, whatsNew: data.whatsNew, date: today()
    });
  }
  return h.slice(0, 20);
}

async function toIcon(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("not an image"));
      i.src = url;
    });
    const S = 256;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const k = S / Math.max(img.width, img.height);
    const w = img.width * k;
    const h = img.height * k;
    c.getContext("2d")
      .drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    return c.toDataURL("image/webp", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function save(id) {
  const err = $("f_err");
  err.textContent = "";
  if (!val("f_name")) {
    err.textContent = "Name is required.";
    return;
  }
  const urls = [
    ["f_icon", "Icon link"], ["f_dl", "App link"]
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
    appType: $("f_type").value,
    iconUrl: val("f_icon"),
    iconData: iconData,
    downloadUrl: val("f_dl"),
    screenshots: shots,
    description: $("f_desc").value.trim(),
    whatsNew: $("f_whats").value.trim(),
    featured: $("f_feat").checked,
    published: $("f_pub").checked,
    updated: today()
  };
  data.history = nextHistory(orig.history, data);
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

/* Saves apps, vault and users into one file. */
async function backup() {
  try {
    const grab = async (name) => {
      const s = await getDocs(collection(db, name));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    };
    const out = {
      date: today(),
      apps: await grab("apps"),
      private: await grab("private"),
      users: await grab("users")
    };
    const blob = new Blob(
      [JSON.stringify(out, null, 1)],
      { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "backup-" + today() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast("Backup downloaded");
  } catch (e) {
    toast("Backup failed: " + (e.code || e.message));
  }
}
