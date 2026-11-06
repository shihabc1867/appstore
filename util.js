/* Small helpers shared by all files. */
export const $ = (id) => document.getElementById(id);

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

export function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return /^https?:$/.test(x.protocol) ? x.href : "";
  } catch (e) { return ""; }
}

/* Turns common share links into direct links. */
function driveId(x) {
  const m = x.pathname.match(/\/file\/d\/([^/]+)/);
  return m ? m[1] : x.searchParams.get("id");
}

/* For images (logo, screenshots). */
export function imgUrl(u) {
  const s = safeUrl(u);
  if (!s) return "";
  const x = new URL(s);
  if (x.hostname === "drive.google.com") {
    const id = driveId(x);
    if (id) {
      return "https://drive.google.com/thumbnail?id=" +
        id + "&sz=w1000";
    }
  }
  if (x.hostname === "github.com") {
    const m = x.pathname.match(
      /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) {
      return "https://raw.githubusercontent.com/" +
        m[1] + "/" + m[2] + "/" + m[3];
    }
  }
  return s;
}

/* For app files (APK). */
export function dlUrl(u) {
  const s = safeUrl(u);
  if (!s) return "";
  const x = new URL(s);
  if (x.hostname === "drive.google.com") {
    const id = driveId(x);
    if (id) {
      return "https://drive.google.com/uc?export=download&id=" +
        id;
    }
  }
  if (x.hostname === "github.com") {
    const m = x.pathname.match(
      /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) {
      return "https://github.com/" + m[1] + "/" + m[2] +
        "/raw/" + m[3];
    }
  }
  if (/(^|\.)dropbox\.com$/.test(x.hostname)) {
    x.searchParams.set("dl", "1");
    return x.href;
  }
  return s;
}

/* Logo of an app: picked image first, then link. */
export function iconSrc(a) {
  return a.iconData || imgUrl(a.iconUrl);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/* title = header text, back = hash to go back to */
export function setTop(title, back) {
  $("title").textContent = title;
  const b = $("btnBack");
  b.dataset.to = back || "";
  b.classList.toggle("hide", !back);
}

export function show(which) {
  ["loading", "login", "shell"].forEach((n) =>
    $(n).classList.toggle("hide", n !== which)
  );
}

let timer = null;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hide");
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.add("hide"), 2500);
}
