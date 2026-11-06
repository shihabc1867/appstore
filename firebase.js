import { initializeApp } from
 "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from
 "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from
 "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===== PASTE YOUR FIREBASE CONFIG HERE ===== */
const firebaseConfig = {
  apiKey: "AIzaSyA_jdQo_SA-yEGQ_ehlfFNcbqBr58a-HEA",
  authDomain: "build-77.firebaseapp.com",
  projectId: "build-77",
  storageBucket: "build-77.firebasestorage.app",
  messagingSenderId: "322193333344",
  appId: "1:322193333344:web:d2f2df9217cdb4e890f705"
};
/* =========================================== */

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* Every other file imports Firebase from here. */
export * from
 "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export * from
 "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
