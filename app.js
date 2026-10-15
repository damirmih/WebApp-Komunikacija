// Komunikacija · plan do Nove godine. Vanilla ES moduli, hash ruter, bez build koraka.
import * as store from "./store.js";

const $main = document.getElementById("main");
const $side = document.getElementById("side");
const $tabs = document.getElementById("tabs");
const $toast = document.getElementById("toast");

let PLAN = null;
const byDate = new Map();
const weekById = new Map();

const SLOT = {
  glas: { label: "Glas", icon: "ph-microphone" },
  telo: { label: "Telo", icon: "ph-person-simple" },
  glavno: { label: "Glavna vežba", icon: "ph-target" },
  pitch: { label: "Pitch", icon: "ph-presentation" },
  checkpoint: { label: "Checkpoint", icon: "ph-flag-checkered" },
  checkin: { label: "Check-in", icon: "ph-chat-circle-dots" },
  izazov: { label: "Izazov", icon: "ph-fire" },
  refleksija: { label: "Dnevnik", icon: "ph-notebook" },
  bus: { label: "Bus", icon: "ph-bus" },
};
const SLOT_ORDER = ["glas", "telo", "glavno", "pitch", "checkpoint", "checkin", "izazov", "refleksija", "bus"];
const PILLARS = [
  ["Glas", ["glas"]], ["Telo", ["telo"]], ["Jasnoća i razgovor", ["glavno"]],
  ["Pitch", ["pitch", "checkpoint", "checkin"]], ["Izazovi", ["izazov"]], ["Dnevnik", ["refleksija"]],
];
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

function toast(msg) { $toast.textContent = msg; $toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove("show"), 1800); }

function dayStats(day) {
  const done = store.all("done");
  let n = 0, nd = 0, min = 0, mind = 0;
  day.tasks.forEach((t, i) => {
    if (!isCore(t)) return;
    n++; min += t.min;
    if (done[taskKey(day.date, t, i)]) { nd++; mind += t.min; }
  });
  return { n, nd, min, mind, pct: n ? Math.round((nd / n) * 100) : 0 };
}
function isDone(date, t, i) { return !!store.get("done", taskKey(date, t, i)); }

// ---------- nav ----------
const NAV = [
  ["#/danas", "ph-sun", "Danas"],
  ["#/kalendar", "ph-calendar-blank", "Kalendar"],
  ["#/progres", "ph-chart-line-up", "Progres"],
  ["#/vise", "ph-dots-three-circle", "Više"],
];
const SIDE_EXTRA = [["#/nedelje", "ph-rows", "Nedelje"], ["#/izazovi", "ph-fire", "Izazovi"], ["#/vezbe", "ph-books", "Vežbe"], ["#/podesavanja", "ph-gear", "Podešavanja"]];

function renderNav(route) {
  const act = (h) => (route.startsWith(h.slice(1)) ? "active" : "");
  $tabs.innerHTML = NAV.map(([h, i, l]) => `<a href="${h}" class="${act(h)}"><i class="ph ${i}"></i>${l}</a>`).join("");
  const s = store.sync();
  const statusTxt = s.status === "local" ? "Samo na ovom uređaju" : s.status === "online" ? `Sinhronizovano${s.lastSync ? " · " + new Date(s.lastSync).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" }) : ""}` : "Nisi prijavljen";
  $side.innerHTML = `<div class="brand"><img src="icons/icon.svg" alt=""> Komunikacija</div>` +
    [...NAV.slice(0, 3), ...SIDE_EXTRA].map(([h, i, l]) => `<a href="${h}" class="${act(h)}"><i class="ph ${i}"></i>${l}</a>`).join("") +
    `<div class="spacer"></div><div class="status">${esc(statusTxt)}${s.error ? `<br><span style="color:var(--warn)">${esc(s.error)}</span>` : ""}</div>`;
}

// ---------- views ----------
let sel = null; // izabrani zadatak za detalj: { date, i }

function goalTask(day) {
  const pri = { checkpoint: 4, pitch: 3, glavno: 2, checkin: 1 };
  let best = null, bi = -1;
  day.tasks.forEach((t, i) => { if (!isCore(t)) return; const score = (pri[t.slot] || 0) * 1000 + t.min; if (!best || score > best.score) { best = { t, i, score }; bi = i; } });
  return best ? { t: best.t, i: bi } : null;
}

function viewToday(date) {
  date = clampDate(date || isoToday());
  const day = byDate.get(date);
  const w = weekById.get(day.week);
  const st = dayStats(day);
  const today = isoToday();
  const journal = store.get("journal", date) ?? {};
  const settings = store.get("settings", "main") ?? {};
  const goal = goalTask(day);
  if (!sel || sel.date !== date) sel = goal ? { date, i: goal.i } : null;

  const groups = {};
  day.tasks.forEach((t, i) => (groups[t.slot] ??= []).push([t, i]));
  const coreList = day.tasks.map((t, i) => [t, i]).filter(([t]) => isCore(t));
  const segs = coreList.map(([t, i]) => `<i class="${isDone(date, t, i) ? "on" : ""}" title="${esc(t.name)}"></i>`).join("");
  const eventNote = [settings.polufinale === date && "Danas je polufinale: zagrevanje 5 min, udica 3× naglas, pauza 1–2 s pre svakog odgovora.",
    settings.finale === date && "Danas je finale: ritual pre izlaska, usađena stopala, posle: debrief dok je sveže."].filter(Boolean);

  // prstenovi: dani ove nedelje
  const wdays = PLAN.days.filter((d) => d.week === w.id);
  const rings = wdays.map((d) => {
    const s = dayStats(d);
    const cls = [d.date === today ? "today" : "", d.date > today ? "future" : "", d.date === date ? "sel" : ""].join(" ");
    const minPct = s.min ? Math.round((s.mind / s.min) * 100) : 0;
    return `<a href="#/dan/${d.date}" class="${cls}" title="${s.nd}/${s.n} zadataka · ${s.mind}/${s.min} min"><div class="fit" style="--o:${s.pct};--i:${minPct}"><span>${parse(d.date).getDate()}</span></div><span>${d.dow}</span></a>`;
  }).join("");

  let num = 0;
  $main.innerHTML = `
    <div class="daynav">
      <a class="iconbtn" href="#/dan/${addDays(date, -1)}" aria-label="Prethodni dan"><i class="ph ph-caret-left"></i></a>
      <div class="title"><h1>${date === today ? "Danas" : fmtLong(date)}</h1><div class="sub">${date === today ? fmtLong(date) + " · " : ""}dan ${PLAN.days.indexOf(day) + 1} od ${PLAN.days.length} · <a href="#/nedelja/${w.id}">${w.id} · ${esc(w.title)}</a></div></div>
      <a class="iconbtn" href="#/dan/${addDays(date, 1)}" aria-label="Sledeći dan"><i class="ph ph-caret-right"></i></a>
    </div>
    ${eventNote.map((n) => `<div class="callout" style="margin-bottom:12px">${esc(n)}</div>`).join("")}
    <div class="today-top">
      ${goal ? `<button class="goal" data-select="${goal.i}"><i class="ph ph-target"></i><span><span class="l">Cilj dana:</span> ${esc(goal.t.name)}</span><span class="m">${goal.t.min ? goal.t.min + " min" : ""}</span></button>` : ""}
      <div class="segbar"><div class="segs">${segs}</div><div class="lbl"><span>${st.nd}/${st.n} zadataka</span><span>${st.mind}/${st.min} min · ${st.pct}%</span></div></div>
    </div>
    <div class="rings">${rings}</div>
    <div class="today-grid">
      <div class="tasks">
        ${SLOT_ORDER.filter((s) => groups[s]).map((s) => `
          <div class="group-h"><i class="ph ${SLOT[s].icon}"></i>${SLOT[s].label}${s === "izazov" ? " · nivo " + w.level : ""}</div>
          ${groups[s].map(([t, i]) => renderTask(date, t, i, journal, ++num)).join("")}`).join("")}
      </div>
      <aside class="detail">${renderDetail(date, journal)}</aside>
    </div>
    <p class="faint small" style="margin-top:18px">${esc(w.rule)}</p>`;

  bindToday(date, journal);
}

