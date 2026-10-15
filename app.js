// Komunikacija · kurs do Nove godine. Vanilla ES moduli, hash ruter, bez build koraka.
// Struktura: 3 meseca × 4 nedelje. Nedelja se otključava kad dođe njen ponedeljak I kad je prethodna ≥ 80 % urađena.
import * as store from "./store.js";

const $main = document.getElementById("main");
const $side = document.getElementById("side");
const $tabs = document.getElementById("tabs");
const $toast = document.getElementById("toast");

let PLAN = null;
const byDate = new Map();
const weekById = new Map();
const UNLOCK_PCT = 80;
const MONTHS_DEF = [["Mesec 1", "Temelj: kostur, dah, small talk", ["W0", "W1", "W2", "W3"]], ["Mesec 2", "Pitanja, priča, pitch", ["W4", "W5", "W6", "W7"]], ["Mesec 3", "Finale i prenos u život", ["W8", "W9", "W10", "W11"]]];

const SLOT = {
  glas: { label: "Glas", icon: "ph-microphone" }, telo: { label: "Telo", icon: "ph-person-simple" }, glavno: { label: "Glavna vežba", icon: "ph-target" },
  pitch: { label: "Pitch", icon: "ph-presentation" }, checkpoint: { label: "Checkpoint", icon: "ph-flag-checkered" }, checkin: { label: "Check-in", icon: "ph-chat-circle-dots" },
  izazov: { label: "Izazov", icon: "ph-fire" }, refleksija: { label: "Dnevnik", icon: "ph-notebook" }, bus: { label: "Bus", icon: "ph-bus" },
};
const WEEK_ICON = { W0: "ph-compass", W1: "ph-microphone", W2: "ph-translate", W3: "ph-chats-circle", W4: "ph-lightning", W5: "ph-book-open", W6: "ph-presentation", W7: "ph-wrench", W8: "ph-snowflake", W9: "ph-trophy", W10: "ph-users-three", W11: "ph-flag-checkered" };
const SLOT_ORDER = ["glas", "telo", "glavno", "pitch", "checkpoint", "checkin", "izazov", "refleksija", "bus"];
const MONTHS = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"];
const DOWS = ["ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota", "nedelja"];

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtLong = (iso) => { const d = parse(iso); return `${DOWS[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const fmtShort = (iso) => { const d = parse(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
const clampDate = (iso) => { const f = PLAN.days[0].date, l = PLAN.days.at(-1).date; return iso < f ? f : iso > l ? l : iso; };
const taskKey = (date, t, i) => `${date}|${t.id || slug(t.name)}|${i}`;
const isCore = (t) => t.slot !== "bus" && t.slot !== "izazov";
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const cleanRule = (r) => r.replace(/^Pravilo nedelje:\s*/i, "").replace(/^Pravilo:\s*/i, "");

const buzz = (p) => { try { navigator.vibrate?.(p); } catch {} };
function toast(msg) { $toast.textContent = msg; $toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove("show"), 1800); }

function dayStats(day) {
  const done = store.all("done");
  let n = 0, nd = 0, min = 0, mind = 0;
  day.tasks.forEach((t, i) => { if (!isCore(t)) return; n++; min += t.min; if (done[taskKey(day.date, t, i)]) { nd++; mind += t.min; } });
  return { n, nd, min, mind, pct: n ? Math.round((nd / n) * 100) : 0 };
}
function weekStats(w) {
  const days = PLAN.days.filter((d) => d.week === w.id);
  const a = days.reduce((x, d) => { const s = dayStats(d); x.n += s.n; x.nd += s.nd; return x; }, { n: 0, nd: 0 });
  return { ...a, pct: a.n ? Math.round((a.nd / a.n) * 100) : 0, days };
}
function isDone(date, t, i) { return !!store.get("done", taskKey(date, t, i)); }

// Otključavanje: W0 uvek; ostale kad dođe ponedeljak nedelje I prethodna ≥ UNLOCK_PCT.
function weekUnlocked(w) {
  const idx = PLAN.weeks.findIndex((x) => x.id === w.id);
  if (idx === 0) return true;
  if (isoToday() < w.from_) return false;
  return weekStats(PLAN.weeks[idx - 1]).pct >= UNLOCK_PCT;
}
function weekState(w) {
  const today = isoToday();
  if (!weekUnlocked(w)) return "locked";
  if (weekStats(w).pct >= UNLOCK_PCT && today > w.to) return "done";
  if (today >= w.from_ && today <= w.to) return "cur";
  return "open";
}
function dayUnlocked(day) { return weekUnlocked(weekById.get(day.week)); }
function lockReason(w) {
  const idx = PLAN.weeks.findIndex((x) => x.id === w.id);
  const prev = PLAN.weeks[idx - 1];
  const reasons = [];
  if (isoToday() < w.from_) reasons.push(`otključava se ${fmtLong(w.from_)}`);
  if (prev && weekStats(prev).pct < UNLOCK_PCT) reasons.push(`${prev.id} mora biti bar ${UNLOCK_PCT} % urađena (sad ${weekStats(prev).pct} %)`);
  return reasons.join(" i ");
}
function courseStats() {
  let n = 0, nd = 0;
  PLAN.days.forEach((d) => { const s = dayStats(d); n += s.n; nd += s.nd; });
  return { n, nd, pct: Math.round((nd / n) * 100) };
}

// ---------- nav ----------
const NAV = [["#/kurs", "ph-graduation-cap", "Kurs"], ["#/danas", "ph-sun", "Danas"], ["#/izazovi", "ph-fire", "Izazovi"], ["#/vise", "ph-dots-three-circle", "Više"]];
const DESK = [["#/kurs", "Kurs"], ["#/danas", "Danas"], ["#/izazovi", "Izazovi"], ["#/plan", "O planu"], ["#/podesavanja", "Podešavanja"]];

function renderNav(route) {
  const act = (h) => (route === h || route.startsWith(h + "/") || (h === "#/danas" && route.startsWith("#/dan/")) || (h === "#/kurs" && route.startsWith("#/nedelja/")) ? "active" : "");
  $tabs.innerHTML = NAV.map(([h, i, l]) => `<a href="${h}" class="${act(h)}"><i class="ph ${i}" aria-hidden="true"></i>${l}</a>`).join("");
  const s = store.sync();
  const statusTxt = s.status === "local" ? "Samo na ovom uređaju" : s.status === "online" ? "Sinhronizovano" : "Nisi prijavljen";
  $side.innerHTML = `<a class="brand" href="#/kurs">Komunikacija<span>.</span></a>` +
    DESK.map(([h, l]) => `<a href="${h}" class="${act(h)}">${l}</a>`).join("") +
    `<div class="spacer"></div><a href="#/vezbe" class="quiet ${act("#/vezbe")}">Vežbe</a><span class="status">${esc(statusTxt)}${s.error ? " · greška" : ""}</span>`;
  let mh = document.getElementById("mhead");
  if (!mh) { mh = document.createElement("header"); mh.id = "mhead"; mh.className = "mhead"; document.getElementById("app").prepend(mh); }
  mh.innerHTML = `<a class="mbrand" href="#/kurs">Komunikacija<span>.</span></a><a class="mstatus" href="#/podesavanja" aria-label="Podešavanja i sinhronizacija"><i class="ph ${s.status === "online" ? "ph-cloud-check" : "ph-cloud-slash"}" aria-hidden="true"></i></a>`;
}

