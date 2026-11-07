import { db, doc, getDoc, setDoc } from "./firebase.js";
import { state } from "./auth.js";

/* Each user's saved apps, kept in Firestore so they
   follow the user to any phone. */
let ids = null;

export function clearFavs() { ids = null; }

export async function loadFavs() {
  if (ids) return ids;
  try {
    const s = await getDoc(doc(db, "favs", state.user.uid));
    ids = s.exists() ? (s.data().ids || []) : [];
  } catch (e) {
    ids = [];
  }
  return ids;
}

export function isFav(id) {
  return !!ids && ids.includes(id);
}

/* Adds or removes one app. Returns the new list. */
export async function toggleFav(id) {
  await loadFavs();
  const next = ids.includes(id)
    ? ids.filter((x) => x !== id)
    : ids.concat(id).slice(-200);
  await setDoc(doc(db, "favs", state.user.uid), { ids: next });
  ids = next;
  return ids;
}