function bindToday(date, journal) {
  $main.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", (e) => {
    e.stopPropagation();
    const [d, i] = el.dataset.toggle.split("|");
    const t = byDate.get(d).tasks[+i];
    const k = taskKey(d, t, +i);
    const now = !store.get("done", k);
    store.set("done", k, now ? { at: new Date().toISOString(), min: t.min } : null);
    if (now && isCore(t)) { const s = dayStats(byDate.get(d)); if (s.pct === 100) toast("Dan završen. Svaka čast."); }
  }));
  $main.querySelectorAll("[data-select]").forEach((el) => el.addEventListener("click", () => {
    const i = +el.dataset.select;
    const task = el.closest(".task");
    if (task && window.matchMedia("(max-width: 899px)").matches) { const body = task.querySelector(".t-body"); body.hidden = !body.hidden; }
    sel = { date, i };
    const d = $main.querySelector(".detail"); if (d) d.innerHTML = renderDetail(date, journal);
    $main.querySelectorAll(".task.sel").forEach((x) => x.classList.remove("sel"));
    $main.querySelector(`.task[data-i="${i}"]`)?.classList.add("sel");
    bindForms(date, journal);
  }));
  bindForms(date, journal);
}

function bindForms(date, journal) {
  $main.querySelectorAll("form[data-journal]").forEach((f) => { if (f.dataset.bound) return; f.dataset.bound = 1; f.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    store.set("journal", date, { ...(store.get("journal", date) ?? {}), ...data, savedAt: new Date().toISOString() });
    toast("Dnevnik sačuvan");
  }); });
  $main.querySelectorAll("form[data-challenge]").forEach((f) => { if (f.dataset.bound) return; f.dataset.bound = 1; f.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    store.set("challenge", `${date}|${f.dataset.challenge}`, { ...data, date, ch: f.dataset.challenge, savedAt: new Date().toISOString() });
    toast("Izazov zabeležen");
  }); });
}

function renderExtra(date, t, journal) {
  if (t.id === "R1") {
    const j = journal;
    return `<form class="form" data-journal>
      <label class="field"><span>Try & Apply: šta sam uradio (ime snimka)</span><input name="try" value="${esc(j.try)}"></label>
      <div class="grid3">
        <label class="field"><span>Vocal 0–10</span><input name="vocal" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.vocal)}"></label>
        <label class="field"><span>Visual 0–10</span><input name="visual" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.visual)}"></label>
        <label class="field"><span>Verbal 0–10</span><input name="verbal" type="number" min="0" max="10" inputmode="numeric" value="${esc(j.verbal)}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Sutra zadržavam</span><input name="keep" value="${esc(j.keep)}"></label>
        <label class="field"><span>Sutra menjam (1 stvar)</span><input name="change" value="${esc(j.change)}"></label>
      </div>
      <label class="field"><span>Homework for Life: najvredniji trenutak dana</span><textarea name="hfl">${esc(j.hfl)}</textarea></label>
      <label class="field row" style="grid-template-columns:auto 1fr"><input type="checkbox" name="comfort" value="1" style="width:auto" ${j.comfort ? "checked" : ""}> <span>Bio sam van zone komfora danas</span></label>
      <div class="actions"><button class="btn primary sm" type="submit">Sačuvaj</button></div>
    </form>`;
  }
  if (t.slot === "izazov" && t.id.startsWith("CH")) {
    const c = store.get("challenge", `${date}|${t.id}`) ?? {};
    return `<form class="form" data-challenge="${t.id}">
      <label class="field"><span>Pre: predviđanje</span><input name="prediction" placeholder="misliće da sam čudan…" value="${esc(c.prediction)}"></label>
      <div class="grid2">
        <label class="field"><span>Stvarnost vs predviđanje (1 gore – 10 bolje)</span><input name="score" type="number" min="1" max="10" inputmode="numeric" value="${esc(c.score)}"></label>
        <label class="field"><span>Najteži trenutak</span><input name="hardest" value="${esc(c.hardest)}"></label>
      </div>
      <label class="field"><span>Sledeći put / sledeći nivo</span><input name="next" value="${esc(c.next)}"></label>
      <div class="actions"><button class="btn primary sm" type="submit">Zabeleži</button></div>
    </form>`;
  }
  return "";
}

