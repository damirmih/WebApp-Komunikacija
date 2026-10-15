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
function viewToday(date) {
  date = clampDate(date || isoToday());
  const day = byDate.get(date);
  const w = weekById.get(day.week);
  const st = dayStats(day);
  const today = isoToday();
  const journal = store.get("journal", date) ?? {};
  const settings = store.get("settings", "main") ?? {};

  const groups = {};
  day.tasks.forEach((t, i) => (groups[t.slot] ??= []).push([t, i]));

  const eventNote = [settings.polufinale === date && "Danas je polufinale: zagrevanje 5 min, udica 3× naglas, pauza 1–2 s pre svakog odgovora.",
    settings.finale === date && "Danas je finale: ritual pre izlaska, usađena stopala, posle: debrief dok je sveže."].filter(Boolean);

  $main.innerHTML = `
    <div class="daynav">
      <a class="iconbtn" href="#/dan/${addDays(date, -1)}" aria-label="Prethodni dan"><i class="ph ph-caret-left"></i></a>
      <div class="title"><h1>${date === today ? "Danas" : fmtLong(date)}</h1><div class="sub">${date === today ? fmtLong(date) + " · " : ""}<a href="#/nedelja/${w.id}">${w.id} · ${esc(w.title)}</a></div></div>
      <a class="iconbtn" href="#/dan/${addDays(date, 1)}" aria-label="Sledeći dan"><i class="ph ph-caret-right"></i></a>
    </div>
    ${eventNote.map((n) => `<div class="callout" style="margin-bottom:12px"><b>${esc(n)}</b></div>`).join("")}
    <div class="card row between">
      <div class="stack" style="gap:4px">
        <div class="row wrap" style="gap:6px"><span class="chip accent"><i class="ph ph-fire"></i> izazov nivo ${w.level}</span><span class="chip mono">${st.mind}/${st.min} min</span>${day.checkpoint ? `<span class="chip ok"><i class="ph ph-flag-checkered"></i> checkpoint</span>` : ""}</div>
        <p class="small muted">${esc(w.rule)}</p>
      </div>
      <div class="ring" style="--p:${st.pct}"><span>${st.pct}%</span></div>
    </div>
    ${SLOT_ORDER.filter((s) => groups[s]).map((s) => `
      <section class="group">
        <div class="group-h"><i class="ph ${SLOT[s].icon}"></i>${SLOT[s].label}</div>
        <div class="card" style="padding:4px 6px">
          ${groups[s].map(([t, i]) => renderTask(date, t, i, journal)).join("")}
        </div>
      </section>`).join("")}
    <p class="faint small" style="margin-top:18px">Dan ${PLAN.days.indexOf(day) + 1} od ${PLAN.days.length} · ${w.theme}</p>`;

  $main.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", (e) => {
    e.stopPropagation();
    const [d, i] = el.dataset.toggle.split("|");
    const t = byDate.get(d).tasks[+i];
    const k = taskKey(d, t, +i);
    const now = !store.get("done", k);
    store.set("done", k, now ? { at: new Date().toISOString(), min: t.min } : null);
    if (now && isCore(t)) { const s = dayStats(byDate.get(d)); if (s.pct === 100) toast("Dan završen. Svaka čast."); }
  }));
  $main.querySelectorAll("[data-expand]").forEach((el) => el.addEventListener("click", () => {
    const body = el.closest(".task").querySelector(".t-body");
    body.hidden = !body.hidden;
  }));
  $main.querySelectorAll("form[data-journal]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    store.set("journal", date, { ...journal, ...data, savedAt: new Date().toISOString() });
    toast("Dnevnik sačuvan");
  }));
  $main.querySelectorAll("form[data-challenge]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    store.set("challenge", `${date}|${f.dataset.challenge}`, { ...data, date, ch: f.dataset.challenge, savedAt: new Date().toISOString() });
    toast("Izazov zabeležen");
  }));
}

