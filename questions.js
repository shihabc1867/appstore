import {
  db, collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, query, where
} from "./firebase.js";
import { state } from "./auth.js";
import { $, esc, setTop, toast } from "./util.js";

let filter = "open";

const when = (ms) =>
  ms ? new Date(ms).toLocaleString() : "-";

/* ---------- User side: ask about one app ---------- */
export async function questionBox(app, box) {
  box.innerHTML = `
    <div class="mine" style="margin-top:18px">
      <p class="lbl" style="margin-top:0">
        Ask a question</p>
      <textarea id="qs_text" class="inp" rows="3"
       maxlength="500"
       placeholder="Ask the owner about this app"></textarea>
      <p id="qs_err" class="err"></p>
      <button id="qs_send" class="btn block">Send</button>
    </div>
    <div id="qs_mine"></div>`;
  $("qs_send").onclick = () => send(app, box);
  loadMine(app);
}

async function loadMine(app) {
  const el = $("qs_mine");
  if (!el) return;
  try {
    const q = query(collection(db, "questions"),
      where("uid", "==", state.user.uid));
    const snap = await getDocs(q);
    const mine = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((x) => x.appId === app.id)
      .sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0));
    if (!mine.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <h3 style="margin-top:18px">Your questions</h3>
      ${mine.map((x) => `
        <div class="rv">
          <p class="desc">${esc(x.text)}</p>
          <span class="mut">${esc(when(x.createdAt))}</span>
          ${x.answer ? `
            <div class="reply">
              <b>Reply from the owner</b>
              <p class="desc">${esc(x.answer)}</p>
            </div>` : `
            <span class="tag warn">Waiting for reply</span>`}
        </div>`).join("")}`;
  } catch (e) {
    el.innerHTML = "";
  }
}

async function send(app, box) {
  const text = $("qs_text").value.trim();
  if (!text) {
    $("qs_err").textContent = "Please write a few words.";
    return;
  }
  const u = state.user;
  $("qs_send").disabled = true;
  try {
    await addDoc(collection(db, "questions"), {
      appId: app.id,
      appName: String(app.name || "").slice(0, 100),
      uid: u.uid,
      name: (u.displayName || "User").slice(0, 100),
      email: u.email,
      text: text.slice(0, 500),
      createdAt: Date.now(),
      status: "open",
      answer: "",
      answeredAt: 0
    });
    toast("Question sent. Thank you.");
    questionBox(app, box);
  } catch (e) {
    $("qs_err").textContent =
      "Could not send: " + (e.code || e.message);
    $("qs_send").disabled = false;
  }
}

/* ---------- Admin side ---------- */
export async function openQuestionsCount() {
  const q = query(collection(db, "questions"),
    where("status", "==", "open"));
  const snap = await getDocs(q);
  return snap.size;
}

function rows(list) {
  const out = list.filter((r) =>
    filter === "all" || r.status === filter);
  if (!out.length) {
    return '<p class="mut">No questions here.</p>';
  }
  return out.map((r) => `
    <div class="rv">
      <b>${esc(r.appName || "App")}</b>
      <span class="tag ${r.status === "open"
        ? "warn" : ""}">${r.status === "open"
        ? "Open" : "Answered"}</span>
      <p class="desc">${esc(r.text)}</p>
      <span class="mut">${esc(r.name)} -
        ${esc(r.email)}</span>
      <span class="mut">${esc(when(r.createdAt))}</span>
      <textarea class="inp" rows="3" maxlength="500"
       data-ans="${esc(r.id)}"
       placeholder="Write a reply">${esc(r.answer)}</textarea>
      <div class="btnrow">
        <button class="btn small"
         data-send="${esc(r.id)}">${r.answer
          ? "Update reply" : "Send reply"}</button>
        <button class="btn ghost small"
         data-open="${esc(r.appId)}">View app</button>
        <button class="btn ghost small"
         data-del="${esc(r.id)}">Delete</button>
      </div>
    </div>`).join("");
}

export async function showQuestions() {
  setTop("Questions", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list;
  try {
    const snap = await getDocs(collection(db, "questions"));
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
    ["open", "Open"], ["answered", "Answered"],
    ["all", "All"]
  ].map((c) => `
    <button class="chip ${filter === c[0] ? "on" : ""}"
     data-f="${c[0]}">${c[1]}</button>`).join("");
  v.innerHTML = `
    <div id="qchips" class="chips">${chips()}</div>
    <div id="qlist">${rows(list)}</div>`;
  const redraw = () => {
    $("qchips").innerHTML = chips();
    $("qlist").innerHTML = rows(list);
  };
  $("qchips").onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    redraw();
  };
  $("qlist").onclick = async (e) => {
    const o = e.target.closest("[data-open]");
    if (o) {
      location.hash = "#/app/" + o.dataset.open;
      return;
    }
    const s = e.target.closest("[data-send]");
    const d = e.target.closest("[data-del]");
    try {
      if (s) {
        const id = s.dataset.send;
        const box = $("qlist").querySelector(
          '[data-ans="' + id + '"]');
        const text = box.value.trim();
        if (!text) {
          toast("Please write a few words.");
          return;
        }
        const patch = {
          answer: text.slice(0, 500),
          answeredAt: Date.now(),
          status: "answered"
        };
        await updateDoc(doc(db, "questions", id), patch);
        Object.assign(list.find((x) => x.id === id), patch);
        toast("Saved");
        redraw();
      } else if (d) {
        if (!confirm("Delete this question?")) return;
        await deleteDoc(doc(db, "questions", d.dataset.del));
        list = list.filter((x) => x.id !== d.dataset.del);
        redraw();
      }
    } catch (err) {
      toast("Failed: " + (err.code || err.message));
    }
  };
}