function renderDetail(date, journal) {
  if (!sel) return `<div class="card empty"><i class="ph ph-cursor-click"></i>Izaberi zadatak sa liste.</div>`;
  const t = byDate.get(sel.date).tasks[sel.i];
  const done = isDone(date, t, sel.i);
  const link = (t.how.match(/youtube\.com\/[^\s|)]+/) || [])[0];
  return `<div class="card">
    <div class="d-kicker"><i class="ph ${SLOT[t.slot].icon}"></i>${SLOT[t.slot].label}${t.min ? ` · ${t.min} min` : ""} · težina ${t.diff}/5</div>
    <h2>${esc(t.name)}</h2>
    <div class="how">${esc(t.how)}${link ? ` <a href="https://${esc(link)}" target="_blank" rel="noopener">Otvori video <i class="ph ph-arrow-square-out"></i></a>` : ""}</div>
    ${t.metric ? `<div class="metric"><i class="ph ph-ruler"></i><span>Merilo: ${esc(t.metric)}</span></div>` : ""}
    ${t.src ? `<p class="faint small" style="margin-top:10px">Izvor: research/${esc(t.src)}</p>` : ""}
    <div class="actions"><button class="btn ${done ? "" : "primary"}" data-toggle="${date}|${sel.i}"><i class="ph ph-check"></i>${done ? "Vrati na neurađeno" : "Označi kao urađeno"}</button></div>
    ${renderExtra(date, t, journal)}
  </div>`;
}

