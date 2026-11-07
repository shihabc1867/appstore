import { db, doc, getDoc, setDoc } from "./firebase.js";
import { $, esc, toast } from "./util.js";

const SEEN = "ann_seen";
const ref = () => doc(db, "settings", "announcement");

function seen() {
  try {
    return Number(localStorage.getItem(SEEN)) || 0;
  } catch (e) { return 0; }
}

export async function loadAnnouncement() {
  const s = await getDoc(ref());
  return s.exists() ? s.data() : null;
}

/* Notice box for the top of the home page. */
export function annHtml(a) {
  if (!a || !a.on || !a.text) return "";
  if (seen() >= (a.updated || 0)) return "";
  return `
    <div id="ann" class="note ann">
      <div class="nhead">
        <b>Notice</b>
        <button id="annX" class="btn ghost small">
          Close</button>
      </div>
      <p class="desc">${esc(a.text)}</p>
    </div>`;
}

export function bindAnn(a) {
  const x = $("annX");
  if (!x) return;
  x.onclick = () => {
    try {
      localStorage.setItem(SEEN, String(a.updated || 0));
    } catch (e) { /* ok */ }
    $("ann").remove();
  };
}

/* Admin: write the notice. */
export async function renderAnnounceEditor(box) {
  let a = null;
  try { a = await loadAnnouncement(); } catch (e) { a = null; }
  box.innerHTML = `
    <h3 style="margin:24px 0 6px">Announcement</h3>
    <p class="mut hint">
      Shown at the top of the home page to all users.</p>
    <textarea id="an_text" class="inp" rows="3"
     maxlength="500">${esc(a ? a.text : "")}</textarea>
    <label class="chk">
      <input type="checkbox" id="an_on"
       ${!a || a.on ? "checked" : ""}>
      Show to users
    </label>
    <button id="an_save" class="btn block">
      Save announcement</button>`;
  $("an_save").onclick = async () => {
    $("an_save").disabled = true;
    try {
      await setDoc(ref(), {
        text: $("an_text").value.trim(),
        on: $("an_on").checked,
        updated: Date.now()
      });
      toast("Saved");
    } catch (e) {
      toast("Save failed: " + (e.code || e.message));
    }
    $("an_save").disabled = false;
  };
}
