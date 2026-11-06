import {
  db, collection, doc, getDocs, setDoc, deleteDoc
} from "./firebase.js";
import { state } from "./auth.js";
import { $, esc, safeUrl, toast } from "./util.js";

const stars = (n) =>
  "★".repeat(n) + "☆".repeat(5 - n);

function dateOf(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

/* Loads all reviews of one app and draws them. */
export async function renderReviews(app, box) {
  box.innerHTML = `
    <h3 style="margin:24px 0 10px">
      Ratings and reviews</h3>
    <p class="mut">Loading...</p>`;
  let list;
  try {
    const col = collection(db, "apps", app.id, "reviews");
    const snap = await getDocs(col);
    list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (b.updated || 0) - (a.updated || 0));
  } catch (e) {
    box.innerHTML = '<p class="err">Reviews: ' +
      esc(e.code || e.message) + "</p>";
    return;
  }
  draw(app, box, list);
}

function others(list, uid) {
  const rest = list.filter((r) => r.id !== uid);
  if (!rest.length) {
    return '<p class="mut">No other reviews yet.</p>';
  }
  return rest.map((r) => `
    <div class="rv">
      <div class="rvtop">
        <img class="rvimg" alt=""
         src="${esc(safeUrl(r.photo))}">
        <div class="info">
          <b>${esc(r.name || "User")}</b>
          <div class="stars sm">${stars(r.rating || 0)}
            <span class="mut">
              ${esc(dateOf(r.updated))}</span></div>
        </div>
        ${state.admin
          ? `<button class="btn ghost small"
              data-del="${esc(r.id)}">Delete</button>`
          : ""}
      </div>
      ${r.text
        ? `<p class="desc">${esc(r.text)}</p>` : ""}
    </div>`).join("");
}

function draw(app, box, list) {
  const uid = state.user.uid;
  const mine = list.find((r) => r.id === uid);
  const n = list.length;
  const sum = list.reduce((s, r) => s + (r.rating || 0), 0);
  const avg = n ? sum / n : 0;
  let pick = mine ? mine.rating : 0;

  box.innerHTML = `
    <h3 style="margin:24px 0 10px">
      Ratings and reviews</h3>
    <div class="avg">
      <span class="big">${n ? avg.toFixed(1) : "-"}</span>
      <div>
        <div class="stars">${stars(Math.round(avg))}</div>
        <span class="mut">${n} ${
          n === 1 ? "review" : "reviews"}</span>
      </div>
    </div>
    <div class="mine">
      <p class="lbl">${
        mine ? "Your review" : "Rate this app"}</p>
      <div id="pick" class="stars pick"></div>
      <textarea id="rv_text" class="inp" rows="3"
       maxlength="500"
       placeholder="Write a short review (optional)"
      >${esc(mine ? mine.text : "")}</textarea>
      <p id="rv_err" class="err"></p>
      <button id="rv_save" class="btn block">
        ${mine ? "Update review" : "Submit"}</button>
      ${mine
        ? `<button id="rv_del" class="btn ghost block"
            style="margin-top:10px">
            Delete my review</button>` : ""}
    </div>
    <div id="rv_list">${others(list, uid)}</div>`;

  const paint = () => {
    $("pick").innerHTML = [1, 2, 3, 4, 5].map((i) => `
      <button class="star" data-r="${i}">${
        i <= pick ? "★" : "☆"}</button>`).join("");
  };
  paint();
  $("pick").onclick = (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    pick = Number(b.dataset.r);
    paint();
  };
  $("rv_save").onclick = () => save(app, box, () => pick);
  if (mine) {
    $("rv_del").onclick = () => remove(app, box, uid);
  }
  $("rv_list").onclick = (e) => {
    const b = e.target.closest("[data-del]");
    if (b) remove(app, box, b.dataset.del);
  };
}

async function save(app, box, getPick) {
  const err = $("rv_err");
  err.textContent = "";
  const rating = getPick();
  if (rating < 1) {
    err.textContent = "Please choose 1 to 5 stars.";
    return;
  }
  const u = state.user;
  const photo = u.photoURL || "";
  const data = {
    uid: u.uid,
    name: (u.displayName || "User").slice(0, 100),
    photo: photo.length <= 500 ? photo : "",
    rating: rating,
    text: $("rv_text").value.trim().slice(0, 500),
    updated: Date.now()
  };
  $("rv_save").disabled = true;
  try {
    await setDoc(
      doc(db, "apps", app.id, "reviews", u.uid), data);
    toast("Thanks for your review");
    await renderReviews(app, box);
  } catch (e) {
    err.textContent = "Save failed: " + (e.code || e.message);
    $("rv_save").disabled = false;
  }
}

async function remove(app, box, id) {
  if (!confirm("Delete this review?")) return;
  try {
    await deleteDoc(doc(db, "apps", app.id, "reviews", id));
    toast("Deleted");
    await renderReviews(app, box);
  } catch (e) {
    toast("Delete failed: " + (e.code || e.message));
  }
}
