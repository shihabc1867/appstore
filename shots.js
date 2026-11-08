import { db, doc, getDoc, setDoc } from "./firebase.js";

/* Screenshots picked from the phone gallery.
   Saved in a separate document so the home list
   stays light. */
export const MAX_SHOTS = 6;
const MAX_ONE = 130000;
export const MAX_ALL = 900000;

export async function getShots(appId) {
  try {
    const s = await getDoc(doc(db, "appshots", appId));
    return s.exists() ? (s.data().images || []) : [];
  } catch (e) {
    return [];
  }
}

export async function saveShots(appId, images) {
  await setDoc(doc(db, "appshots", appId), { images: images });
}

export function totalSize(images) {
  return images.reduce((s, x) => s + x.length, 0);
}

/* Shrinks one gallery picture until it is small enough. */
export async function fileToShot(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("not an image"));
      i.src = url;
    });
    const tries = [[800, 0.8], [640, 0.7], [480, 0.6], [360, 0.5]];
    for (const t of tries) {
      const k = Math.min(1, t[0] / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL("image/webp", t[1]);
      if (d.length <= MAX_ONE) return d;
    }
    throw new Error("picture is too detailed");
  } finally {
    URL.revokeObjectURL(url);
  }
}
