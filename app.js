import { state, watchAuth, login, logout } from "./auth.js";
import { $, show, toast } from "./util.js";
import { showList, showDetails, clearCache } from "./store.js";
import { showAdmin, showForm } from "./admin.js";
import {
  showVault, showVaultForm, showVaultItem
} from "./vault.js";

/* ============================================
   ROUTE TABLE
   To add a new screen in a later phase:
   1. write the screen in its own file
   2. import it above
   3. add one line below
   ============================================ */
const routes = [
  [/^(#\/?)?$/, () => showList()],
  [/^#\/app\/(.+)$/, (m) => showDetails(m[1])],
  [/^#\/admin$/, () => adminOnly(showAdmin)],
  [/^#\/admin\/new$/, () => adminOnly(() => showForm())],
  [/^#\/admin\/edit\/(.+)$/,
    (m) => adminOnly(() => showForm(m[1]))],
  [/^#\/vault$/, () => adminOnly(showVault)],
  [/^#\/vault\/new$/,
    () => adminOnly(() => showVaultForm())],
  [/^#\/vault\/new\/(.+)$/,
    (m) => adminOnly(() => showVaultForm(null, m[1]))],
  [/^#\/vault\/view\/(.+)$/,
    (m) => adminOnly(() => showVaultItem(m[1]))],
  [/^#\/vault\/edit\/(.+)$/,
    (m) => adminOnly(() => showVaultForm(m[1]))]
];

function adminOnly(fn) {
  if (!state.admin) {
    location.hash = "#/";
    return;
  }
  return fn();
}

async function route() {
  if (!state.user) return;
  const hash = location.hash;
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      $("view").onclick = null;
      await fn(m.map((x) => x && decodeURIComponent(x)));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", route);

/* ---------- Header ---------- */
$("btnBack").onclick = () => {
  const to = $("btnBack").dataset.to;
  if (to) location.hash = to;
};
$("btnAdmin").onclick = () => { location.hash = "#/admin"; };
$("avatar").onclick = async () => {
  const who = state.user ? state.user.email : "";
  if (confirm("Signed in as " + who + ". Sign out?")) {
    await logout();
  }
};

/* ---------- Login ---------- */
$("btnLogin").onclick = async () => {
  $("loginErr").textContent = "";
  $("loginErr").textContent = await login();
};

watchAuth(async (u) => {
  if (!u) {
    clearCache();
    show("login");
    return;
  }
  $("avatar").src = u.photoURL || "icon-192.png";
  $("btnAdmin").classList.toggle("hide", !state.admin);
  clearCache();
  show("shell");
  if (state.adminErr) {
    toast("Admin check: " + state.adminErr);
  }
  await route();
});

/* ---------- Install (PWA) ---------- */
let deferred = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  $("install").classList.remove("hide");
});
$("install").onclick = async () => {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  $("install").classList.add("hide");
};
window.addEventListener("appinstalled", () => {
  $("install").classList.add("hide");
  toast("Installed");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .catch(() => {});
}