// ---------- KURS (mapa) ----------
let openMonth = null; // koji mesec je raširen; podrazumevano onaj u kome je tekuća nedelja
function viewCourse() {
  const today = isoToday();
  const cs = courseStats();
  const cur = PLAN.weeks.find((w) => today >= w.from_ && today <= w.to) || PLAN.weeks[0];
  if (openMonth === null) openMonth = MONTHS_DEF.findIndex(([, , ids]) => ids.includes(cur.id));
  const months = MONTHS_DEF.map(([name, sub, ids], mi) => {
    const weeks = ids.map((id) => weekById.get(id));
    const anyOpen = weeks.some((w) => weekUnlocked(w));
    const agg = weeks.reduce((a, w) => { const s = weekStats(w); a.n += s.n; a.nd += s.nd; return a; }, { n: 0, nd: 0 });
    const expanded = openMonth === mi;
    return `<section class="month ${anyOpen ? "" : "locked"} ${expanded ? "expanded" : ""}">
      <button class="month-h" data-month="${mi}" aria-expanded="${expanded}"><div><h2>${name}</h2><span>${esc(sub)}</span></div><span>${fmtShort(weeks[0].from_)} – ${fmtShort(weeks.at(-1).to)} · ${agg.n ? Math.round(agg.nd / agg.n * 100) : 0} %</span><i class="ph ph-caret-down caret" aria-hidden="true"></i></button>
      <div class="month-body" ${expanded ? "" : "hidden"}>
      ${weeks.map((w) => {
        const st = weekState(w); const ws = weekStats(w);
        const inner = `<div class="wn">${w.id}</div><div class="wt"><b>${esc(w.title)}</b><span>${fmtShort(w.from_)} – ${fmtShort(w.to)} · izazov nivo ${w.level}${w.checkpoint ? " · " + esc(w.checkpoint.replace(/\s*\(.*\)/, "")) : ""}</span></div>` +
          (st === "locked" ? `<i class="ph ph-lock-simple lock" title="${esc(lockReason(w))}"></i>` : `<div class="wr"><span class="mono">${ws.nd}/${ws.n}</span><div class="bar ${st === "done" ? "olive" : ""}"><i style="--w:${ws.pct}%"></i></div></div>`);
        const days = st === "locked" ? "" : `<div class="days">${ws.days.map((d) => { const s = dayStats(d); const cls = ["day", s.n && s.nd === s.n ? "done" : s.nd ? "part" : "", d.date === today ? "today" : ""].join(" "); return `<a class="${cls}" href="#/dan/${d.date}" title="${fmtLong(d.date)} · ${s.nd}/${s.n}">${parse(d.date).getDate()}<small>${d.dow}</small></a>`; }).join("")}</div>`;
        return st === "locked" ? `<div class="week locked">${inner}</div>` : `<a class="week ${st} open" href="#/nedelja/${w.id}">${inner}</a>${days}`;
      }).join("")}
      </div>
    </section>`;
  }).join("");
  $main.innerHTML = `
    <header class="course-head">
      <div><div class="pagehead" style="margin:0"><div class="kicker">Kurs · 15. oktobar – 31. decembar 2026 · 12 nedelja</div><h1>Komunikacija do Nove godine</h1></div>
        <p class="lead">${esc(PLAN.meta.goal)}</p></div>
      <div class="course-progress">
        <div class="pct"><b>${cs.pct}%</b><span>kursa završeno · ${cs.nd} od ${cs.n} zadataka</span></div>
        <div class="bar"><i style="--w:${cs.pct}%"></i></div>
        <div class="course-actions"><a class="btn primary" href="#/danas"><i class="ph ph-sun" aria-hidden="true"></i>Danas</a><a class="btn" href="#/nedelja/${cur.id}">${cur.id} · ova nedelja</a></div>
      </div>
    </header>
    <div class="months">${months}</div>
    <p class="faint small" style="margin-top:16px">Nedelja se otključava kad dođe njen ponedeljak i kad je prethodna bar ${UNLOCK_PCT} % urađena.</p>`;
  $main.querySelectorAll("[data-month]").forEach((b) => b.addEventListener("click", () => {
    const mi = +b.dataset.month;
    openMonth = openMonth === mi ? -1 : mi;
    $main.querySelectorAll(".month").forEach((m, i) => { const on = i === openMonth; m.classList.toggle("expanded", on); m.querySelector(".month-body").hidden = !on; m.querySelector(".month-h").setAttribute("aria-expanded", on); });
  }));
}