function renderTask(date, t, i, journal) {
  const done = isDone(date, t, i);
  const diff = `<span class="diff" title="težina ${t.diff}/5">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= t.diff ? "on" : ""}"></b>`).join("")}</span>`;
  let extra = "";
  if (t.id === "R1") {
    const j = journal;
    extra = `<form class="form" data-journal>
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
  } else if (t.slot === "izazov" && t.id.startsWith("CH")) {
    const c = store.get("challenge", `${date}|${t.id}`) ?? {};
    extra = `<form class="form" data-challenge="${t.id}">
      <label class="field"><span>Pre: predviđanje</span><input name="prediction" placeholder="misliće da sam čudan…" value="${esc(c.prediction)}"></label>
      <div class="grid2">
        <label class="field"><span>Stvarnost vs predviđanje (1 gore – 10 bolje)</span><input name="score" type="number" min="1" max="10" inputmode="numeric" value="${esc(c.score)}"></label>
        <label class="field"><span>Najteži trenutak</span><input name="hardest" value="${esc(c.hardest)}"></label>
      </div>
      <label class="field"><span>Sledeći put / sledeći nivo</span><input name="next" value="${esc(c.next)}"></label>
      <div class="actions"><button class="btn primary sm" type="submit">Zabeleži</button></div>
    </form>`;
  }
  const link = (t.how.match(/youtube\.com\/[^\s|)]+/) || [])[0];
  return `<div class="task ${done ? "done" : ""}">
    <button class="check" data-toggle="${date}|${i}" aria-label="${done ? "Označi kao neurađeno" : "Označi kao urađeno"}" aria-pressed="${done}"><i class="ph ph-check"></i></button>
    <div class="t-main" data-expand>
      <div class="t-name">${esc(t.name)}</div>
      <div class="t-meta">${diff}${t.src ? `<span>${esc(t.src)}</span>` : ""}</div>
    </div>
    <div class="t-min">${t.min ? t.min + "′" : ""}</div>
    <div class="t-body" hidden>
      <div class="how">${esc(t.how)}${link ? ` <a href="https://${esc(link)}" target="_blank" rel="noopener">Otvori video <i class="ph ph-arrow-square-out"></i></a>` : ""}</div>
      ${t.metric ? `<div class="metric"><i class="ph ph-ruler"></i><span>Merilo: ${esc(t.metric)}</span></div>` : ""}
      ${extra}
    </div>
  </div>`;
}

function viewCalendar() {
  const today = isoToday();
  const months = [[2026, 9], [2026, 10], [2026, 11]];
  $main.innerHTML = `<div class="pagehead"><div class="kicker">15. oktobar – 31. decembar 2026</div><h1>Kalendar</h1></div>` +
    months.map(([y, m]) => {
      const first = new Date(y, m, 1); const lead = (first.getDay() + 6) % 7; const n = new Date(y, m + 1, 0).getDate();
      let cells = "";
      for (let i = 0; i < lead; i++) cells += `<a class="day out"></a>`;
      for (let d = 1; d <= n; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const day = byDate.get(iso);
        if (!day) { cells += `<a class="day out"></a>`; continue; }
        const st = dayStats(day);
        const cls = ["day", iso === today ? "today" : "", iso < today ? "past" : iso > today ? "future" : "", day.checkpoint ? "cp" : "", st.pct === 100 ? "full" : ""].join(" ");
        cells += `<a class="${cls}" href="#/dan/${iso}" style="--o:${(st.pct / 100).toFixed(2)}" title="${st.nd}/${st.n}"><span class="pct"></span><span class="n">${d}</span></a>`;
      }
      return `<section class="month"><h2>${MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1)}</h2><div class="cal">${["P", "U", "S", "Č", "P", "S", "N"].map((x) => `<div class="dow">${x}</div>`).join("")}${cells}</div></section>`;
    }).join("") +
    `<div class="legend"><span><i style="background:var(--ok)"></i>sve urađeno</span><span><i style="background:var(--ok-soft)"></i>delimično</span><span><i style="background:var(--accent)"></i>checkpoint</span></div>`;
}

