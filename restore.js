import { db, doc, writeBatch } from "./firebase.js";
import { clearCache } from "./store.js";
import { clearVault } from "./vault.js";
import { $, esc, setTop, toast } from "./util.js";

let data = null;

export function showRestore() {
  setTop("Restore backup", "#/admin");
  data = null;
  $("view").innerHTML = `
    <p class="mut">
      Choose a backup file (.json) made with
      "Download backup". Apps and private vault items
      in the file are put back. Items with the same ID
      are replaced. Nothing is deleted. Users and
      reviews are not restored.</p>
    <input id="rs_file" type="file" class="hide"
     accept="application/json,.json">
    <button id="rs_pick" class="btn block"
     style="margin-top:12px">Choose backup file</button>
    <div id="rs_info"></div>`;
  $("rs_pick").onclick = () => $("rs_file").click();
  $("rs_file").onchange = onFile;
}

function badItem(x) {
  return !x || typeof x.id !== "string" ||
    !x.id || x.id.includes("/");
}

async function onFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const info = $("rs_info");
  try {
    const j = JSON.parse(await f.text());
    const apps = Array.isArray(j.apps) ? j.apps : [];
    const items = Array.isArray(j.private) ? j.private : [];
    if (!apps.length && !items.length) {
      throw new Error("This file does not look like a backup.");
    }
    if (apps.some(badItem) || items.some(badItem)) {
      throw new Error("The file has broken items.");
    }
    if (apps.length + items.length > 2000) {
      throw new Error("The file is too big.");
    }
    data = { apps: apps, items: items };
    info.innerHTML = `
      <div class="mine" style="margin-top:14px">
        <p>Backup date: ${esc(j.date || "unknown")}</p>
        <p>${apps.length} apps and ${items.length}
          private items found.</p>
        <button id="rs_go" class="btn block"
         style="margin-top:12px">Restore now</button>
      </div>
      <p id="rs_err" class="err"></p>`;
    $("rs_go").onclick = go;
  } catch (err) {
    info.innerHTML = '<p class="err">' +
      esc(err.message) + "</p>";
  }
}

async function go() {
  if (!data) return;
  if (!confirm("Restore now? Items with the same ID " +
      "will be replaced.")) return;
  $("rs_go").disabled = true;
  try {
    const jobs = [];
    data.apps.forEach((x) => jobs.push(["apps", x]));
    data.items.forEach((x) => jobs.push(["private", x]));
    for (let i = 0; i < jobs.length; i += 400) {
      const b = writeBatch(db);
      jobs.slice(i, i + 400).forEach((j) => {
        const rest = Object.assign({}, j[1]);
        delete rest.id;
        b.set(doc(db, j[0], j[1].id), rest);
      });
      await b.commit();
    }
    clearCache();
    clearVault();
    toast("Restored " + jobs.length + " items");
    location.hash = "#/admin";
  } catch (err) {
    $("rs_err").textContent =
      "Restore failed: " + (err.code || err.message);
    $("rs_go").disabled = false;
  }
}