// ---------- NEDELJA (pregled lekcija) ----------
function viewWeek(id) {
  const w = weekById.get(id) || PLAN.weeks[0];
  const today = isoToday();
  if (!weekUnlocked(w)) { $main.innerHTML = lockedBox(w); return; }
  const ws = weekStats(w);
  const idx = PLAN.weeks.findIndex((x) => x.id === w.id);
  const prev = PLAN.weeks[idx - 1], next = PLAN.weeks[idx + 1];
  const vids = (w.videos || []).map((v) => { const [t, u] = v.split(" | "); return `<a class="btn sm" href="https://${esc((u || "").trim())}" target="_blank" rel="noopener"><i class="ph ph-play-circle" aria-hidden="true"></i>${esc(t.length > 48 ? t.slice(0, 48) + "…" : t)}</a>`; }).join("");
  $main.innerHTML = `
    <header class="lesson-head">
      <div class="lesson-id"><div class="wicon"><i class="ph ${WEEK_ICON[w.id] || "ph-circle"}" aria-hidden="true"></i></div><div><div class="kick">${w.id} · ${fmtShort(w.from_)} – ${fmtShort(w.to)} · ${ws.pct} % urađeno</div><h1>${esc(w.title)}</h1><p class="muted" style="margin-top:8px">${esc(w.theme)}</p></div></div>
      <div class="nav"><a class="iconbtn" href="${prev ? "#/nedelja/" + prev.id : "#/kurs"}" aria-label="Prethodna nedelja"><i class="ph ph-caret-left" aria-hidden="true"></i></a><a class="btn sm" href="#/kurs">Kurs</a><a class="iconbtn" href="${next && weekUnlocked(next) ? "#/nedelja/" + next.id : "#/kurs"}" aria-label="Sledeća nedelja"><i class="ph ph-caret-right" aria-hidden="true"></i></a></div>
    </header>
    <div class="rule"><b>Pravilo nedelje.</b> ${esc(cleanRule(w.rule))}</div>
    <div class="card" style="margin-bottom:14px"><p class="muted">${esc(w.why)}</p>${w.note ? `<p class="small" style="margin-top:10px;color:var(--warn)">${esc(w.note)}</p>` : ""}</div>
    <div class="tasks">
      ${ws.days.map((d, k) => { const s = dayStats(d); const full = s.n && s.nd === s.n; const g = goalTask(d); return `<a class="task ${full ? "done" : ""}" href="#/dan/${d.date}"><div class="check" aria-hidden="true"><i class="ph ph-check"></i></div><div class="t-main"><div class="t-name">${k + 1}) ${cap(DOWS[(parse(d.date).getDay() + 6) % 7])} ${fmtShort(d.date)}${d.date === today ? " · danas" : ""}</div><div class="t-meta">${g ? esc(g.t.name) : ""}</div></div><div class="t-min">${s.nd}/${s.n}</div></a>`; }).join("")}
    </div>
    ${vids ? `<div style="margin-top:14px"><h3 style="margin-bottom:8px">Video nedelje</h3><div class="row wrap">${vids}</div></div>` : ""}`;
}
function lockedBox(w) {
  return `<div class="locked-box"><i class="ph ph-lock-simple"></i><h2>${w.id} · ${esc(w.title)}</h2><p class="muted">Zaključano: ${esc(lockReason(w))}.</p><a class="btn primary" href="#/kurs">Nazad na kurs</a></div>`;
}

// ---------- DAN (lekcija) ----------
let sel = null;
function goalTask(day) {
  const pri = { checkpoint: 4, pitch: 3, glavno: 2, checkin: 1 };
  let best = null, bi = -1;
  day.tasks.forEach((t, i) => { if (!isCore(t)) return; const score = (pri[t.slot] || 0) * 1000 + t.min; if (!best || score > best.score) { best = { t, score }; bi = i; } });
  return best ? { t: best.t, i: bi } : null;
}

function viewToday(date) {
  date = clampDate(date || isoToday());
  const day = byDate.get(date);
  const w = weekById.get(day.week);
  if (!dayUnlocked(day)) { $main.innerHTML = lockedBox(w); return; }
  const st = dayStats(day);
  const today = isoToday();
  const journal = store.get("journal", date) ?? {};
  const settings = store.get("settings", "main") ?? {};
  const goal = goalTask(day);
  if (!sel || sel.date !== date) sel = goal ? { date, i: goal.i } : null;
  const groups = {};
  day.tasks.forEach((t, i) => (groups[t.slot] ??= []).push([t, i]));
  const eventNote = [settings.polufinale === date && "Danas je polufinale: zagrevanje 5 min, udica 3× naglas, pauza 1–2 s pre svakog odgovora.", settings.finale === date && "Danas je finale: ritual pre izlaska, usađena stopala, posle: debrief dok je sveže."].filter(Boolean);
  const dow = DOWS[(parse(date).getDay() + 6) % 7];
  const nextD = addDays(date, 1), prevD = addDays(date, -1);
  const nextOk = byDate.has(nextD) && dayUnlocked(byDate.get(nextD));
  let num = 0;
  $main.innerHTML = `
    <header class="lesson-head">
      <div class="lesson-id"><div class="wicon"><i class="ph ${WEEK_ICON[w.id] || "ph-circle"}" aria-hidden="true"></i></div><div><div class="kick">${w.id} · ${esc(w.title)} · dan ${PLAN.days.indexOf(day) + 1} od ${PLAN.days.length}</div><h1>${date === today ? "Danas" : cap(dow)}, ${parse(date).getDate()}. ${MONTHS[parse(date).getMonth()]}</h1></div></div>
      <div class="nav"><a class="iconbtn" href="#/dan/${prevD}" aria-label="Prethodni dan"><i class="ph ph-caret-left" aria-hidden="true"></i></a>${date !== today ? `<a class="btn sm" href="#/danas">Danas</a>` : `<a class="btn sm" href="#/nedelja/${w.id}">${w.id}</a>`}${nextOk ? `<a class="iconbtn" href="#/dan/${nextD}" aria-label="Sledeći dan"><i class="ph ph-caret-right" aria-hidden="true"></i></a>` : `<span class="iconbtn" style="opacity:.3"><i class="ph ph-lock-simple" aria-hidden="true"></i></span>`}</div>
    </header>
    ${eventNote.map((n) => `<div class="rule"><b>${esc(n)}</b></div>`).join("")}
    ${goal ? `<button class="goal" data-select="${goal.i}"><i class="ph ph-target" aria-hidden="true"></i><span><span class="l">Cilj dana:</span>${esc(goal.t.name)}</span><span class="m">${goal.t.min ? goal.t.min + " min" : ""}</span></button>` : ""}
    <div class="lesson-meta"><span>${st.nd}/${st.n} zadataka</span><div class="bar"><i style="--w:${st.pct}%"></i></div><span>${st.mind}/${st.min} min</span></div>
    <div class="rule"><b>Pravilo nedelje.</b> ${esc(cleanRule(w.rule))}</div>
    <div class="today-grid">
      <div class="tasks">${SLOT_ORDER.filter((s) => groups[s]).map((s) => `<div class="group-h"><i class="ph ${SLOT[s].icon}" aria-hidden="true"></i>${SLOT[s].label}${s === "izazov" ? " · nivo " + w.level : ""}</div>${groups[s].map(([t, i]) => renderTask(date, t, i, journal, ++num)).join("")}`).join("")}</div>
      <aside class="detail">${renderDetail(date, journal)}</aside>
    </div>`;
  bindToday(date, journal);
}

