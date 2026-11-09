import {
  db, collection, getDocs, query, where
} from "./firebase.js";
import { loadApps } from "./store.js";
import { loadRatings } from "./reviews.js";
import { $, esc, setTop } from "./util.js";

const DAY = 86400000;
const pad = (n) => (n < 10 ? "0" + n : "" + n);

function dayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate());
}

function tile(label, value, small) {
  return `
    <div class="fact"><span>${esc(label)}</span>
      <b class="n">${esc(value)}</b>
      ${small ? `<span>${esc(small)}</span>` : ""}
    </div>`;
}

/* Horizontal bars: [{name, value, text}] */
function hbars(items) {
  if (!items.length) {
    return '<p class="mut">Nothing yet.</p>';
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => `
    <div class="hb">
      <span class="hname">${esc(i.name)}</span>
      <div class="hwrap"><div class="hbar"
       style="width:${Math.max(3,
         Math.round(i.value / max * 100))}%"></div></div>
      <b>${esc(i.text)}</b>
    </div>`).join("");
}

/* New users per day, last 14 days. */
function dayBars(users) {
  const days = [];
  const now = Date.now();
  for (let i = 13; i >= 0; i--) {
    days.push({ key: dayKey(now - i * DAY), n: 0 });
  }
  users.forEach((u) => {
    const d = days.find((x) => x.key === dayKey(u.firstLogin));
    if (d) d.n += 1;
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  return `
    <div class="bars">${days.map((d) => `
      <div class="barcol" title="${esc(d.key)}: ${d.n}">
        <span class="bn">${d.n || ""}</span>
        <div class="bar" style="height:${
          Math.round(d.n / max * 80) + 2}px"></div>
        <span class="bl">${esc(d.key.slice(8))}</span>
      </div>`).join("")}</div>`;
}

/* Downloads per day, per app (last 14 days). */
function dlSection(apps, rows) {
  const now = Date.now();
  const keys = [];
  for (let i = 13; i >= 0; i--) keys.push(dayKey(now - i * DAY));
  const by = {};
  const all = {};
  rows.forEach((r) => {
    if (!keys.includes(r.day)) return;
    by[r.appId] = by[r.appId] || {};
    by[r.appId][r.day] = (by[r.appId][r.day] || 0) + r.n;
    all[r.day] = (all[r.day] || 0) + r.n;
  });
  const total = keys.reduce((s, k) => s + (all[k] || 0), 0);
  if (!total) {
    return '<p class="mut">No downloads counted yet.</p>';
  }
  const max = Math.max(1, ...keys.map((k) => all[k] || 0));
  const chart = `
    <div class="bars">${keys.map((k) => `
      <div class="barcol" title="${esc(k)}: ${all[k] || 0}">
        <span class="bn">${all[k] || ""}</span>
        <div class="bar" style="height:${
          Math.round((all[k] || 0) / max * 80) + 2}px"></div>
        <span class="bl">${esc(k.slice(8))}</span>
      </div>`).join("")}</div>`;
  const last7 = keys.slice(7);
  const list = apps.map((a) => {
    const m = by[a.id] || {};
    const vals = last7.map((k) => m[k] || 0);
    return {
      name: a.name || "App", vals: vals,
      sum: vals.reduce((s, x) => s + x, 0)
    };
  }).filter((x) => x.sum)
    .sort((x, y) => y.sum - x.sum).slice(0, 8);
  const rowsHtml = list.map((x) => {
    const mx = Math.max(1, ...x.vals);
    return `
      <div class="hb">
        <span class="hname">${esc(x.name)}</span>
        <div class="spark">${x.vals.map((n) => `
          <i style="height:${Math.round(n / mx * 22) + 2}px"
           title="${n}"></i>`).join("")}</div>
        <b>${x.sum}</b>
      </div>`;
  }).join("");
  return chart + `
    <h3 style="margin-top:20px">Per app, last 7 days</h3>
    ${rowsHtml || '<p class="mut">Nothing in 7 days.</p>'}`;
}

export async function showDashboard() {
  setTop("Dashboard", "#/admin");
  const v = $("view");
  v.innerHTML = '<p class="mut">Loading...</p>';
  let apps, users, openReports, ratings, dls;
  try {
    const rq = query(collection(db, "reports"),
      where("status", "==", "open"));
    const from = dayKey(Date.now() - 13 * DAY);
    const dq = query(collection(db, "dl"),
      where("day", ">=", from));
    const res = await Promise.all([
      loadApps(),
      getDocs(collection(db, "users")),
      getDocs(rq),
      loadRatings(),
      getDocs(dq)
    ]);
    apps = res[0];
    users = res[1].docs.map((d) => d.data());
    openReports = res[2].size;
    ratings = res[3];
    dls = res[4].docs.map((x) => x.data());
  } catch (e) {
    v.innerHTML = '<p class="err">Could not load: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  const now = Date.now();
  const live = apps.filter((a) => a.published !== false);
  const downloads = apps.reduce(
    (s, a) => s + (a.downloads || 0), 0);
  const week = users.filter(
    (u) => now - (u.firstLogin || 0) < 7 * DAY).length;
  const active = users.filter(
    (u) => now - (u.lastLogin || 0) < 7 * DAY).length;
  const blocked = users.filter((u) => u.blocked).length;
  let revCount = 0;
  let revSum = 0;
  Object.keys(ratings).forEach((k) => {
    revCount += ratings[k].n;
    revSum += ratings[k].sum;
  });
  const topDl = apps.slice()
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
    .slice(0, 5)
    .map((a) => ({
      name: a.name || "App",
      value: a.downloads || 0,
      text: String(a.downloads || 0)
    }));
  const topRated = apps
    .filter((a) => ratings[a.id] && ratings[a.id].n)
    .map((a) => ({
      name: a.name || "App",
      value: ratings[a.id].sum / ratings[a.id].n,
      text: "★ " + (ratings[a.id].sum / ratings[a.id].n)
        .toFixed(1) + " (" + ratings[a.id].n + ")"
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  v.innerHTML = `
    <div class="facts">
      ${tile("Apps", live.length,
        apps.length - live.length + " hidden")}
      ${tile("Users", users.length,
        blocked + " blocked")}
      ${tile("New users (7 days)", week)}
      ${tile("Active users (7 days)", active)}
      ${tile("Downloads / opens", downloads)}
      ${tile("Reviews", revCount, revCount
        ? "average " + (revSum / revCount).toFixed(1) : "")}
      ${tile("Open reports", openReports)}
    </div>
    <h3 style="margin-top:20px">New users, last 14 days</h3>
    ${dayBars(users)}
    <h3 style="margin-top:20px">Downloads, last 14 days</h3>
    ${dlSection(apps, dls)}
    <h3 style="margin-top:20px">Most downloaded</h3>
    ${hbars(topDl)}
    <h3 style="margin-top:20px">Top rated</h3>
    ${hbars(topRated)}
    <p class="mut" style="margin-top:20px">
      Your own visits are not counted in users.</p>`;
}
