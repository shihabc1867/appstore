import {
  db, collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, query, where
} from "./firebase.js";
import { state } from "./auth.js";
import { $, esc, setTop, toast } from "./util.js";

const REASONS = [
  ["broken", "App does not work"],
  ["wrong", "Wrong or old information"],
  ["bad", "Bad or unsafe content"],
  ["other", "Something else"]
];
const reasonName = (k) =>
  (REASONS.find((r) => r[0] === k) || [0, k])[1];

let filter = "open";

/* ---------- User side: report a problem ---------- */
export function reportBox(app, box) {
  box.innerHTML = `
    <button id="rp_open" class="btn ghost block"
     style="margin-top:18px">Report a problem</button>`;
  $("rp_open").onclick = () => form(app, box);
}

function form(app, box) {
  box.innerHTML = `
    <div class="mine" style="margin-top:18px">
      <p class="lbl" style="margin-top:0">
        Report a problem</p>
      <select id="rp_reason" class="inp">${
        REASONS.map((r) => `
        <option value="${r[0]}">${r[1]}</option>`
        ).join("")}</select>
      <textarea id="rp_text" class="inp" rows="3"
       maxlength="500" style="margin-top:10px"
       placeholder="Tell us what is wrong"></textarea>
      <p id="rp_err" class="err"></p>
      <button id="rp_send" class="btn block">Send</button>
      <button id="rp_cancel" class="btn ghost block"
       style="margin-top:10px">Cancel</button>
    </div>`;
  $("rp_cancel").onclick = () => reportBox(app, box);
  $("rp_send").onclick = () => send(app, box);
}

async function send(app, box) {
  const text = $("rp_text").value.trim();
  if (!text) {
    $("rp_err").textContent = "Please write a few words.";
    return;
  }
  const u = state.user;
  $("rp_send").disabled = true;
  try {
    await addDoc(collection(db, "reports"), {
      appId: app.id,
      appName: String(app.name || "").slice(0, 100),
      uid: u.uid,
      name: (u.displayName || "User").slice(0, 100),
      email: u.email,
      reason: $("rp_reason").value,
      text: text.slice(0, 500),
      createdAt: Date.now(),
      status: "open"
    });
    toast("Report sent. Thank you.");
    reportBox(app, box);
  } catch (e) {
    $("rp_err").textContent =
      "Could not send: " + (e.code || e.message);
    $("rp_send").disabled = false;
  }
}

/* ---------- Admin side ---------- */
export async function openReportsCount() {
  const q = query(
    collection(db, "reports"),
    where("status", "==", "open"));
  const snap = await getDocs(q);
  return snap.size;
}

function when(ms) {
  return ms ? new Date(ms).toLocaleString() : "-";
}

function rows(list) {
  const out = list.filter((r) =>
    filter === "all" || r.status === filter);
  if (!out.length) {
    return '<p class="mut">No reports here.</p>';
  }
  return out.map((r) => `
    <div class="rv">
      <b>${esc(r.appName || "App")}</b>
      <span class="tag ${r.status === "open"
        ? "warn" : ""}">${esc(r.status)}</span>
      <span class="tag">${esc(reasonName(r.reason))}</span>
      <p class="desc">${esc(r.text)}</p>
      <span class="mut">${esc(r.name)} -
        ${esc(r.email)}</span>
      <span class="mut">${esc(when(r.createdAt))}</span>
      <div class="btnrow">
        <button class="btn ghost small"
         data-open="${esc(r.appId)}">View app</button>
        <button class="btn ghost small"
         data-flip="${esc(r.id)}">${
          r.status === "open" ? "Mark done" : "Reopen"
        }</button>
        <button class="btn ghost small"
         data-del="${esc(r.id)}">Delete</button>
      </div>
    </div>`).join("");
}

export async function showReports() {
  setTop("Reports", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list;
  try {
    const snap = await getDocs(collection(db, "reports"));
    list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0));
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  const chips = () => [
    ["open", "Open"], ["done", "Done"], ["all", "All"]
  ].map((c) => `
    <button class="chip ${filter === c[0] ? "on" : ""}"
     data-f="${c[0]}">${c[1]}</button>`).join("");
  v.innerHTML = `
    <div id="rchips" class="chips">${chips()}</div>
    <div id="rlist">${rows(list)}</div>`;
  const redraw = () => {
    $("rchips").innerHTML = chips();
    $("rlist").innerHTML = rows(list);
  };
  $("rchips").onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    redraw();
  };
  $("rlist").onclick = async (e) => {
    const o = e.target.closest("[data-open]");
    if (o) {
      location.hash = "#/app/" + o.dataset.open;
      return;
    }
    const f = e.target.closest("[data-flip]");
    const d = e.target.closest("[data-del]");
    try {
      if (f) {
        const r = list.find((x) => x.id === f.dataset.flip);
        const next = r.status === "open" ? "done" : "open";
        await updateDoc(doc(db, "reports", r.id),
          { status: next });
        r.status = next;
        redraw();
      } else if (d) {
        if (!confirm("Delete this report?")) return;
        await deleteDoc(doc(db, "reports", d.dataset.del));
        list = list.filter((x) => x.id !== d.dataset.del);
        redraw();
      }
    } catch (err) {
      toast("Failed: " + (err.code || err.message));
    }
  };
}