function bindToday(date, journal) {
  $main.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", (e) => {
    e.stopPropagation();
    const [d, i] = el.dataset.toggle.split("|");
    const t = byDate.get(d).tasks[+i]; const k = taskKey(d, t, +i);
    const now = !store.get("done", k);
    store.set("done", k, now ? { at: new Date().toISOString(), min: t.min } : null);
    if (now && isCore(t)) { const s = dayStats(byDate.get(d)); buzz(s.pct === 100 ? [20, 60, 40] : 12); if (s.pct === 100) toast("Dan završen. Svaka čast."); } else buzz(8);
  }));
  $main.querySelectorAll("[data-select]").forEach((el) => el.addEventListener("click", () => {
    const i = +el.dataset.select;
    const task = el.closest(".task");
    if (task && window.matchMedia("(max-width: 899px)").matches) { const body = task.querySelector(".t-body"); body.hidden = !body.hidden; }
    sel = { date, i };
    const d = $main.querySelector(".detail"); if (d) d.innerHTML = renderDetail(date, journal);
    $main.querySelectorAll(".task.sel").forEach((x) => x.classList.remove("sel"));
    $main.querySelector(`.task[data-i="${i}"]`)?.classList.add("sel");
    bindForms(date);
    $main.querySelectorAll(".detail [data-toggle]").forEach((b) => { if (b.dataset.bound) return; b.dataset.bound = 1; b.addEventListener("click", () => { const [dd, ii] = b.dataset.toggle.split("|"); const t = byDate.get(dd).tasks[+ii]; const k = taskKey(dd, t, +ii); store.set("done", k, store.get("done", k) ? null : { at: new Date().toISOString(), min: t.min }); }); });
  }));
  bindForms(date);
}
function bindForms(date) {
  $main.querySelectorAll("form[data-journal]").forEach((f) => { if (f.dataset.bound) return; f.dataset.bound = 1; f.addEventListener("submit", (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(f).entries()); store.set("journal", date, { ...(store.get("journal", date) ?? {}), ...data, savedAt: new Date().toISOString() }); toast("Dnevnik sačuvan"); }); });
  $main.querySelectorAll("form[data-challenge]").forEach((f) => { if (f.dataset.bound) return; f.dataset.bound = 1; f.addEventListener("submit", (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(f).entries()); store.set("challenge", `${date}|${f.dataset.challenge}`, { ...data, date, ch: f.dataset.challenge, savedAt: new Date().toISOString() }); toast("Izazov zabeležen"); }); });
}
function renderExtra(date, t, journal) {
  if (t.id === "R1") {
    const j = journal;
    return `<form class="form" data-journal>
      <label class="field"><span>Try & Apply: šta sam uradio (ime snimka)</span><input name="try" autocomplete="off" value="${esc(j.try)}"></label>
      <div class="grid3"><label class="field"><span>Vocal 0–10</span><input name="vocal" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.vocal)}"></label><label class="field"><span>Visual 0–10</span><input name="visual" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.visual)}"></label><label class="field"><span>Verbal 0–10</span><input name="verbal" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.verbal)}"></label></div>
      <div class="grid2"><label class="field"><span>Sutra zadržavam</span><input name="keep" autocomplete="off" value="${esc(j.keep)}"></label><label class="field"><span>Sutra menjam (1 stvar)</span><input name="change" autocomplete="off" value="${esc(j.change)}"></label></div>
      <label class="field"><span>Homework for Life: najvredniji trenutak dana</span><textarea name="hfl">${esc(j.hfl)}</textarea></label>
      <label class="field row" style="grid-template-columns:auto 1fr"><input type="checkbox" name="comfort" value="1" style="width:auto" ${j.comfort ? "checked" : ""}> <span>Bio sam van zone komfora danas</span></label>
      <div class="actions"><button class="btn primary sm" type="submit">Sačuvaj</button></div></form>`;
  }
  if (t.slot === "izazov" && t.id.startsWith("CH")) {
    const c = store.get("challenge", `${date}|${t.id}`) ?? {};
    return `<form class="form" data-challenge="${t.id}">
      <label class="field"><span>Pre: predviđanje</span><input name="prediction" autocomplete="off" placeholder="misliće da sam čudan…" value="${esc(c.prediction)}"></label>
      <div class="grid2"><label class="field"><span>Stvarnost vs predviđanje (1 gore – 10 bolje)</span><input name="score" type="number" min="1" max="10" inputmode="numeric" value="${esc(c.score)}"></label><label class="field"><span>Najteži trenutak</span><input name="hardest" autocomplete="off" value="${esc(c.hardest)}"></label></div>
      <label class="field"><span>Sledeći put / sledeći nivo</span><input name="next" autocomplete="off" value="${esc(c.next)}"></label>
      <div class="actions"><button class="btn primary sm" type="submit">Zabeleži</button></div></form>`;
  }
  return "";
}
function renderDetail(date, journal) {
  if (!sel) return `<div class="card empty"><i class="ph ph-cursor-click"></i>Izaberi zadatak sa liste.</div>`;
  const t = byDate.get(sel.date).tasks[sel.i];
  const done = isDone(date, t, sel.i);
  const link = (t.how.match(/youtube\.com\/[^\s|)]+/) || [])[0];
  return `<div class="card">
    <div class="d-kicker"><i class="ph ${SLOT[t.slot].icon}" aria-hidden="true"></i>${SLOT[t.slot].label}${t.min ? ` · ${t.min} min` : ""} · težina ${t.diff}/5</div>
    <h2>${esc(t.name)}</h2>
    <div class="how">${esc(t.how)}${link ? ` <a href="https://${esc(link)}" target="_blank" rel="noopener">Otvori video <i class="ph ph-arrow-square-out" aria-hidden="true"></i></a>` : ""}</div>
    ${t.metric ? `<div class="metric"><i class="ph ph-ruler" aria-hidden="true"></i><span>Merilo: ${esc(t.metric)}</span></div>` : ""}
    ${t.src ? `<p class="faint small" style="margin-top:10px">Izvor: research/${esc(t.src)}</p>` : ""}
    <div class="actions"><button class="btn ${done ? "" : "primary"}" data-toggle="${date}|${sel.i}"><i class="ph ph-check" aria-hidden="true"></i>${done ? "Vrati na neurađeno" : "Označi kao urađeno"}</button></div>
    ${renderExtra(date, t, journal)}</div>`;
}
function renderTask(date, t, i, journal, num) {
  const done = isDone(date, t, i);
  const isSel = sel && sel.date === date && sel.i === i;
  const fire = t.slot === "izazov" && t.id.startsWith("CH");
  const diff = `<span class="diff" title="težina ${t.diff}/5">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= t.diff ? "on" : ""}"></b>`).join("")}</span>`;
  const link = (t.how.match(/youtube\.com\/[^\s|)]+/) || [])[0];
  return `<div class="task ${done ? "done" : ""} ${isSel ? "sel" : ""} ${fire ? "fire" : ""}" data-i="${i}">
    <button class="check" data-toggle="${date}|${i}" aria-label="${done ? "Označi kao neurađeno" : "Označi kao urađeno"}" aria-pressed="${done}"><i class="ph ph-check"></i></button>
    <div class="t-main" data-select="${i}"><div class="t-name">${num ? `<span class="faint">${num})</span> ` : ""}${esc(t.name)}</div><div class="t-meta">${diff}${fire ? `<span>${esc(t.how.slice(0, 70))}${t.how.length > 70 ? "…" : ""}</span>` : t.src ? `<span>${esc(t.src)}</span>` : ""}</div></div>
    <div class="t-min">${t.min ? t.min + "′" : ""}</div>
    <div class="t-body" hidden><div class="how">${esc(t.how)}${link ? ` <a href="https://${esc(link)}" target="_blank" rel="noopener">Otvori video <i class="ph ph-arrow-square-out" aria-hidden="true"></i></a>` : ""}</div>${t.metric ? `<div class="metric"><i class="ph ph-ruler" aria-hidden="true"></i><span>Merilo: ${esc(t.metric)}</span></div>` : ""}${renderExtra(date, t, journal)}</div>
  </div>`;
}

// ---------- IZAZOVI ----------
function viewChallenges() {
  const today = isoToday();
  const done = store.all("done");
  const counts = {};
  PLAN.days.forEach((d) => d.tasks.forEach((t, i) => { if (t.id && t.id.startsWith("CH") && done[taskKey(d.date, t, i)]) counts[t.id] = (counts[t.id] || 0) + 1; }));
  const logs = Object.values(store.all("challenge")).filter(Boolean).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const curWeek = PLAN.weeks.find((w) => today >= w.from_ && today <= w.to) || PLAN.weeks[0];
  const maxLevel = Math.max(4, ...PLAN.weeks.filter((w) => weekUnlocked(w)).map((w) => w.level));
  const levels = Object.entries(PLAN.challenges).map(([lvl, items]) => {
    const d = items.filter((it) => counts["CH" + it.n]).length;
    return { lvl: +lvl, items, d, pct: Math.round((d / items.length) * 100), state: +lvl > maxLevel ? "locked" : +lvl === curWeek.level ? "cur" : d === items.length ? "done" : "open" };
  });
  const totalDone = levels.reduce((a, l) => a + l.d, 0), totalItems = levels.reduce((a, l) => a + l.items.length, 0);
  const chName = (id) => { for (const items of Object.values(PLAN.challenges)) { const it = items.find((x) => "CH" + x.n === id); if (it) return it.text; } return id; };
  $main.innerHTML = `
    <div class="pagehead"><div class="kicker">Lestvica 4–10 · ${totalDone} od ${totalItems} · nivo ove nedelje ${curWeek.level} (${curWeek.id})</div><h1>Izazovi</h1></div>
    <div class="stepper">${levels.map((l) => `<a href="#lvl-${l.lvl}" class="step ${l.state}"><div class="n">${l.state === "locked" ? `<i class="ph ph-lock-simple"></i>` : l.lvl}</div><span>${l.d}/${l.items.length}</span></a>`).join("")}</div>
    <div class="callout" style="margin:18px 0 20px">Pre: zapiši predviđanje. Posle: 3 pitanja. Ako dobiješ „ne“, pitaj „zašto?“. Nivo se osvaja kad isti tip uradiš 3 puta bez većeg otpora. Viši nivoi se otključavaju sa nedeljama kursa.</div>
    <div class="chcols">
      <div class="ladder">${levels.map((l) => `<section class="lvl ${l.state}" id="lvl-${l.lvl}">
        <h3><span>Nivo ${l.lvl}${l.state === "cur" ? ` <span class="chip accent">ova nedelja</span>` : l.state === "locked" ? ` <span class="chip"><i class="ph ph-lock-simple"></i> zaključano</span>` : ""}</span><span class="chip ${l.d === l.items.length ? "ok" : ""}">${l.d}/${l.items.length}</span></h3>
        ${l.items.map((it) => { const c = counts["CH" + it.n] || 0; return `<div class="item ${c ? "done" : ""} ${c >= 3 ? "mastered" : ""}"><span class="n">#${it.n}</span><div><div>${esc(it.text)}</div><span class="faint small"><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(it.where)}</span></div><span class="cnt">${c ? c + "×" : ""}</span></div>`; }).join("")}
      </section>`).join("")}</div>
      <aside class="chside"><div class="card stack" style="gap:10px"><h3>Poslednji logovi</h3>
        ${logs.length ? logs.slice(0, 8).map((l) => `<div class="logrow"><div class="score ${+l.score >= 7 ? "good" : ""}">${esc(l.score || "–")}</div><div><b>${esc(chName(l.ch))}</b><span>${l.date ? fmtShort(l.date) : ""}${l.hardest ? " · " + esc(l.hardest) : ""}</span>${l.prediction ? `<span class="faint">pre: ${esc(l.prediction)}</span>` : ""}</div></div>`).join("") : `<p class="muted small">Još nema logova. Svaki izazov u lekciji dana ima formu: predviđanje, ocena 1–10, najteži trenutak, sledeći put.</p>`}
      </div></aside>
    </div>`;
  $main.querySelectorAll(".stepper a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
}

// ---------- VEŽBE ----------
let exFilter = { q: "", slot: "" }; let exOpen = "";
function viewExercises() {
  const today = isoToday();
  const ex = Object.values(PLAN.exercises);
  const usage = {};
  PLAN.days.forEach((d) => d.tasks.forEach((t) => { if (!t.id || !PLAN.exercises[t.id]) return; const u = (usage[t.id] ??= { count: 0, next: null }); u.count++; if (d.date >= today && !u.next) u.next = d.date; }));
  const slots = SLOT_ORDER.filter((s) => ex.some((e) => e.slot === s));
  const render = () => {
    const ql = exFilter.q.toLowerCase();
    const list = ex.filter((e) => (!exFilter.slot || e.slot === exFilter.slot) && (!ql || (e.name + " " + e.how + " " + e.id + " " + e.metric).toLowerCase().includes(ql)));
    if (!list.length) return `<div class="empty"><i class="ph ph-magnifying-glass"></i>Nema vežbe za „${esc(exFilter.q)}“.</div>`;
    return `<div class="exgrid">${list.map((e) => { const u = usage[e.id] || { count: 0 }; return `<details class="excard" ${e.id === exOpen ? "open" : ""} data-id="${e.id}"><summary><div class="ex-top"><span class="chip"><i class="ph ${SLOT[e.slot].icon}" aria-hidden="true"></i>${SLOT[e.slot].label}</span><span class="ex-id">${e.id}</span></div><div class="ex-name">${esc(e.name)}</div><div class="ex-meta"><span>${e.min ? e.min + " min" : "tokom dana"}</span><span class="diff">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= e.diff ? "on" : ""}"></b>`).join("")}</span><span>${u.count}× u kursu${u.next ? " · sledeće " + fmtShort(u.next) : ""}</span></div></summary><div class="ex-body"><p>${esc(e.how)}</p>${e.metric ? `<div class="metric"><i class="ph ph-ruler" aria-hidden="true"></i><span>Merilo: ${esc(e.metric)}</span></div>` : ""}${e.src ? `<p class="faint small" style="margin-top:8px">Izvor: research/${esc(e.src)}</p>` : ""}</div></details>`; }).join("")}</div>`;
  };
  $main.innerHTML = `<div class="pagehead"><div class="kicker">${ex.length} vežbi iz istraživanja · klik otvara uputstvo</div><h1>Vežbe</h1></div>
    <div class="search"><div class="row" style="gap:8px"><i class="ph ph-magnifying-glass" style="font-size:20px;color:var(--text-3)" aria-hidden="true"></i><input type="search" id="q" aria-label="Pretraga vežbi" autocomplete="off" spellcheck="false" placeholder="Pretraži: slamčica, PREP, žiri, pauza…" value="${esc(exFilter.q)}"></div>
      <div class="filters">${[["", "Sve"], ...slots.map((s) => [s, SLOT[s].label])].map(([v, l]) => `<button class="chip ${exFilter.slot === v ? "accent" : ""}" data-slot="${v}">${l}</button>`).join("")}</div></div>
    <div id="exlist">${render()}</div>`;
  const list = document.getElementById("exlist");
  document.getElementById("q").addEventListener("input", (e) => { exFilter.q = e.target.value; list.innerHTML = render(); });
  $main.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => { exFilter.slot = b.dataset.slot; $main.querySelectorAll("[data-slot]").forEach((x) => x.classList.toggle("accent", x === b)); list.innerHTML = render(); }));
  list.addEventListener("toggle", (e) => { if (e.target.open) exOpen = e.target.dataset.id; }, true);
}

