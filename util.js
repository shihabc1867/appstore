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
