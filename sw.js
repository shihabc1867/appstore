const CACHE = "store-v19";
const SHELL = [
  "./", "./index.html", "./style.css", "./manifest.json",
  "./firebase.js", "./util.js", "./auth.js",
  "./store.js", "./admin.js", "./vault.js",
  "./notify.js", "./reviews.js", "./users.js",
  "./config.js", "./favs.js", "./announce.js",
  "./theme.js", "./reports.js", "./dashboard.js",
  "./restore.js", "./i18n.js", "./shots.js",
  "./push.js", "./app.js",
  "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* Always fresh from network; cache only when offline. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

/* ---------- Push notifications ---------- */
self.addEventListener("push", (e) => {
  let j = {};
  try { j = e.data ? e.data.json() : {}; } catch (x) { /* */ }
  const d = j.data || j.notification || j;
  const title = d.title || "My App Store";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data || {}).url || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