// ---------- VIŠE ----------
function viewMore() {
  $main.innerHTML = `<div class="pagehead"><h1>Više</h1></div><div class="morelist">
    ${[["#/plan", "ph-info", "O planu"], ["#/podesavanja", "ph-gear", "Podešavanja"], ["#/vezbe", "ph-books", "Vežbe (biblioteka)"]].map(([h, i, l]) => `<a href="${h}"><i class="ph ${i}" aria-hidden="true"></i><span>${l}</span><i class="ph ph-caret-right" aria-hidden="true"></i></a>`).join("")}</div>`;
}

// ---------- O PLANU ----------
function viewAbout() {
  const m = PLAN.meta; const today = isoToday(); const b = m.baseline;
  const tl = [
    ["2026-10-14", "Masterklas i odluka", "Odgledan Vinh Giang masterklas. Umesto kursa od 495 $: istraživanje 6 oblasti (27.000 reči, 270 izvora) i sopstveni kurs."],
    ["2026-10-15", "Početni snimci", `„O sebi“ 45 s i „projekat“ 51 s. Tempo ${b.wpmSpeaking} r/min, govor ${b.speakingTimePct} % vremena, najduža pauza ${b.maxPauseSec} s, nula poštapalica, prsti prepleteni.`],
    ["2026-10-19", "W1: kostur „o sebi“", "Jedna stvar + zašto + šta sad. Dah i brujanje svaki dan. Prvi izazovi nivoa 4."],
    ["2026-11-01", "Checkpoint #1", "Isti snimci, iste brojke. Prva tabela poređenja."],
    ["2026-11-09", "Mesec 2: pitanja i priča", "PREP i 3-2-1, pauza od 2 s pre svakog odgovora. Anketa u školi daje broj za udicu pitcha."],
    ["2026-11-23", "W6: polufinale InnovNation", "Pitch 3 min + demo uživo, generalna proba pred ljudima koji nisu u timu."],
    ["2026-12-01", "Checkpoint #2", "Prepravka po pitanjima žirija. Decembar: 20 min dnevno, nikad nula."],
    ["2026-12-14", "W9: finale", "Jedan prolaz dnevno, ritual pre izlaska, debrief isti dan."],
    ["2026-12-21", "W10: praznici", "Zdravice, vođenje razgovora, Dan rejection terapije."],
    ["2026-12-31", "Završni checkpoint", "Četiri kolone jedna pored druge. Retrospektiva i plan za januar: engleski v2."],
  ];
  $main.innerHTML = `
    <section class="about-hero"><div class="kick">O planu · 15. oktobar – 31. decembar 2026</div><h1>Od <em>„evo, dobro“</em> do bine.</h1><p class="lead">${esc(m.goal)}</p><p class="lead">Dvanaest nedelja u tri meseca, trideset minuta radnim danom, dva sata vikendom. Isti snimci na početku, u sredini i na kraju, da se napredak vidi u brojkama, a ne u osećaju.</p></section>
    <section class="about-band"><div class="q"><small>Početno stanje, 15. oktobar</small>Nisi tih zato što ne umeš da budeš glasan, nego zato što dok govoriš smišljaš šta ćeš sledeće reći.</div>
      <div class="stats-row"><div><b>${esc(b.wpmSpeaking)}</b><span>reči u minuti<br>dok govoriš</span></div><div><b>${b.maxPauseSec}</b><span>sekundi najduža<br>pauza</span></div><div><b>${b.fillers}</b><span>poštapalica<br>u oba snimka</span></div><div><b>${b.selfVoice}/10</b><span>glas, tvoja<br>ocena</span></div></div></section>
    <section class="pillars"><h2>Četiri stuba, po važnosti</h2><div class="pgrid">${[["ph-lightbulb", "Jasnoća i redosled", "Problem pre rešenja, jedna rečenica tehnike, putokazi. Lek za „curse of knowledge“ koji ti tata primećuje."], ["ph-microphone", "Glas i autoritet", "Dah, rezonanca napred, kraj rečenice nadole, pauza umesto poštapalice. Mereno decibelima svake subote."], ["ph-chats-circle", "Small talk i razgovor", "Odgovor + detalj + pitanje. Ulazak u grupu u roku od tri sekunde. Lestvica izazova 4–10."], ["ph-presentation", "Pitch za žiri", "Tri minuta, demo uživo, banka od 26 pitanja. Struktura, ne reči napamet."]].map(([i, t, d]) => `<div class="pcard"><i class="ph ${i}" aria-hidden="true"></i><h3>${t}</h3><p>${d}</p></div>`).join("")}</div></section>
    <section class="rhythm"><h2>Kako izgleda dan</h2><div class="rgrid"><div><b>5′</b><span>glas: dah, brujanje, slamčica</span></div><div><b>3′</b><span>telo: usađivanje, ruke, pogled</span></div><div><b>15′</b><span>glavna vežba nedelje, snimljena</span></div><div><b>1</b><span>izazov tokom dana, sa logom</span></div><div><b>5′</b><span>dnevnik: Try & Apply, Reflect & Review, Plan & Improve</span></div><div><b>bus</b><span>video nedelje ili jučerašnji snimak</span></div></div><p class="muted" style="margin-top:14px">Subota: benchmark + tata 10 min + veći izazov. Nedelja: check‑in sa Claude‑om, koji iz baze povuče progres i koriguje sledeću nedelju. Nova nedelja se otključava kad dođe ponedeljak i kad je prethodna bar 80 % urađena.</p></section>
    <section class="timeline" id="vremenska-linija"><h2>Put do Nove godine</h2><ol class="tl">${tl.map(([d, t, txt]) => `<li class="tl-item ${d <= today ? "past" : ""}"><div class="tl-dot"></div><div class="tl-date">${fmtLong(d)}</div><h3>${esc(t)}</h3><p>${esc(txt)}</p></li>`).join("")}</ol></section>
    <section class="sources"><h2>Na čemu je kurs zasnovan</h2><div class="sgrid">${[["01", "Jasnoća i struktura", "Curse of knowledge, PARA, 3‑2‑1, PREP, ABT, Matt Abrahams, Toastmasters."], ["02", "Glas", "RCSLT i NHS logopedi, Julian Treasure, Vinh Giang, Titze (slamčica), merenje dB i F0."], ["03", "Small talk i izazovi", "Harvard studija o potpitanjima, Debra Fine, Charisma on Command, Jia Jiang, lestvica od 39 izazova."], ["04", "Storytelling i telo", "Matthew Dicks, Pixar Story Spine, The Moth, Vanessa Van Edwards, Toastmasters."], ["05", "Pitch", "Y Combinator, Guy Kawasaki, Nathan Gold, finale InnovNation 2025, banka pitanja žirija."], ["06", "Metod vežbanja", "Ericsson (deliberate practice), BJ Fogg, James Clear, Vinhov besplatni sadržaj po modulima."]].map(([n, t, d]) => `<div class="scard"><span class="sn">${n}</span><h3>${t}</h3><p>${d}</p></div>`).join("")}</div><p class="faint small" style="margin-top:12px">Fajlovi: research/01–06 u Communications folderu. Plan generiše plan/build_plan.py; ovaj sajt čita plan.json. Generisano ${esc(m.generated)}.</p></section>`;
  setupTimeline();
}
function setupTimeline() {
  const tl = $main.querySelector(".tl");
  if (!tl) return;
  if (reduceMq.matches || !("IntersectionObserver" in window)) { tl.querySelectorAll(".tl-item").forEach((i) => i.classList.add("on")); tl.style.setProperty("--p", "100%"); return; }
  tl.classList.add("tl-ready");
  const io = new IntersectionObserver((entries) => { entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -20% 0px" });
  tl.querySelectorAll(".tl-item").forEach((i) => io.observe(i));
  const paint = () => { const r = tl.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (window.innerHeight * 0.75 - r.top) / r.height)); tl.style.setProperty("--p", `${Math.round(p * 100)}%`); };
  let q = false; window.addEventListener("scroll", () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; paint(); }); } }, { passive: true }); paint();
}