function renderTask(date, t, i, journal, num) {
  const done = isDone(date, t, i);
  const isSel = sel && sel.date === date && sel.i === i;
  const fire = t.slot === "izazov" && t.id.startsWith("CH");
  const diff = `<span class="diff" title="težina ${t.diff}/5">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= t.diff ? "on" : ""}"></b>`).join("")}</span>`;
  const link = (t.how.match(/youtube\.com\/[^\s|)]+/) || [])[0];
  return `<div class="task ${done ? "done" : ""} ${isSel ? "sel" : ""} ${fire ? "fire" : ""}" data-i="${i}">
    <button class="check" data-toggle="${date}|${i}" aria-label="${done ? "Označi kao neurađeno" : "Označi kao urađeno"}" aria-pressed="${done}"><i class="ph ph-check"></i></button>
    <div class="t-main" data-select="${i}">
      <div class="t-name">${num ? `<span class="faint">${num})</span> ` : ""}${esc(t.name)}</div>
      <div class="t-meta">${diff}${fire ? `<span>${esc(t.how.slice(0, 70))}${t.how.length > 70 ? "…" : ""}</span>` : t.src ? `<span>${esc(t.src)}</span>` : ""}</div>
    </div>
    <div class="t-min">${t.min ? t.min + "′" : ""}</div>
    <div class="t-body" hidden>
      <div class="how" style="color:var(--text)">${esc(t.how)}${link ? ` <a href="https://${esc(link)}" target="_blank" rel="noopener">Otvori video <i class="ph ph-arrow-square-out"></i></a>` : ""}</div>
      ${t.metric ? `<div class="metric"><i class="ph ph-ruler"></i><span>Merilo: ${esc(t.metric)}</span></div>` : ""}
      ${renderExtra(date, t, journal)}
    </div>
  </div>`;
}

function viewCalendar() {
  const today = isoToday();
  const settings = store.get("settings", "main") ?? {};
  const months = [[2026, 9], [2026, 10], [2026, 11]];
  const monthHtml = months.map(([y, m]) => {
    const first = new Date(y, m, 1); const lead = (first.getDay() + 6) % 7; const n = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= n; d++) cells.push(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (cells.length % 7) cells.push(null);
    let rows = "", mDone = 0, mDays = 0;
    for (let r = 0; r < cells.length; r += 7) {
      const week = cells.slice(r, r + 7);
      const wk = week.map((iso) => iso && byDate.get(iso)?.week).find(Boolean);
      rows += `<div class="wk">${wk ? `<a href="#/nedelja/${wk}" title="${esc(weekById.get(wk).title)}">${wk}</a>` : ""}</div>`;
      rows += week.map((iso) => {
        const day = iso && byDate.get(iso);
        if (!day) return `<div class="day out"></div>`;
        const st = dayStats(day);
        if (iso <= today) { mDays++; if (st.n && st.nd === st.n) mDone++; }
        const minPct = st.min ? Math.round((st.mind / st.min) * 100) : 0;
        const cls = ["day", iso === today ? "today" : "", iso > today ? "future" : "", day.checkpoint ? "cp" : "", settings.polufinale === iso || settings.finale === iso ? "event" : ""].join(" ");
        return `<a class="${cls}" href="#/dan/${iso}" title="${fmtLong(iso)} · ${st.nd}/${st.n} zadataka · ${st.mind}/${st.min} min"><div class="fit mini" style="--o:${st.pct};--i:${minPct}"><span>${parse(iso).getDate()}</span></div></a>`;
      }).join("");
    }
    return `<section class="month card"><div class="row between" style="margin-bottom:10px"><h2>${MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1)}</h2><span class="chip">${mDone}/${mDays} dana 100 %</span></div><div class="cal"><div class="wk"></div>${["P", "U", "S", "Č", "P", "S", "N"].map((x) => `<div class="dow">${x}</div>`).join("")}${rows}</div></section>`;
  }).join("");

  const key = [
    ["2026-10-15", "Baseline snimci", "ph-flag"], ["2026-11-01", "Checkpoint #1", "ph-flag-checkered"], ["2026-12-01", "Checkpoint #2", "ph-flag-checkered"], ["2026-12-31", "Završni checkpoint", "ph-trophy"],
    settings.polufinale && [settings.polufinale, "Polufinale InnovNation", "ph-microphone-stage"], settings.finale && [settings.finale, "Finale InnovNation", "ph-microphone-stage"],
  ].filter(Boolean).sort((a, b) => a[0].localeCompare(b[0]));
  const keyHtml = key.map(([iso, label, icon]) => {
    const diff = Math.round((parse(iso) - parse(today)) / 86400000);
    const when = diff === 0 ? "danas" : diff > 0 ? `za ${diff} dana` : `pre ${-diff} dana`;
    return `<a class="key ${diff < 0 ? "past" : ""} ${diff === 0 ? "now" : ""}" href="#/dan/${iso}"><i class="ph ${icon}"></i><div><b>${esc(label)}</b><span>${fmtLong(iso)} · ${when}</span></div></a>`;
  }).join("");

  $main.innerHTML = `
    <div class="pagehead"><div class="kicker">15. oktobar – 31. decembar 2026 · ${PLAN.days.length} dana</div><h1>Kalendar</h1></div>
    <div class="months">${monthHtml}</div>
    <div class="legend"><span><i class="fit mini" style="--o:100;--i:100;display:inline-grid;vertical-align:middle;margin-right:6px"></i>spoljni prsten zadaci, unutrašnji minuti</span><span><i style="background:var(--accent)"></i>checkpoint</span><span><i style="outline:2px solid var(--accent);outline-offset:-2px;background:transparent"></i>danas</span></div>
    <section style="margin-top:22px"><h3 style="margin-bottom:10px">Ključni datumi</h3><div class="keys">${keyHtml}</div>
      ${!settings.polufinale ? `<p class="faint small" style="margin-top:10px">Polufinale i finale upiši u <a href="#/podesavanja">Podešavanjima</a> kad saznaš datume.</p>` : ""}</section>`;
}

function viewWeeks() {
  const today = isoToday();
  const cards = PLAN.weeks.map((w) => {
    const days = PLAN.days.filter((d) => d.week === w.id);
    const agg = days.reduce((a, d) => { const s = dayStats(d); a.n += s.n; a.nd += s.nd; a.min += s.min; a.mind += s.mind; return a; }, { n: 0, nd: 0, min: 0, mind: 0 });
    const pct = agg.n ? Math.round((agg.nd / agg.n) * 100) : 0;
    const minPct = agg.min ? Math.round((agg.mind / agg.min) * 100) : 0;
    const cur = today >= w.from_ && today <= w.to;
    const state = cur ? "cur" : today > w.to ? "past" : "future";
    return `<a class="wcard ${state}" href="#/nedelja/${w.id}">
      <div class="wc-top"><span class="wc-id">${w.id}</span><div class="fit mini" style="--o:${pct};--i:${minPct}"><span>${pct}</span></div></div>
      <div class="wc-title">${esc(w.title)}</div>
      <div class="wc-theme">${esc(w.theme)}</div>
      <div class="wc-meta"><span>${fmtShort(w.from_)} – ${fmtShort(w.to)}</span><span class="diff" title="izazov nivo ${w.level}">${[4, 5, 6, 7, 8, 9, 10].map((n) => `<b class="${n <= w.level ? "on" : ""}"></b>`).join("")}</span>${w.checkpoint ? `<span class="chip accent"><i class="ph ph-flag-checkered"></i>${esc(w.checkpoint.replace(/\s*\(.*\)/, ""))}</span>` : ""}${w.note ? `<span class="chip" title="${esc(w.note)}"><i class="ph ph-microphone-stage"></i>takmičenje?</span>` : ""}</div>
    </a>`;
  }).join("");
  $main.innerHTML = `<div class="pagehead"><div class="kicker">12 nedelja · 15. 10. – 31. 12.</div><h1>Nedelje</h1></div><div class="wgrid">${cards}</div>`;
}

function viewWeek(id) {
  const w = weekById.get(id) || PLAN.weeks[0];
  const today = isoToday();
  const days = PLAN.days.filter((d) => d.week === w.id);
  const idx = PLAN.weeks.findIndex((x) => x.id === w.id);
  const prev = PLAN.weeks[idx - 1], next = PLAN.weeks[idx + 1];
  const agg = days.reduce((a, d) => { const s = dayStats(d); a.n += s.n; a.nd += s.nd; a.min += s.min; a.mind += s.mind; return a; }, { n: 0, nd: 0, min: 0, mind: 0 });
  const pct = agg.n ? Math.round((agg.nd / agg.n) * 100) : 0;
  const vids = w.videos.map((v) => { const [t, u] = v.split(" | "); return `<a href="https://${esc(u?.trim())}" target="_blank" rel="noopener"><i class="ph ph-play-circle"></i><span>${esc(t)}</span></a>`; }).join("");
  const rings = days.map((d) => { const s = dayStats(d); const minPct = s.min ? Math.round((s.mind / s.min) * 100) : 0; return `<a href="#/dan/${d.date}" class="${d.date === today ? "today" : ""} ${d.date > today ? "future" : ""}"><div class="fit" style="--o:${s.pct};--i:${minPct}"><span>${parse(d.date).getDate()}</span></div><span>${d.dow}</span></a>`; }).join("");
  const dayRows = days.map((d) => {
    const s = dayStats(d); const g = goalTask(d); const ch = d.tasks.find((t) => t.slot === "izazov");
    return `<a class="drow ${d.date === today ? "today" : ""}" href="#/dan/${d.date}">
      <div class="dr-day"><b>${d.dow}</b><span>${fmtShort(d.date)}</span></div>
      <div class="dr-main"><b>${g ? esc(g.t.name) : ""}</b>${ch ? `<span><i class="ph ph-fire"></i> ${esc(ch.name)}</span>` : ""}</div>
      <div class="dr-right"><span class="mono small muted">${s.nd}/${s.n} · ${s.min}′</span><div class="bar"><i style="--w:${s.pct}%"></i></div></div>
    </a>`;
  }).join("");
  $main.innerHTML = `
    <div class="daynav">
      <a class="iconbtn" href="${prev ? "#/nedelja/" + prev.id : "#/nedelje"}" aria-label="Prethodna nedelja"><i class="ph ph-caret-left"></i></a>
      <div class="title"><h1>${w.id} · ${esc(w.title)}</h1><div class="sub">${fmtShort(w.from_)} – ${fmtShort(w.to)} · radni dan ${w.budgetWeekday} min · izazov nivo ${w.level} · ${pct}% urađeno</div></div>
      <a class="iconbtn" href="${next ? "#/nedelja/" + next.id : "#/nedelje"}" aria-label="Sledeća nedelja"><i class="ph ph-caret-right"></i></a>
    </div>
    <div class="rings">${rings}</div>
    ${w.note ? `<div class="card" style="border-color:rgba(240,168,75,.35);margin-bottom:14px"><div class="row" style="gap:12px"><i class="ph ph-microphone-stage" style="font-size:22px;color:var(--accent)"></i><p class="small">${esc(w.note)}</p></div></div>` : ""}
    <div class="wcols">
      <section class="card stack" style="gap:14px">
        <div><h2>${esc(w.theme)}</h2><p class="muted" style="margin-top:8px;line-height:1.55">${esc(w.why)}</p></div>
        <div class="callout">${esc(w.rule)}</div>
        ${w.checkpoint ? `<div class="chip accent" style="justify-self:start"><i class="ph ph-flag-checkered"></i> ${esc(w.checkpoint)}</div>` : ""}
      </section>
      <section class="stack">
        <div class="card stack" style="gap:8px"><h3>Dnevna rutina</h3>
          <p class="small"><i class="ph ph-microphone" style="color:var(--accent)"></i> <b>Glas:</b> ${esc(w.voice.join(" · ") || "u okviru pitcha")}</p>
          <p class="small"><i class="ph ph-person-simple" style="color:var(--accent)"></i> <b>Telo:</b> ${esc(w.body.join(" · ") || "pravilo nedelje važi ceo dan")}</p></div>
        ${vids ? `<div class="card stack" style="gap:10px"><h3>Video nedelje</h3><div class="videos">${vids}</div></div>` : ""}
      </section>
    </div>
    <section style="margin-top:14px"><h3 style="margin-bottom:10px">Dan po dan</h3><div class="drows">${dayRows}</div></section>`;
}

function streak() {
  let s = 0, d = isoToday();
  if (d > PLAN.days.at(-1).date) d = PLAN.days.at(-1).date;
  // današnji dan se računa ako ima bar 1 urađen core zadatak; inače krećemo od juče
  const has = (iso) => { const day = byDate.get(iso); return day && dayStats(day).nd > 0; };
  if (!has(d)) d = addDays(d, -1);
  while (byDate.has(d) && has(d)) { s++; d = addDays(d, -1); }
  return s;
}

const METRICS = [
  ["wpm", "Reči/min (govor)"], ["speakPct", "% vremena govora"], ["maxPause", "Najduža pauza (s)"], ["pauses", "Pauze >1 s"],
  ["db", "dB na 1 m"], ["fillers", "Poštapalice"], ["unsure", "Nesigurne reči"], ["f0", "F0 raspon (Hz)"],
  ["selfVoice", "Glas 0–10"], ["selfClarity", "Jasnoća 0–10"], ["selfBody", "Telo 0–10"], ["selfSmall", "Small talk 0–10"], ["selfStory", "Priča 0–10"], ["dad", "Tata 0–10"],
];
const CHECKPOINTS = ["2026-10-15", "2026-11-01", "2026-12-01", "2026-12-31"];
const BASE = { wpm: "125–140", speakPct: "38 / 68", maxPause: "7.9", pauses: "11 / 10", db: "-44 / -40", fillers: "0", unsure: "4 / 3", f0: "", selfVoice: "3", selfClarity: "6", selfBody: "7", selfSmall: "5", selfStory: "4", dad: "" };

function viewProgress() {
  const today = isoToday();
  const past = PLAN.days.filter((d) => d.date <= today);
  const agg = { n: 0, nd: 0, min: 0, mind: 0 };
  past.forEach((d) => { const s = dayStats(d); agg.n += s.n; agg.nd += s.nd; agg.min += s.min; agg.mind += s.mind; });
  const total = PLAN.days.reduce((a, d) => a + dayStats(d).n, 0);
  const totalDone = PLAN.days.reduce((a, d) => a + dayStats(d).nd, 0);
  const totalPct = Math.round((totalDone / total) * 100);
  const done = store.all("done");
  const perPillar = PILLARS.map(([label, slots]) => {
    let n = 0, nd = 0;
    past.forEach((d) => d.tasks.forEach((t, i) => { if (slots.includes(t.slot)) { n++; if (done[taskKey(d.date, t, i)]) nd++; } }));
    return [label, n, nd];
  });
  const challenges = Object.values(store.all("challenge")).filter(Boolean);
  const chDoneTasks = past.reduce((a, d) => a + d.tasks.filter((t, i) => t.slot === "izazov" && done[taskKey(d.date, t, i)]).length, 0);
  const metrics = store.all("metrics");
  const daysIn = past.length;
  const perfectDays = past.filter((d) => { const s = dayStats(d); return s.n && s.nd === s.n; }).length;
  const weeks = PLAN.weeks.map((w) => {
    const days = PLAN.days.filter((d) => d.week === w.id);
    const a = days.reduce((x, d) => { const s = dayStats(d); x.n += s.n; x.nd += s.nd; return x; }, { n: 0, nd: 0 });
    return { w, pct: a.n ? Math.round((a.nd / a.n) * 100) : 0, cur: today >= w.from_ && today <= w.to, future: today < w.from_ };
  });
  const remaining = PLAN.days.length - daysIn;
  const dec31 = "2026-12-31";

  $main.innerHTML = `
    <div class="pagehead"><div class="kicker">Dan ${daysIn} od ${PLAN.days.length} · još ${remaining} dana do ${fmtShort(dec31)}</div><h1>Progres</h1></div>
    <div class="prog-top">
      <div class="card prog-hero">
        <div class="fit big" style="--o:${totalPct};--i:${Math.round((agg.mind / Math.max(1, PLAN.days.reduce((a, d) => a + dayStats(d).min, 0))) * 100)}"><span>${totalPct}%</span></div>
        <div>
          <h2>Ceo plan do Nove godine</h2>
          <p class="muted small" style="margin-top:6px">${totalDone} od ${total} zadataka. Spoljni prsten su zadaci, unutrašnji minuti.</p>
          <div class="prog-mini">
            <div><b>${streak()}</b><span>dana zaredom</span></div>
            <div><b>${perfectDays}</b><span>dana sa 100 %</span></div>
            <div><b>${agg.n ? Math.round((agg.nd / agg.n) * 100) : 0}%</b><span>do danas (${agg.nd}/${agg.n})</span></div>
            <div><b>${Math.round(agg.mind / 60 * 10) / 10}h</b><span>vežbanja od ${Math.round(agg.min / 60)}h</span></div>
            <div><b>${chDoneTasks}</b><span>izazova · ${challenges.length} logova</span></div>
          </div>
        </div>
      </div>
    </div>
    <div class="prog-cols">
      <section class="card">
        <h3 style="margin-bottom:12px">12 nedelja</h3>
        <div class="weeks-strip">${weeks.map((x) => `<a href="#/nedelja/${x.w.id}" class="${x.cur ? "cur" : ""} ${x.future ? "future" : ""}" title="${esc(x.w.title)} · ${x.pct}%"><div class="col"><i style="--h:${x.pct}%"></i></div><span>${x.w.id.replace("W", "")}</span></a>`).join("")}</div>
        <p class="faint small" style="margin-top:10px">${esc(weeks.find((x) => x.cur)?.w.title ?? "")}</p>
      </section>
      <section class="card">
        <h3 style="margin-bottom:6px">Po oblasti, do danas</h3>
        ${perPillar.map(([l, n, nd]) => `<div class="pillar"><span>${l}</span><span class="mono small muted">${nd}/${n}</span><div class="bar"><i style="--w:${n ? Math.round(nd / n * 100) : 0}%"></i></div></div>`).join("")}
      </section>
    </div>
    <div class="prog-cols" style="margin-top:14px">
      <section class="card"><h3 style="margin-bottom:4px">Checkpointi</h3><p class="small muted" style="margin-bottom:10px">Isti snimci, iste brojke. Baseline od 15. 10. je upisan; ostalo popunjavaš posle analize.</p>
        <div class="tablewrap"><table class="metrics"><thead><tr><th>Merilo</th>${CHECKPOINTS.map((c) => `<th>${fmtShort(c)}</th>`).join("")}</tr></thead><tbody>
          ${METRICS.map(([k, l]) => `<tr><th>${l}</th>${CHECKPOINTS.map((c, ci) => `<td><input data-metric="${c}|${k}" value="${esc(ci === 0 ? (metrics[c]?.[k] ?? BASE[k]) : metrics[c]?.[k])}" placeholder="–"></td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="card"><h3 style="margin-bottom:8px">Subotnji benchmark</h3>
        <div class="stack" style="gap:8px">${renderBenchmarks(metrics)}</div></section>
    </div>`;

  $main.querySelectorAll("[data-metric]").forEach((inp) => inp.addEventListener("change", () => {
    const [c, k] = inp.dataset.metric.split("|");
    store.set("metrics", c, { ...(store.get("metrics", c) ?? {}), [k]: inp.value });
    toast("Sačuvano");
  }));
  $main.querySelectorAll("form[data-bench]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.date) return;
    store.set("metrics", "bench|" + data.date, { ...data, savedAt: new Date().toISOString() });
    toast("Benchmark upisan");
  }));
}

function renderBenchmarks(metrics) {
  const rows = Object.entries(metrics).filter(([k, v]) => k.startsWith("bench|") && v).sort();
  const lastSat = (() => { let d = isoToday(); while (parse(d).getDay() !== 6) d = addDays(d, -1); return d; })();
  return `${rows.length ? `<div class="tablewrap"><table class="metrics"><thead><tr><th>Datum</th><th>dB</th><th>r/min</th><th>Pauze</th><th>Samoocena</th><th>Tata</th><th>Beleška</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td class="mono">${fmtShort(k.slice(6))}</td><td class="mono">${esc(v.db)}</td><td class="mono">${esc(v.wpm)}</td><td class="mono">${esc(v.pauses)}</td><td class="mono">${esc(v.self)}</td><td class="mono">${esc(v.dad)}</td><td>${esc(v.note)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">Još nema benchmarka. Prvi je subota ${fmtShort("2026-10-17")}.</p>`}
    <form class="form" data-bench style="padding-top:4px">
      <div class="grid3">
        <label class="field"><span>Datum</span><input name="date" type="date" value="${lastSat}"></label>
        <label class="field"><span>dB na 1 m</span><input name="db" inputmode="decimal"></label>
        <label class="field"><span>Reči/min</span><input name="wpm" inputmode="numeric"></label>
        <label class="field"><span>Pauze >1 s</span><input name="pauses" inputmode="numeric"></label>
        <label class="field"><span>Samoocena 0–10</span><input name="self" inputmode="numeric"></label>
        <label class="field"><span>Tata 0–10</span><input name="dad" inputmode="numeric"></label>
      </div>
      <label class="field"><span>Tatina rečenica / beleška</span><input name="note"></label>
      <div class="actions"><button class="btn primary sm" type="submit">Upiši benchmark</button></div>
    </form>`;
}

function viewChallenges() {
  const today = isoToday();
  const done = store.all("done");
  const counts = {};
  PLAN.days.forEach((d) => d.tasks.forEach((t, i) => { if (t.id.startsWith("CH") && done[taskKey(d.date, t, i)]) counts[t.id] = (counts[t.id] || 0) + 1; }));
  const logs = Object.values(store.all("challenge")).filter(Boolean).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const curWeek = PLAN.weeks.find((w) => today >= w.from_ && today <= w.to) || PLAN.weeks[0];
  const levels = Object.entries(PLAN.challenges).map(([lvl, items]) => {
    const d = items.filter((it) => counts["CH" + it.n]).length;
    const reps = items.reduce((a, it) => a + (counts["CH" + it.n] || 0), 0);
    return { lvl: +lvl, items, d, reps, pct: Math.round((d / items.length) * 100), state: +lvl < curWeek.level ? "past" : +lvl === curWeek.level ? "cur" : "future" };
  });
  const totalDone = levels.reduce((a, l) => a + l.d, 0), totalItems = levels.reduce((a, l) => a + l.items.length, 0);
  const chName = (id) => { for (const items of Object.values(PLAN.challenges)) { const it = items.find((x) => "CH" + x.n === id); if (it) return it.text; } return id; };

  $main.innerHTML = `
    <div class="pagehead"><div class="kicker">Lestvica 4–10 · ${totalDone} od ${totalItems} izazova · tekući nivo ${curWeek.level} (${curWeek.id})</div><h1>Izazovi</h1></div>
    <div class="stepper">${levels.map((l) => `<a href="#lvl-${l.lvl}" class="step ${l.state}"><div class="fit" style="--o:${l.pct};--i:${Math.min(100, l.reps * 100 / (l.items.length * 3))}"><span>${l.lvl}</span></div><span>${l.d}/${l.items.length}</span></a>`).join("")}</div>
    <div class="callout" style="margin:18px 0 20px">Pre: zapiši predviđanje. Posle: 3 pitanja. Ako dobiješ „ne“, pitaj „zašto?“. Nivo se osvaja kad isti tip uradiš 3 puta bez većeg otpora.</div>
    <div class="chcols">
      <div class="ladder">${levels.map((l) => `<section class="lvl ${l.state}" id="lvl-${l.lvl}">
        <h3><span>Nivo ${l.lvl}${l.state === "cur" ? ` <span class="chip accent">ova nedelja</span>` : l.lvl === 10 ? ` <span class="chip">decembar</span>` : ""}</span><span class="chip ${l.d === l.items.length ? "ok" : ""}">${l.d}/${l.items.length}</span></h3>
        ${l.items.map((it) => { const c = counts["CH" + it.n] || 0; return `<div class="item ${c ? "done" : ""} ${c >= 3 ? "mastered" : ""}"><span class="n">#${it.n}</span><div><div>${esc(it.text)}</div><span class="faint small"><i class="ph ph-map-pin"></i> ${esc(it.where)}</span></div><span class="cnt">${c ? c + "×" : ""}</span></div>`; }).join("")}
      </section>`).join("")}</div>
      <aside class="chside">
        <div class="card stack" style="gap:10px"><h3>Poslednji logovi</h3>
          ${logs.length ? logs.slice(0, 8).map((l) => `<div class="logrow"><div class="score ${+l.score >= 7 ? "good" : +l.score <= 4 ? "bad" : ""}">${esc(l.score || "–")}</div><div><b>${esc(chName(l.ch))}</b><span>${l.date ? fmtShort(l.date) : ""}${l.hardest ? " · " + esc(l.hardest) : ""}</span>${l.prediction ? `<span class="faint">pre: ${esc(l.prediction)}</span>` : ""}</div></div>`).join("") : `<p class="muted small">Još nema logova. Svaki izazov na strani Danas ima formu: predviđanje, ocena 1–10, najteži trenutak, sledeći put.</p>`}
        </div>
        ${logs.length ? `<div class="card" style="margin-top:12px"><h3 style="margin-bottom:6px">Predviđanje vs stvarnost</h3><p class="small muted">Prosek ${(logs.filter((l) => +l.score).reduce((a, l) => a + +l.score, 0) / Math.max(1, logs.filter((l) => +l.score).length)).toFixed(1)}/10. Iznad 5 znači da je bilo bolje nego što si mislio, a to je ceo trening.</p></div>` : ""}
      </aside>
    </div>`;
  $main.querySelectorAll(".stepper a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
}

let exFilter = { q: "", slot: "" };
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
    return `<div class="exgrid">${list.map((e) => { const u = usage[e.id] || { count: 0 }; return `<details class="excard" ${e.id === exOpen ? "open" : ""} data-id="${e.id}">
      <summary>
        <div class="ex-top"><span class="chip"><i class="ph ${SLOT[e.slot].icon}"></i>${SLOT[e.slot].label}</span><span class="ex-id">${e.id}</span></div>
        <div class="ex-name">${esc(e.name)}</div>
        <div class="ex-meta"><span>${e.min ? e.min + " min" : "tokom dana"}</span><span class="diff">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= e.diff ? "on" : ""}"></b>`).join("")}</span><span>${u.count}× u planu${u.next ? " · sledeće " + fmtShort(u.next) : ""}</span></div>
      </summary>
      <div class="ex-body"><p>${esc(e.how)}</p>${e.metric ? `<div class="metric"><i class="ph ph-ruler"></i><span>Merilo: ${esc(e.metric)}</span></div>` : ""}${e.src ? `<p class="faint small" style="margin-top:8px">Izvor: research/${esc(e.src)}</p>` : ""}${u.next ? `<a class="btn sm" style="margin-top:12px" href="#/dan/${u.next}"><i class="ph ph-calendar-blank"></i>Otvori ${fmtShort(u.next)}</a>` : ""}</div>
    </details>`; }).join("")}</div>`;
  };
  $main.innerHTML = `<div class="pagehead"><div class="kicker">${ex.length} vežbi iz istraživanja · klik otvara uputstvo</div><h1>Vežbe</h1></div>
    <div class="search"><div class="row" style="gap:8px"><i class="ph ph-magnifying-glass" style="font-size:20px;color:var(--text-3)"></i><input type="search" id="q" placeholder="Pretraži: slamčica, PREP, žiri, pauza…" value="${esc(exFilter.q)}"></div>
      <div class="filters">${[["", "Sve"], ...slots.map((s) => [s, SLOT[s].label])].map(([v, l]) => `<button class="chip ${exFilter.slot === v ? "accent" : ""}" data-slot="${v}">${l}</button>`).join("")}</div></div>
    <div id="exlist">${render()}</div>`;
  const list = document.getElementById("exlist");
  document.getElementById("q").addEventListener("input", (e) => { exFilter.q = e.target.value; list.innerHTML = render(); });
  $main.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => { exFilter.slot = b.dataset.slot; $main.querySelectorAll("[data-slot]").forEach((x) => x.classList.toggle("accent", x === b)); list.innerHTML = render(); }));
  list.addEventListener("toggle", (e) => { if (e.target.open) exOpen = e.target.dataset.id; }, true);
}
let exOpen = "";

