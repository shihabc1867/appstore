import {
  db, collection, doc, getDocs, setDoc, writeBatch
} from "./firebase.js";
import { state } from "./auth.js";
import { $, esc, setTop, toast } from "./util.js";
import { VAPID_KEY, PUSH_URL } from "./config.js";

const CDN = "https://www.gstatic.com/firebasejs/10.12.2/";
const PREF = "pushOn";
const TOK = "pushTok";

const supported = () =>
  !!VAPID_KEY && "Notification" in window &&
  "serviceWorker" in navigator && "PushManager" in window;

const getPref = () => {
  try { return localStorage.getItem(PREF); }
  catch (e) { return null; }
};
const setPref = (k, v) => {
  try { localStorage.setItem(k, v); } catch (e) { /* */ }
};

/* Asks Google for this phone's address. */
async function fetchToken() {
  const a = await import(CDN + "firebase-app.js");
  const m = await import(CDN + "firebase-messaging.js");
  if (!(await m.isSupported())) {
    throw new Error("This browser cannot get notifications");
  }
  const reg = await navigator.serviceWorker.ready;
  const msg = m.getMessaging(a.getApp());
  const t = await m.getToken(msg, {
    vapidKey: VAPID_KEY, serviceWorkerRegistration: reg
  });
  if (!t) throw new Error("No token received");
  return { t: t, m: m, msg: msg };
}

async function saveToken(t) {
  await setDoc(doc(db, "tokens", t), {
    token: t, uid: state.user.uid, updated: Date.now()
  });
  setPref(TOK, t);
}

async function turnOn() {
  const p = await Notification.requestPermission();
  if (p !== "granted") throw new Error("Permission not given");
  const r = await fetchToken();
  await saveToken(r.t);
  setPref(PREF, "1");
}

async function turnOff() {
  setPref(PREF, "0");
  let t = "";
  try { t = localStorage.getItem(TOK) || ""; }
  catch (e) { /* */ }
  try {
    const r = await fetchToken();
    t = t || r.t;
    await r.m.deleteToken(r.msg);
  } catch (e) { /* ignore */ }
  if (t) {
    const b = writeBatch(db);
    b.delete(doc(db, "tokens", t));
    await b.commit();
  }
}

/* ---------- Switch shown on the home page ---------- */
export function renderPushBox(box) {
  if (!supported()) {
    box.innerHTML = "";
    return;
  }
  const perm = Notification.permission;
  const on = perm === "granted" && getPref() !== "0";
  if (perm === "denied") {
    box.innerHTML = `<p class="mut hint">
      Notifications are blocked in your browser
      settings.</p>`;
    return;
  }
  box.innerHTML = `
    <button id="pushBtn" class="btn ghost small">${
      on ? "Notifications: On" : "Turn on notifications"
    }</button>`;
  $("pushBtn").onclick = async () => {
    $("pushBtn").disabled = true;
    try {
      if (on) {
        await turnOff();
        toast("Notifications off");
      } else {
        await turnOn();
        toast("Notifications on");
      }
    } catch (e) {
      toast("Failed: " + (e.message || e.code));
    }
    renderPushBox(box);
  };
  /* Keeps the saved address fresh (it can change). */
  if (on && !window.__pushFresh) {
    window.__pushFresh = true;
    fetchToken().then((r) => saveToken(r.t))
      .catch(() => {});
  }
}

/* ---------- Admin: send a notification ---------- */
export async function showPushSend() {
  setTop("Send notification", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let tokens, apps;
  try {
    const t = await getDocs(collection(db, "tokens"));
    tokens = t.docs.map((d) => d.id);
    const a = await getDocs(collection(db, "apps"));
    apps = a.docs.map((d) => ({
      id: d.id, name: d.data().name || "(no name)"
    }));
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  const opts = apps.map((a) => `
    <option value="${esc(a.id)}">${esc(a.name)}</option>`
  ).join("");
  v.innerHTML = `
    <p class="mut">${tokens.length} phone${
      tokens.length === 1 ? "" : "s"} can get
      notifications.</p>
    ${PUSH_URL ? "" : `<p class="err">
      PUSH_URL is empty in config.js. Sending is
      off.</p>`}
    <label class="lbl" for="p_title">Title *</label>
    <input id="p_title" class="inp" maxlength="60">
    <label class="lbl" for="p_body">Message *</label>
    <textarea id="p_body" class="inp" rows="4"
     maxlength="150"></textarea>
    <label class="lbl" for="p_app">Opens</label>
    <select id="p_app" class="inp">
      <option value="">Home page</option>${opts}
    </select>
    <p id="p_err" class="err"></p>
    <button id="p_send" class="btn block">Send</button>`;
  $("p_send").onclick = () => send(tokens, apps);
}

export const pushReady = () => !!(VAPID_KEY && PUSH_URL);

/* Sends one notification to every saved phone.
   Returns { sent, failed, error, phones }. Throws on error. */
export async function pushTo(title, body, appId) {
  if (!PUSH_URL) throw new Error("PUSH_URL is empty");
  const t = await getDocs(collection(db, "tokens"));
  const tokens = t.docs.map((d) => d.id);
  if (!tokens.length) {
    return { sent: 0, failed: 0, error: "", phones: 0 };
  }
  const base = location.origin + location.pathname;
  const idt = await state.user.getIdToken();
  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "push", token: idt, title: title,
      body: body, tokens: tokens,
      url: base + (appId ? "#/app/" + appId : "")
    })
  });
  const r = JSON.parse(await res.text());
  if (!r.ok) throw new Error(r.error || "failed");
  if (r.bad && r.bad.length) {
    const b = writeBatch(db);
    r.bad.forEach((x) => b.delete(doc(db, "tokens", x)));
    await b.commit();
  }
  r.phones = tokens.length;
  return r;
}

async function send(tokens) {
  const err = $("p_err");
  err.textContent = "";
  const title = $("p_title").value.trim();
  const body = $("p_body").value.trim();
  if (!title || !body) {
    err.textContent = "Title and message are required.";
    return;
  }
  if (!PUSH_URL) {
    err.textContent = "PUSH_URL is empty in config.js.";
    return;
  }
  if (!tokens.length) {
    err.textContent = "No phone has turned notifications on.";
    return;
  }
  if (!confirm("Send to " + tokens.length + " phone(s)?")) {
    return;
  }
  $("p_send").disabled = true;
  try {
    const r = await pushTo(title, body, $("p_app").value);
    toast("Sent " + r.sent + ", failed " + r.failed);
    if (r.failed && r.error) {
      err.textContent = "First error: " + r.error;
    }
  } catch (e) {
    err.textContent = "Could not send: " +
      (e.message || e.code);
  }
  $("p_send").disabled = false;
}