// ---------- PODEŠAVANJA ----------
function viewSettings() {
  const s = store.get("settings", "main") ?? {};
  const sync = store.sync(); const user = store.currentUser();
  const syncCard = sync.status === "local"
    ? `<div class="sync-state"><i class="ph ph-cloud-slash"></i><div><b>Samo na ovom uređaju</b><span>Supabase nije podešen (config.js).</span></div></div>`
    : user ? `<div class="sync-state on"><i class="ph ph-cloud-check"></i><div><b>${esc(user.email)}</b><span>${sync.lastSync ? "Sinhronizovano " + new Date(sync.lastSync).toLocaleString("sr-RS") : "Povezano"}${store.pendingCount() ? ` · čeka ${store.pendingCount()} promena` : ""}</span>${sync.error ? `<span style="color:var(--warn)">${esc(sync.error)}</span>` : ""}</div></div><div class="row" style="margin-top:12px"><button class="btn sm" id="out"><i class="ph ph-sign-out" aria-hidden="true"></i>Odjavi se</button></div>`
    : `<div class="sync-state"><i class="ph ph-cloud"></i><div><b>Nisi prijavljen</b><span>Prijavi se jednom po uređaju da se progres čuva u bazi i deli između telefona i Maca.</span></div></div>
      <form class="form" id="login"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" spellcheck="false" required></label><label class="field"><span>Lozinka</span><input name="password" type="password" autocomplete="current-password" required></label><div class="actions"><button class="btn sm" type="button" id="signup">Napravi nalog</button><button class="btn primary sm" type="submit">Prijavi se</button></div><p class="faint small" id="loginmsg"></p></form>`;
  $main.innerHTML = `<div class="pagehead"><div class="kicker">Nalog, datumi, podaci</div><h1>Podešavanja</h1></div><div class="setgrid">
    <section class="card stack"><h3><i class="ph ph-cloud-arrow-up"></i> Sinhronizacija</h3>${syncCard}</section>
    <section class="card stack"><h3><i class="ph ph-microphone-stage"></i> Datumi takmičenja</h3><p class="muted small">Kad saznaš, upiši. Tog dana lekcija prikazuje ritual.</p>
      <form class="form" id="dates"><div class="grid2"><label class="field"><span>Polufinale</span><input type="date" name="polufinale" value="${esc(s.polufinale)}"></label><label class="field"><span>Finale</span><input type="date" name="finale" value="${esc(s.finale)}"></label></div><div class="actions"><button class="btn primary sm" type="submit">Sačuvaj</button></div></form></section>
    <section class="card stack"><h3><i class="ph ph-database"></i> Podaci</h3><p class="muted small">Progres, dnevnik, logovi izazova. Izvoz je JSON koji možeš i meni da pošalješ.</p>
      <div class="row wrap"><button class="btn sm" id="export"><i class="ph ph-download-simple" aria-hidden="true"></i>Izvezi JSON</button><label class="btn sm" for="import"><i class="ph ph-upload-simple" aria-hidden="true"></i>Uvezi JSON</label><input id="import" type="file" accept="application/json" hidden><button class="btn sm" id="reset" style="color:var(--warn)"><i class="ph ph-trash" aria-hidden="true"></i>Obriši lokalno</button></div></section>
    <section class="card stack"><h3><i class="ph ph-device-mobile"></i> Telefon</h3><p class="muted small">Na iPhone-u: Safari → Deli → <b>Add to Home Screen</b>, pa radi kao aplikacija bez trake browsera.</p><a class="btn sm" href="#/vezbe" style="justify-self:start"><i class="ph ph-books" aria-hidden="true"></i>Biblioteka vežbi</a></section>
  </div>`;
  document.getElementById("dates").addEventListener("submit", (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries()); store.set("settings", "main", { ...s, ...d }); toast("Sačuvano"); });
  document.getElementById("export").addEventListener("click", () => { const b = new Blob([store.exportJSON()], { type: "application/json" }); const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `komunikacija-${isoToday()}.json` }); a.click(); });
  document.getElementById("import").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; store.importJSON(await f.text()); toast("Uvezeno"); });
  document.getElementById("reset").addEventListener("click", () => { if (confirm("Obrisati sav progres sa ovog uređaja? (Ako si sinhronizovan, vratiće se sa servera.)")) { store.resetLocal(); toast("Obrisano"); } });
  const login = document.getElementById("login");
  if (login) {
    const msg = document.getElementById("loginmsg");
    login.addEventListener("submit", async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(login).entries()); try { await store.signIn(d.email, d.password); toast("Prijavljen"); } catch (err) { msg.textContent = err.message; } });
    document.getElementById("signup").addEventListener("click", async () => { const d = Object.fromEntries(new FormData(login).entries()); if (!d.email || !d.password) { msg.textContent = "Unesi email i lozinku."; return; } try { await store.signUp(d.email, d.password); msg.textContent = "Nalog napravljen. Ako je potrebna potvrda, proveri email, pa se prijavi."; } catch (err) { msg.textContent = err.message; } });
  }
  document.getElementById("out")?.addEventListener("click", async () => { await store.signOut(); toast("Odjavljen"); });
}

