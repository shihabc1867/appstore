import {
  auth, db, doc, getDoc, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, signOut
} from "./firebase.js";

/* Current user and admin flag, read by other files. */
export const state = { user: null, admin: false };

export async function login() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, p);
    return "";
  } catch (e) {
    if (e.code === "auth/popup-blocked" ||
        e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, p);
      return "";
    }
    if (e.code === "auth/popup-closed-by-user") return "";
    return "Login failed: " + (e.code || e.message);
  }
}

export function logout() {
  return signOut(auth);
}

/* Admin = a document in "admins" named by the email. */
async function checkAdmin(user) {
  try {
    const s = await getDoc(doc(db, "admins", user.email));
    return s.exists();
  } catch (e) {
    return false;
  }
}

export function watchAuth(cb) {
  onAuthStateChanged(auth, async (u) => {
    state.user = u;
    state.admin = u ? await checkAdmin(u) : false;
    cb(u);
  });
}
