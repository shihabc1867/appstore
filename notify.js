import { state } from "./auth.js";

/* Remembers which app versions this user has seen.
   Saved on this phone only (no server needed). */
const key = () => "seen_" + state.user.uid;

function read() {
  try {
    const t = localStorage.getItem(key());
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return undefined;   /* storage not available */
  }
}

function write(map) {
  try {
    localStorage.setItem(key(), JSON.stringify(map));
  } catch (e) { /* ignore */ }
}

const ver = (a) => String(a.version || "");

/* First run: treat everything as already seen. */
export function baseline(list) {
  if (state.admin || read() !== null) return;
  const m = {};
  list.forEach((a) => { m[a.id] = ver(a); });
  write(m);
}

/* Apps that are new or changed version for this user. */
export function pending(list) {
  if (state.admin) return [];
  const m = read();
  if (!m) return [];
  const out = [];
  list.forEach((a) => {
    if (!(a.id in m)) out.push({ app: a, type: "new" });
    else if (m[a.id] !== ver(a)) {
      out.push({ app: a, type: "update" });
    }
  });
  return out;
}

export function markSeen(a) {
  if (state.admin) return;
  const m = read();
  if (!m) return;
  m[a.id] = ver(a);
  write(m);
}

export function markAll(list) {
  if (state.admin) return;
  const m = read() || {};
  list.forEach((a) => { m[a.id] = ver(a); });
  write(m);
}
