const KEY = "theme";

function saved() {
  try { return localStorage.getItem(KEY); } catch (e) {
    return null;
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme || "dark";
}

function apply(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) {
    m.setAttribute("content",
      t === "light" ? "#f1f5f9" : "#0f172a");
  }
  const b = document.getElementById("btnTheme");
  if (b) b.textContent = t === "light" ? "☾" : "☀";
}

export function initTheme() {
  const light = window.matchMedia &&
    matchMedia("(prefers-color-scheme: light)").matches;
  apply(saved() || (light ? "light" : "dark"));
}

export function toggleTheme() {
  const t = currentTheme() === "light" ? "dark" : "light";
  try { localStorage.setItem(KEY, t); } catch (e) { /* ok */ }
  apply(t);
}