function viewMore() {
  $main.innerHTML = `<div class="pagehead"><h1>Više</h1></div><div class="weeklist">
    ${SIDE_EXTRA.map(([h, i, l]) => `<a class="weekrow" href="${h}"><div class="id"><i class="ph ${i}" style="font-size:22px"></i></div><div class="t">${l}</div><i class="ph ph-caret-right muted"></i></a>`).join("")}
    <a class="weekrow" href="#/plan"><div class="id"><i class="ph ph-info" style="font-size:22px"></i></div><div class="t">O planu</div><i class="ph ph-caret-right muted"></i></a></div>`;
}

function viewAbout() {
  const m = PLAN.meta;
  $main.innerHTML = `<div class="pagehead"><div class="kicker">${esc(m.person)}</div><h1>O planu</h1></div>
    <div class="stack">
      <div class="card stack"><h2>Cilj</h2><p>${esc(m.goal)}</p></div>
      <div class="card stack"><h3>Četiri stuba</h3><p class="muted">${m.pillars.map(esc).join(" · ")}</p></div>
      <div class="card stack"><h3>Radni dan</h3><p class="muted small">${esc(m.dailyRhythmWeekday)}</p><h3>Vikend</h3><p class="muted small">${esc(m.dailyRhythmWeekend)}</p></div>
      <div class="card stack"><h3>Početno stanje (15. 10.)</h3><p class="muted small">Tempo ${esc(m.baseline.wpmSpeaking)} r/min · govor ${esc(m.baseline.speakingTimePct)} % vremena · najduža pauza ${m.baseline.maxPauseSec} s · jačina ${esc(m.baseline.dbMean)} dB · poštapalice ${m.baseline.fillers} · ruke: ${esc(m.baseline.hands)} · njihanje: ${esc(m.baseline.sway)}</p></div>
      <p class="faint small">Plan generisan ${esc(m.generated)} iz plan/build_plan.py. Vežbe i izvori: research/01–06.</p>
    </div>`;
}