// ---------- pokret ----------
const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
let revealIO = null;
const RV = ".task, .week, .month, .excard, .lvl, .logrow, .pcard, .scard, .step";
function setupReveal() {
  if (reduceMq.matches || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("rv-on");
  revealIO?.disconnect();
  revealIO = new IntersectionObserver((entries) => { entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  [...$main.querySelectorAll(RV)].forEach((el, i) => { el.classList.add("rv-item"); el.style.setProperty("--d", `${Math.min(i % 8, 7) * 50}ms`); revealIO.observe(el); });
}
let scrollQ = false;
window.addEventListener("scroll", () => { if (!scrollQ) { scrollQ = true; requestAnimationFrame(() => { scrollQ = false; document.body.classList.toggle("scrolled", window.scrollY > 24); }); } }, { passive: true });

// ---------- router ----------
const VIEWS = { kurs: viewCourse, danas: () => viewToday(), dan: (a) => viewToday(a), nedelja: (a) => viewWeek(a), izazovi: viewChallenges, vezbe: viewExercises, vise: viewMore, plan: viewAbout, podesavanja: viewSettings };
function parseRoute() { const h = location.hash || "#/kurs"; const m = h.match(/^#\/([a-z]+)(?:\/([^/]+))?/); return { h, path: m ? m[1] : "kurs", arg: m ? m[2] : undefined }; }
function paint() {
  const { h, path, arg } = parseRoute();
  renderNav(h);
  window.scrollTo(0, 0);
  (VIEWS[path] || viewCourse)(arg);
  setupReveal();
}
function route() {
  if (document.startViewTransition && !reduceMq.matches && $main.children.length) { $main.classList.add("vt"); const t = document.startViewTransition(paint); t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {}); t.finished.catch(() => {}).finally(() => $main.classList.remove("vt")); }
  else paint();
}
let lastPct = null;
function rerenderQuiet() {
  lastPct = (() => { const b = $main.querySelector(".lesson-meta .bar > i"); return b ? parseInt(b.style.getPropertyValue("--w")) || 0 : null; })();
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
  const open = [...$main.querySelectorAll(".t-body:not([hidden])")].map((b) => b.closest(".task")?.querySelector(".t-name")?.textContent);
  const y = window.scrollY;
  const { h, path, arg } = parseRoute();
  renderNav(h);
  (VIEWS[path] || viewCourse)(arg);
  $main.querySelectorAll(".task").forEach((t) => { if (open.includes(t.querySelector(".t-name")?.textContent)) { const b = t.querySelector(".t-body"); if (b) b.hidden = false; } });
  $main.querySelectorAll(":scope > *").forEach((el) => { el.style.animation = "none"; });
  $main.querySelectorAll(RV).forEach((el) => el.classList.add("rv-item", "in"));
  const bar = $main.querySelector(".lesson-meta .bar > i"); if (bar && lastPct !== null) { const to = bar.style.getPropertyValue("--w"); bar.style.setProperty("--w", lastPct + "%"); requestAnimationFrame(() => requestAnimationFrame(() => bar.style.setProperty("--w", to))); }
  window.scrollTo(0, y);
}

async function main() {
  $main.innerHTML = `<div class="loading"><p>Učitavanje kursa…</p></div>`;
  try { localStorage.removeItem("komunikacija.theme"); } catch {}
  const res = await fetch("data/plan.json");
  PLAN = await res.json();
  PLAN.days.forEach((d) => byDate.set(d.date, d));
  PLAN.weeks.forEach((w) => weekById.set(w.id, w));
  window.addEventListener("hashchange", route);
  let pending = false;
  store.subscribe(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; rerenderQuiet(); }); });
  route();
  store.init();
}
main();