function viewWeeks() {
  const today = isoToday();
  $main.innerHTML = `<div class="pagehead"><div class="kicker">12 nedelja</div><h1>Nedelje</h1></div><div class="weeklist">` +
    PLAN.weeks.map((w) => {
      const days = PLAN.days.filter((d) => d.week === w.id);
      const agg = days.reduce((a, d) => { const s = dayStats(d); a.n += s.n; a.nd += s.nd; return a; }, { n: 0, nd: 0 });
      const pct = agg.n ? Math.round((agg.nd / agg.n) * 100) : 0;
      const cur = today >= w.from_ && today <= w.to;
      return `<a class="weekrow" href="#/nedelja/${w.id}" ${cur ? 'style="border-color:var(--accent)"' : ""}>
        <div class="id">${w.id}</div>
        <div><div class="t">${esc(w.title)}</div><div class="s">${fmtShort(w.from_)} – ${fmtShort(w.to)} · nivo ${w.level}${w.checkpoint ? " · " + esc(w.checkpoint) : ""}</div><div class="bar" style="margin-top:8px"><i style="--w:${pct}%"></i></div></div>
        <div class="mono small muted">${pct}%</div></a>`;
    }).join("") + `</div>`;
}

function viewWeek(id) {
  const w = weekById.get(id) || PLAN.weeks[0];
  const today = isoToday();
  const days = PLAN.days.filter((d) => d.week === w.id);
  const idx = PLAN.weeks.findIndex((x) => x.id === w.id);
  const prev = PLAN.weeks[idx - 1], next = PLAN.weeks[idx + 1];
  const vids = w.videos.map((v) => { const [t, u] = v.split(" | "); return `<a href="https://${esc(u?.trim())}" target="_blank" rel="noopener"><i class="ph ph-play-circle"></i><span>${esc(t)}</span></a>`; }).join("");
  $main.innerHTML = `
    <div class="daynav">
      <a class="iconbtn" href="${prev ? "#/nedelja/" + prev.id : "#/nedelje"}" aria-label="Prethodna nedelja"><i class="ph ph-caret-left"></i></a>
      <div class="title"><h1>${w.id} · ${esc(w.title)}</h1><div class="sub">${fmtShort(w.from_)} – ${fmtShort(w.to)} · radni dan ${w.budgetWeekday} min · izazov nivo ${w.level}</div></div>
      <a class="iconbtn" href="${next ? "#/nedelja/" + next.id : "#/nedelje"}" aria-label="Sledeća nedelja"><i class="ph ph-caret-right"></i></a>
    </div>
    <div class="stack">
      <div class="card stack"><h2>${esc(w.theme)}</h2><p class="muted">${esc(w.why)}</p></div>
      <div class="callout"><b>${esc(w.rule)}</b></div>
      ${w.note ? `<div class="callout" style="border-color:var(--warn);background:color-mix(in srgb,var(--warn) 12%,transparent)">${esc(w.note)}</div>` : ""}
      ${w.checkpoint ? `<div class="chip ok" style="justify-self:start"><i class="ph ph-flag-checkered"></i> ${esc(w.checkpoint)}</div>` : ""}
      <div class="days7">${days.map((d) => { const s = dayStats(d); return `<a href="#/dan/${d.date}" class="${d.date === today ? "today" : ""}"><span>${d.dow}</span><div class="ring" style="--p:${s.pct}"><span>${s.pct}</span></div><span class="faint">${parse(d.date).getDate()}.</span></a>`; }).join("")}</div>
      <div class="card stack"><h3>Dnevna rutina ove nedelje</h3>
        <p class="small"><b>Glas:</b> ${esc(w.voice.join(" · ") || "u okviru pitcha")}</p>
        <p class="small"><b>Telo:</b> ${esc(w.body.join(" · ") || "pravilo nedelje važi ceo dan")}</p></div>
      ${vids ? `<div><h3 style="margin-bottom:8px">Video nedelje</h3><div class="videos">${vids}</div></div>` : ""}
    </div>`;
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

  $main.innerHTML = `
    <div class="pagehead"><div class="kicker">Dan ${daysIn} od ${PLAN.days.length}</div><h1>Progres</h1></div>
    <div class="stats">
      <div class="stat"><div class="v">${streak()}</div><div class="l">dana zaredom sa bar jednom vežbom</div></div>
      <div class="stat"><div class="v">${agg.n ? Math.round((agg.nd / agg.n) * 100) : 0}%</div><div class="l">zadataka urađeno do danas (${agg.nd}/${agg.n})</div></div>
      <div class="stat"><div class="v">${Math.round(agg.mind / 60 * 10) / 10}h</div><div class="l">vežbanja upisano (od ${Math.round(agg.min / 60)}h planiranih)</div></div>
      <div class="stat"><div class="v">${chDoneTasks}</div><div class="l">izazova urađeno · ${challenges.length} zabeleženo</div></div>
      <div class="stat"><div class="v">${Math.round((totalDone / total) * 100)}%</div><div class="l">celog plana do 31. 12.</div></div>
    </div>
    <section class="card" style="margin-top:14px"><h3 style="margin-bottom:6px">Po oblasti (do danas)</h3>
      ${perPillar.map(([l, n, nd]) => `<div class="pillar"><span>${l}</span><span class="mono small muted">${nd}/${n}</span><div class="bar ${n && nd === n ? "ok" : ""}"><i style="--w:${n ? Math.round(nd / n * 100) : 0}%"></i></div></div>`).join("")}
    </section>
    <section style="margin-top:22px"><h2 style="margin-bottom:4px">Checkpointi</h2><p class="small muted" style="margin-bottom:10px">Isti snimci, iste brojke. Popuni posle svake analize; baseline je upisan.</p>
      <div class="tablewrap"><table class="metrics"><thead><tr><th>Merilo</th>${CHECKPOINTS.map((c) => `<th>${fmtShort(c)}</th>`).join("")}</tr></thead><tbody>
        ${METRICS.map(([k, l]) => `<tr><th>${l}</th>${CHECKPOINTS.map((c, ci) => `<td><input data-metric="${c}|${k}" value="${esc(ci === 0 ? (metrics[c]?.[k] ?? BASE[k]) : metrics[c]?.[k])}" placeholder="–"></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
    </section>
    <section style="margin-top:22px"><h2 style="margin-bottom:8px">Subotnji benchmark</h2>
      <div class="card stack" style="gap:8px">${renderBenchmarks(metrics)}</div></section>`;

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
  const done = store.all("done");
  const counts = {};
  PLAN.days.forEach((d) => d.tasks.forEach((t, i) => { if (t.id.startsWith("CH") && done[taskKey(d.date, t, i)]) counts[t.id] = (counts[t.id] || 0) + 1; }));
  const logs = store.all("challenge");
  const logCount = {}; Object.values(logs).forEach((l) => { if (l) logCount[l.ch] = (logCount[l.ch] || 0) + 1; });
  $main.innerHTML = `<div class="pagehead"><div class="kicker">Lestvica 4–10 · nivo se osvaja kad isti tip uradiš 3 puta bez većeg otpora</div><h1>Izazovi</h1></div>
    <div class="callout" style="margin-bottom:14px">Pre: zapiši predviđanje. Posle: 3 pitanja. Ako dobiješ „ne“, pitaj „zašto?“. Ostani u situaciji dok nervoza ne spadne.</div>
    <div class="ladder">${Object.entries(PLAN.challenges).map(([lvl, items]) => {
      const d = items.filter((it) => counts["CH" + it.n]).length;
      return `<div class="lvl"><h3><span>Nivo ${lvl}</span><span class="chip ${d === items.length ? "ok" : ""}">${d}/${items.length}</span></h3>
        ${items.map((it) => `<div class="item ${counts["CH" + it.n] ? "done" : ""}"><span class="n">#${it.n}</span><span>${esc(it.text)}<span class="faint small"> · ${esc(it.where)}</span></span><span class="cnt">${counts["CH" + it.n] || 0}×</span></div>`).join("")}</div>`;
    }).join("")}</div>`;
}

function viewExercises() {
  const ex = Object.values(PLAN.exercises);
  const groups = {};
  ex.forEach((e) => (groups[e.slot] ??= []).push(e));
  const render = (q = "") => {
    const ql = q.toLowerCase();
    return SLOT_ORDER.filter((s) => groups[s]).map((s) => {
      const list = groups[s].filter((e) => !ql || (e.name + e.how + e.id).toLowerCase().includes(ql));
      if (!list.length) return "";
      return `<section class="group"><div class="group-h"><i class="ph ${SLOT[s].icon}"></i>${SLOT[s].label} · ${list.length}</div>
        <div class="card" style="padding:0 14px">${list.map((e) => `<details class="ex"><summary><span>${esc(e.name)}</span><span class="mono faint small">${e.id} · ${e.min}′ · ${e.diff}/5</span></summary><div class="body"><p style="color:var(--text)">${esc(e.how)}</p>${e.metric ? `<p><b>Merilo:</b> ${esc(e.metric)}</p>` : ""}${e.src ? `<p class="faint small">Izvor: research/${esc(e.src)}</p>` : ""}</div></details>`).join("")}</div></section>`;
    }).join("");
  };
  $main.innerHTML = `<div class="pagehead"><div class="kicker">${ex.length} vežbi iz istraživanja</div><h1>Vežbe</h1></div>
    <div class="search"><input type="search" id="q" placeholder="Pretraži (npr. slamčica, PREP, žiri)…"></div><div id="exlist">${render()}</div>`;
  document.getElementById("q").addEventListener("input", (e) => { document.getElementById("exlist").innerHTML = render(e.target.value); });
}

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
  $main.innerHTML = `<div class="pagehead"><h1>Podešavanja</h1></div><div class="stack">
    <section class="card stack"><h2>Sinhronizacija</h2>
      ${sync.status === "local" ? `<p class="muted small">Supabase nije podešen (config.js). Progres se čuva samo na ovom uređaju.</p>` :
        user ? `<p class="small">Prijavljen kao <b>${esc(user.email)}</b>. ${sync.lastSync ? "Poslednja sinhronizacija " + new Date(sync.lastSync).toLocaleString("sr-RS") : ""}${store.pendingCount() ? ` · čeka ${store.pendingCount()} promena` : ""}</p>${sync.error ? `<p class="small" style="color:var(--warn)">${esc(sync.error)}</p>` : ""}<div><button class="btn sm" id="out">Odjavi se</button></div>` :
        `<form class="form" id="login"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label><label class="field"><span>Lozinka</span><input name="password" type="password" autocomplete="current-password" required></label><div class="actions"><button class="btn sm" type="button" id="signup">Napravi nalog</button><button class="btn primary sm" type="submit">Prijavi se</button></div><p class="faint small" id="loginmsg"></p></form>`}
    </section>
    <section class="card stack"><h2>Datumi takmičenja</h2><p class="muted small">Kad saznaš, upiši. Na taj dan Danas prikazuje ritual, a nedelje W6/W9 treba pomeriti u planu.</p>
      <form class="form" id="dates"><div class="grid2"><label class="field"><span>Polufinale</span><input type="date" name="polufinale" value="${esc(s.polufinale)}"></label><label class="field"><span>Finale</span><input type="date" name="finale" value="${esc(s.finale)}"></label></div><div class="actions"><button class="btn primary sm" type="submit">Sačuvaj</button></div></form>
    </section>
    <section class="card stack"><h2>Izgled</h2><div class="row wrap"><button class="btn sm" data-theme="">Automatski</button><button class="btn sm" data-theme="light">Svetlo</button><button class="btn sm" data-theme="dark">Tamno</button></div></section>
    <section class="card stack"><h2>Podaci</h2><div class="row wrap"><button class="btn sm" id="export">Izvezi JSON</button><label class="btn sm" for="import">Uvezi JSON</label><input id="import" type="file" accept="application/json" hidden><button class="btn sm" id="reset" style="color:var(--warn)">Obriši lokalno</button></div></section>
  </div>`;
  document.getElementById("dates").addEventListener("submit", (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries()); store.set("settings", "main", { ...s, ...d }); toast("Sačuvano"); });
  document.getElementById("export").addEventListener("click", () => { const b = new Blob([store.exportJSON()], { type: "application/json" }); const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `komunikacija-${isoToday()}.json` }); a.click(); });
  document.getElementById("import").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; store.importJSON(await f.text()); toast("Uvezeno"); });
  document.getElementById("reset").addEventListener("click", () => { if (confirm("Obrisati sav progres sa ovog uređaja? (Ako si sinhronizovan, vratiće se sa servera.)")) { store.resetLocal(); toast("Obrisano"); } });
  $main.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { const t = b.dataset.theme; if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; try { localStorage.setItem("komunikacija.theme", t); } catch {} }));
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
