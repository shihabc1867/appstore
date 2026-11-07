import { state, watchAuth, login, logout } from "./auth.js";
import { $, show, toast } from "./util.js";
import { showList, showDetails, clearCache } from "./store.js";
import { showAdmin, showForm } from "./admin.js";
import {
  showVault, showVaultForm, showVaultItem
} from "./vault.js";
import {
  trackLogin, newUsersCount, showUsers, amBlocked
} from "./users.js";
import { showReports } from "./reports.js";
import { showDashboard } from "./dashboard.js";
import { showRestore } from "./restore.js";
import { clearFavs } from "./favs.js";
import { initTheme, toggleTheme } from "./theme.js";

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
  [/^#\/users$/, () => adminOnly(showUsers)],
  [/^#\/reports$/, () => adminOnly(showReports)],
  [/^#\/dashboard$/, () => adminOnly(showDashboard)],
  [/^#\/restore$/, () => adminOnly(showRestore)],
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

/* ---------- Theme ---------- */
initTheme();
$("btnTheme").onclick = toggleTheme;

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

/* Admin: show how many new users joined. */
async function usersBadge() {
  try {
    const n = await newUsersCount();
    if (!n) return;
    $("btnAdmin").textContent = "Admin (" + n + " new)";
    toast(n + (n === 1 ? " new user" : " new users"));
  } catch (e) { /* ignore */ }
}

watchAuth(async (u) => {
  if (!u) {
    clearCache();
    show("login");
    return;
  }
  if (!state.admin && await amBlocked(u)) {
    await logout();
    show("login");
    $("loginErr").textContent =
      "This account is blocked. Contact the owner.";
    return;
  }
  $("avatar").src = u.photoURL || "icon-192.png";
  $("btnAdmin").classList.toggle("hide", !state.admin);
  clearCache();
  clearFavs();
  show("shell");
  if (state.adminErr) {
    toast("Admin check: " + state.adminErr);
  }
  await route();
  if (state.admin) usersBadge();
  else trackLogin(u).catch(() => {});
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