function viewSettings() {
  const s = store.get("settings", "main") ?? {};
  const sync = store.sync();
  const user = store.currentUser();
  let theme = ""; try { theme = localStorage.getItem("komunikacija.theme") || ""; } catch {}
  const syncCard = sync.status === "local"
    ? `<div class="sync-state"><i class="ph ph-cloud-slash"></i><div><b>Samo na ovom uređaju</b><span>Supabase nije podešen (config.js).</span></div></div>`
    : user
      ? `<div class="sync-state on"><i class="ph ph-cloud-check"></i><div><b>${esc(user.email)}</b><span>${sync.lastSync ? "Sinhronizovano " + new Date(sync.lastSync).toLocaleString("sr-RS") : "Povezano"}${store.pendingCount() ? ` · čeka ${store.pendingCount()} promena` : ""}</span>${sync.error ? `<span style="color:var(--warn)">${esc(sync.error)}</span>` : ""}</div></div><div class="row" style="margin-top:12px"><button class="btn sm" id="out"><i class="ph ph-sign-out"></i>Odjavi se</button></div>`
      : `<div class="sync-state"><i class="ph ph-cloud"></i><div><b>Nisi prijavljen</b><span>Prijavi se jednom po uređaju da se progres čuva u bazi i deli između telefona i Maca.</span></div></div>
        <form class="form" id="login"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label><label class="field"><span>Lozinka</span><input name="password" type="password" autocomplete="current-password" required></label><div class="actions"><button class="btn sm" type="button" id="signup">Napravi nalog</button><button class="btn primary sm" type="submit">Prijavi se</button></div><p class="faint small" id="loginmsg"></p></form>`;

  $main.innerHTML = `<div class="pagehead"><div class="kicker">Nalog, datumi, izgled, podaci</div><h1>Podešavanja</h1></div><div class="setgrid">
    <section class="card stack"><h3><i class="ph ph-cloud-arrow-up"></i> Sinhronizacija</h3>${syncCard}</section>
    <section class="card stack"><h3><i class="ph ph-microphone-stage"></i> Datumi takmičenja</h3><p class="muted small">Kad saznaš, upiši. Tog dana Danas prikazuje ritual, a datumi se vide u Kalendaru.</p>
      <form class="form" id="dates"><div class="grid2"><label class="field"><span>Polufinale</span><input type="date" name="polufinale" value="${esc(s.polufinale)}"></label><label class="field"><span>Finale</span><input type="date" name="finale" value="${esc(s.finale)}"></label></div><div class="actions"><button class="btn primary sm" type="submit">Sačuvaj</button></div></form></section>
    <section class="card stack"><h3><i class="ph ph-moon"></i> Izgled</h3><div class="seg">${[["", "Tamno"], ["light", "Svetlo"]].map(([v, l]) => `<button class="${theme === v ? "on" : ""}" data-theme="${v}">${l}</button>`).join("")}</div>
      <p class="muted small">Na iPhone-u: Safari → Deli → <b>Add to Home Screen</b>, pa radi kao aplikacija bez trake browsera.</p></section>
    <section class="card stack"><h3><i class="ph ph-database"></i> Podaci</h3><p class="muted small">Progres, dnevnik, logovi izazova i merila. Izvoz je JSON koji možeš i meni da pošalješ.</p>
      <div class="row wrap"><button class="btn sm" id="export"><i class="ph ph-download-simple"></i>Izvezi JSON</button><label class="btn sm" for="import"><i class="ph ph-upload-simple"></i>Uvezi JSON</label><input id="import" type="file" accept="application/json" hidden><button class="btn sm" id="reset" style="color:var(--warn)"><i class="ph ph-trash"></i>Obriši lokalno</button></div></section>
    <section class="card stack"><h3><i class="ph ph-info"></i> O planu</h3><p class="muted small">${esc(PLAN.meta.goal)}</p><a class="btn sm" href="#/plan" style="justify-self:start">Pročitaj više</a></section>
  </div>`;
  document.getElementById("dates").addEventListener("submit", (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries()); store.set("settings", "main", { ...s, ...d }); toast("Sačuvano"); });
  document.getElementById("export").addEventListener("click", () => { const b = new Blob([store.exportJSON()], { type: "application/json" }); const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `komunikacija-${isoToday()}.json` }); a.click(); });
  document.getElementById("import").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; store.importJSON(await f.text()); toast("Uvezeno"); });
  document.getElementById("reset").addEventListener("click", () => { if (confirm("Obrisati sav progres sa ovog uređaja? (Ako si sinhronizovan, vratiće se sa servera.)")) { store.resetLocal(); toast("Obrisano"); } });
  $main.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { const t = b.dataset.theme; if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; try { localStorage.setItem("komunikacija.theme", t); } catch {} $main.querySelectorAll("[data-theme]").forEach((x) => x.classList.toggle("on", x === b)); }));
  const login = document.getElementById("login");
  if (login) {
    const msg = document.getElementById("loginmsg");
    login.addEventListener("submit", async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(login).entries()); try { await store.signIn(d.email, d.password); toast("Prijavljen"); } catch (err) { msg.textContent = err.message; } });
    document.getElementById("signup").addEventListener("click", async () => { const d = Object.fromEntries(new FormData(login).entries()); if (!d.email || !d.password) { msg.textContent = "Unesi email i lozinku."; return; } try { await store.signUp(d.email, d.password); msg.textContent = "Nalog napravljen. Ako je potrebna potvrda, proveri email, pa se prijavi."; } catch (err) { msg.textContent = err.message; } });
  }
  document.getElementById("out")?.addEventListener("click", async () => { await store.signOut(); toast("Odjavljen"); });
}

