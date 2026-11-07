import {
  db, collection, doc, getDoc, setDoc, updateDoc,
  getDocs, query, where, increment
} from "./firebase.js";
import { state } from "./auth.js";
import { ALERT_URL, ALERT_EVERY } from "./config.js";
import { $, esc, safeUrl, setTop, toast } from "./util.js";

const SEEN = "users_seen";

function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN)) || 0;
  } catch (e) { return 0; }
}

function writeSeen(ms) {
  try {
    localStorage.setItem(SEEN, String(ms));
  } catch (e) { /* ignore */ }
}

/* True if the admin blocked this account. */
export async function amBlocked(user) {
  try {
    const s = await getDoc(doc(db, "users", user.uid));
    return s.exists() && s.data().blocked === true;
  } catch (e) {
    return false;
  }
}

/* Saves who signed in. Runs once each time the app opens.
   The admin's own visits are not counted. */
export async function trackLogin(user) {
  if (state.admin) return;
  const ref = doc(db, "users", user.uid);
  const now = Date.now();
  const photo = user.photoURL || "";
  const name = (user.displayName || "User").slice(0, 100);
  const snap = await getDoc(ref);
  let isNew = false;
  if (snap.exists()) {
    await updateDoc(ref, {
      name: name,
      photo: photo.length <= 500 ? photo : "",
      lastLogin: now,
      logins: increment(1)
    });
  } else {
    isNew = true;
    await setDoc(ref, {
      uid: user.uid,
      name: name,
      email: user.email,
      photo: photo.length <= 500 ? photo : "",
      firstLogin: now,
      lastLogin: now,
      logins: 1
    });
  }
  if (isNew || ALERT_EVERY) alertAdmin(user);
}

/* Asks the Apps Script to send the admin an email.
   The script checks the sign-in token itself. */
async function alertAdmin(user) {
  if (!ALERT_URL) return;
  try {
    const token = await user.getIdToken();
    await fetch(ALERT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ token: token })
    });
  } catch (e) { /* ignore */ }
}

/* Admin: how many users joined since the list was opened. */
export async function newUsersCount() {
  const q = query(
    collection(db, "users"),
    where("firstLogin", ">", readSeen())
  );
  const snap = await getDocs(q);
  return snap.size;
}

function when(ms) {
  return ms ? new Date(ms).toLocaleString() : "-";
}

function rows(list, text) {
  const f = (text || "").toLowerCase();
  const out = list.filter((u) =>
    [u.name, u.email].join(" ").toLowerCase().includes(f));
  if (!out.length) {
    return '<p class="mut">No users found.</p>';
  }
  return out.map((u) => `
    <div class="row">
      <img class="rvimg big" alt=""
       src="${esc(safeUrl(u.photo))}">
      <div class="info">
        <b>${esc(u.name)}</b>
        <span class="mut">${esc(u.email)}</span>
        <span class="mut">Joined ${esc(when(u.firstLogin))}
        </span>
        <span class="mut">Last seen ${esc(when(u.lastLogin))}
        </span>
        <span class="tag">${esc(u.logins || 0)} visits</span>
        ${u.blocked
          ? '<span class="tag warn">Blocked</span>' : ""}
      </div>
      <button class="btn ghost small"
       data-block="${esc(u.id)}">${
        u.blocked ? "Unblock" : "Block"}</button>
    </div>`).join("");
}

export async function showUsers() {
  setTop("Users", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let list;
  try {
    const snap = await getDocs(collection(db, "users"));
    list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (b.lastLogin || 0) - (a.lastLogin || 0));
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  writeSeen(Date.now());
  $("btnAdmin").textContent = "Admin";
  v.innerHTML = `
    <p class="mut" style="margin-bottom:10px">
      ${list.length} ${list.length === 1
        ? "user" : "users"} signed in so far.</p>
    <input id="uq" class="search"
     placeholder="Search name or email...">
    <div id="ulist">${rows(list, "")}</div>`;
  const redraw = () => {
    $("ulist").innerHTML = rows(list, $("uq").value);
  };
  $("uq").oninput = redraw;
  $("ulist").onclick = async (e) => {
    const b = e.target.closest("[data-block]");
    if (!b) return;
    const u = list.find((x) => x.id === b.dataset.block);
    const next = !u.blocked;
    const ask = next
      ? "Block " + u.email + "? They cannot use the app."
      : "Unblock " + u.email + "?";
    if (!confirm(ask)) return;
    try {
      await updateDoc(doc(db, "users", u.id),
        { blocked: next });
      u.blocked = next;
      redraw();
    } catch (err) {
      toast("Failed: " + (err.code || err.message));
    }
  };
}