// ---------- router ----------
function route() {
  const h = location.hash || "#/danas";
  const [, path, arg] = h.match(/^#\/([a-z]+)(?:\/([^/]+))?/) || [, "danas"];
  renderNav(h);
  window.scrollTo(0, 0);
  switch (path) {
    case "danas": return viewToday();
    case "dan": return viewToday(arg);
    case "kalendar": return viewCalendar();
    case "nedelje": return viewWeeks();
    case "nedelja": return viewWeek(arg);
    case "progres": return viewProgress();
    case "izazovi": return viewChallenges();
    case "vezbe": return viewExercises();
    case "vise": return viewMore();
    case "plan": return viewAbout();
    case "podesavanja": return viewSettings();
    default: return viewToday();
  }
}

async function main() {
  try { const t = localStorage.getItem("komunikacija.theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
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

// Ponovni render bez skrolovanja na vrh (posle čekiranja), čuva otvorene detalje.
function rerenderQuiet() {
  const open = [...$main.querySelectorAll(".t-body:not([hidden])")].map((b) => b.closest(".task")?.querySelector(".t-name")?.textContent);
  const y = window.scrollY;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && !active.dataset.metric) return;
  const h = location.hash || "#/danas";
  const [, path, arg] = h.match(/^#\/([a-z]+)(?:\/([^/]+))?/) || [, "danas"];
  renderNav(h);
  ({ danas: () => viewToday(), dan: () => viewToday(arg), kalendar: viewCalendar, nedelje: viewWeeks, nedelja: () => viewWeek(arg), progres: viewProgress, izazovi: viewChallenges, vezbe: viewExercises, vise: viewMore, plan: viewAbout, podesavanja: viewSettings }[path] || viewToday)();
  $main.querySelectorAll(".task").forEach((t) => { if (open.includes(t.querySelector(".t-name")?.textContent)) t.querySelector(".t-body").hidden = false; });
  window.scrollTo(0, y);
}

main();
