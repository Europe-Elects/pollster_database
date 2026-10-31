/* Truth in Polling — Europe Elects. Reads data/pollsters.csv (built daily from the pollster sheet by the GitHub Action). */
(() => {
const SOURCES = ["data/pollsters.csv"];
const DATA_DATE = "1 May 2025"; // date of the research data shown under the title (not the daily rebuild)
const F = { tab: "Tab", name: "Pollster name", year: "Registration year", method: "Methodology", people: "Key people", acc: "Accuracy",
  coi: "Potential conflict of interest", member: "Membership", web: "Website", note: "Note", cov: "Coverage", ref: "Reference",
  presence: "Presence / Experience", clients: "Notable commissioners", addr: "Address", mail: "Email address" };

// ISO-2 → ISO 3166 numeric (world-atlas ids)
const NUM = {AX:"248",AL:"008",AD:"020",AM:"051",AT:"040",AZ:"031",BY:"112",BE:"056",BA:"070",BG:"100",HR:"191",CY:"196",
CZ:"203",DK:"208",EE:"233",FO:"234",FI:"246",FR:"250",GE:"268",DE:"276",GI:"292",GR:"300",GL:"304",GG:"831",HU:"348",
IS:"352",IE:"372",IM:"833",IT:"380",JE:"832",KZ:"398",LV:"428",LI:"438",LT:"440",LU:"442",MT:"470",MD:"498",MC:"492",
ME:"499",NL:"528",MK:"807",NO:"578",PL:"616",PT:"620",RO:"642",RU:"643",SM:"674",RS:"688",SK:"703",SI:"705",ES:"724",
SE:"752",CH:"756",TR:"792",UA:"804",GB:"826",VA:"336"};
const BY_NAME = { XK: "Kosovo" };

// Tabs are named after a country or its ISO-2 code.
const REGION = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const ALIASES = { "czech republic": "CZ", russia: "RU", turkey: "TR", "türkiye": "TR", turkiye: "TR", macedonia: "MK", "north macedonia": "MK",
  moldova: "MD", kosovo: "XK", uk: "GB", "great britain": "GB", "united kingdom": "GB", bosnia: "BA", "bosnia and herzegovina": "BA",
  "holy see": "VA", aland: "AX", "åland": "AX", "åland islands": "AX", "faroe islands": "FO", eu: "EU", "european union": "EU" };
const NAME_TO_ISO = (() => {
  const m = {};
  if (REGION) for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b); let n; try { n = REGION.of(code); } catch { continue; }
    if (n && n !== code) m[n.toLowerCase()] = code;
  }
  return Object.assign(m, ALIASES);
})();
const clean = v => (v ?? "").toString().replace(/[​-‍﻿]/g, "").trim();
const isoOfTab = t => { const s = clean(t); return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : NAME_TO_ISO[s.toLowerCase()] || ""; };
const nameOfIso = (iso, fb) => { if (iso === "EU") return "European Union"; try { const n = REGION && REGION.of(iso); if (n && n !== iso) return n; } catch {} return fb || iso; };

// Data-collection modes → icon (several per pollster)
const MODES = [
  ["phone", "Telephone", /\bCATI\b|telephon|\bphone|\bSMS\b/i],
  ["person", "Face-to-face", /\bF2F\b|face[- ]to[- ]face|\bCAPI\b|street|intercept|\bSIM\b|door[- ]to[- ]door|personal interview/i],
  ["laptop", "Online", /\bCAWI\b|online|internet|\bweb\b|self[- ]selection|panel/i],
  ["paper", "Paper", /\bPAPI\b|paper|postal|mail survey/i],
  ["robot", "Automated calls", /\bIVR\b|automated|robo[- ]?call/i],
  ["mix", "Mixed mode", /mixed[- ]mode|dual[- ]frame|polling[- ]mix|multi[- ]mode/i],
];
const NONE = /^(not identified|none( known| identified| found)?|no|n\/?a|-|–|unknown|unkown|not stated|not known|\?)\.?$/i;
const known = v => { v = clean(v); return !!v && !NONE.test(v); };

const $ = s => document.querySelector(s);
const tip = $("#tip");
const fmt = d3.format(",");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
// Links in the text are shown as their site name ("spiegel.de ↗"), not as long URLs.
const linkify = s => esc(s).replace(/https?:\/\/[^\s<>"()]+[^\s<>"().,;:]/g, u => `<a href="${u}" target="_blank" rel="noopener">${esc(host(u))}&nbsp;↗</a>`);
const mailify = s => linkify(s).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, m => `<a href="mailto:${m}">${m}</a>`);
const keyOf = n => clean(n).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const icon = (id, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

let ALL = [], state = { q: "", country: "", cov: false, coi: false };

// ---------- load ----------
async function load() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const rows = Papa.parse(await res.text(), { header: true, skipEmptyLines: true }).data.filter(r => clean(r[F.name]));
      if (rows.length) return { rows, stamp: res.headers.get("last-modified") };
    } catch (e) { /* next */ }
  }
  throw new Error("No data");
}
// Margin of error: the first plausible value (1–15 points) after "margin of error".
// Skips confidence levels ("95%", "99%") that the methodology text often mentions in the same sentence.
function moeOf(m) {
  if (/no margin of error|margin of error (?:is )?not (?:given|stated)/i.test(m)) return "not given";
  const at = m.search(/margin of error|\bMoE\b/i);
  if (at < 0) return "";
  const re = /(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(%\s*p\b|%p\b|%|percentage points?|points?\b|pts?\b)(?!\s*(?:confidence|level|CI\b|c\.i\.))/gi;
  const part = m.slice(at, at + 160);
  let x;
  while ((x = re.exec(part))) {
    const v = parseFloat(x[1].split(/[-–]/).pop().replace(",", "."));
    if (v >= 1 && v <= 15) {
      const unit = /point|pt/i.test(x[2]) ? " pts" : /p/i.test(x[2]) ? "%p" : "%";
      return "±" + x[1].replace(/\s+/g, "") + unit;
    }
  }
  return "";
}

function normalise(r) {
  const o = {};
  for (const k of Object.keys(r)) o[k] = clean(r[k]);
  for (const k of Object.values(F)) o[k] = o[k] || "";
  o._iso = isoOfTab(o[F.tab]);
  o._country = o._iso ? nameOfIso(o._iso, o[F.tab]) : o[F.tab];
  const y = (o[F.year].match(/\b(1[89]\d\d|20[0-3]\d)\b/) || [])[1];
  o._est = y ? (o[F.year].length <= 26 ? o[F.year].replace(/\s+/g, " ") : y) : "";
  o._modes = MODES.filter(([, , re]) => re.test(o[F.method])).map(([id, label]) => ({ id, label }));
  const m = o[F.method];
  const ss = m.match(/sample sizes?\b[^.;]*?(\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?)/i);
  o._sample = ss ? ss[1].replace(/[.,]+$/, "").replace(/\s*[-–]\s*/, "–") : "";
  o._moe = moeOf(m);
  o._cov = /^y/i.test(o[F.cov]) ? "yes" : /^n/i.test(o[F.cov]) ? "no" : "";
  o._coi = known(o[F.coi]);
  o._accUrl = (o[F.acc].match(/https?:\/\/\S+/) || [])[0] || "";
  o._site = (o[F.web].match(/https?:\/\/[^\s,;]+/) || [])[0] || (/^[\w-]+(\.[\w-]+)+/.test(o[F.web]) ? "https://" + o[F.web].split(/[\s,;]/)[0] : "");
  o._key = keyOf(o[F.name]);
  o._search = [o[F.name], o[F.people], o[F.method], o[F.member], o[F.note], o[F.coi], o[F.clients], o._country].join(" ").toLowerCase();
  return o;
}

// ---------- tooltip ----------
function showTip(ev, html) { tip.innerHTML = html; tip.style.opacity = 1; const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px"; }
const hideTip = () => (tip.style.opacity = 0);

// ---------- filtering ----------
const passes = (r, withCountry = true) => (!withCountry || !state.country || (r._iso || r._country) === state.country) &&
  (!state.cov || r._cov === "yes") && (!state.coi || r._coi) && (!state.q || r._search.includes(state.q.toLowerCase()));

// ---------- map ----------
let world = null;
function ukraineWithCrimea(topo) {  // Natural Earth draws Crimea as Russian: move it to Ukraine
  try { const g = topo.objects.countries.geometries, ru = g.find(x => String(x.id) === "643"), ua = g.find(x => String(x.id) === "804");
    if (!ru || !ua || ru.type !== "MultiPolygon") return;
    const i = ru.arcs.findIndex(p => d3.geoContains(topojson.feature(topo, { type: "Polygon", arcs: p }), [34.1, 45.3])); if (i < 0) return;
    const c = { type: "Polygon", arcs: ru.arcs[i] }; ru.arcs.splice(i, 1); const m = topojson.mergeArcs(topo, [ua, c]); ua.type = m.type; ua.arcs = m.arcs;
  } catch (e) { /* keep */ } }
function cyprusUnited(topo) {  // one Cyprus
  try { const g = topo.objects.countries.geometries, cy = g.find(x => String(x.id) === "196"), nc = g.find(x => x.properties && x.properties.name === "N. Cyprus");
    if (!cy || !nc) return; const m = topojson.mergeArcs(topo, [cy, nc]); cy.type = m.type; cy.arcs = m.arcs; g.splice(g.indexOf(nc), 1);
  } catch (e) { /* keep */ } }
async function renderMap() {
  const el = $("#map");
  try { if (!world) { const topo = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"); ukraineWithCrimea(topo); cyprusUnited(topo); world = topojson.feature(topo, topo.objects.countries).features; } }
  catch { el.innerHTML = '<p class="map-hint">Map unavailable.</p>'; return; }
  const cnt = d3.rollup(ALL.filter(r => passes(r, false)), v => v.length, r => r._iso);
  const byNum = Object.fromEntries(Object.entries(NUM).map(([a, n]) => [n, a])), byName = Object.fromEntries(Object.entries(BY_NAME).map(([a, n]) => [n, a]));
  const isoOf = f => byNum[f.id] || byName[f.properties.name] || null;
  const W = el.clientWidth || 700, H = el.clientHeight || 420;
  const proj = d3.geoConicConformal().rotate([-12, 0]).center([0, 52]).parallels([35, 65]);
  proj.fitExtent([[0, 0], [W, H]], { type: "MultiPoint", coordinates: [[-22, 36], [42, 36], [42, 69], [-22, 69], [10, 70], [10, 35]] });
  const path = d3.geoPath(proj), max = d3.max(cnt.values()) || 1;
  const color = d3.scaleSequential([0, Math.max(1, max)], d3.interpolateRgb("#C7D7F2", "#1B2A4A"));
  const svg = d3.select(el).selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("path.c").data(world, d => d.id + (d.properties.name || "")).join("path").attr("class", "c").attr("d", path)
    .attr("fill", d => { const n = cnt.get(isoOf(d)); return n ? color(n) : "var(--map-empty)"; })
    .classed("has", d => !!cnt.get(isoOf(d))).classed("sel", d => state.country && isoOf(d) === state.country)
    .on("mousemove", (ev, d) => { const iso = isoOf(d), n = cnt.get(iso) || 0; if (!n) return hideTip();
      const rs = ALL.filter(r => r._iso === iso && passes(r, false));
      showTip(ev, `<b>${esc(nameOfIso(iso))}</b><br><span class="mu">${n} ${n === 1 ? "self-identified pollster" : "self-identified pollsters"} · ${rs.filter(r => r._cov === "yes").length} republished by us</span>`); })
    .on("mouseleave", hideTip)
    .on("click", (ev, d) => { const iso = isoOf(d); if (!cnt.get(iso)) return; setCountry(state.country === iso ? "" : iso, true); });
  svg.selectAll("path.c.sel").raise();
}

// ---------- stats ----------
function renderStats(rows) {
  const firms = new Set(rows.map(r => r._key)).size, cov = rows.filter(r => r._cov === "yes").length, coi = rows.filter(r => r._coi).length;
  $("#stats").innerHTML = [[fmt(firms), firms === 1 ? "self-identified pollster" : "self-identified pollsters"], [rows.length ? Math.round(100 * cov / rows.length) + "%" : "–", "republished by us"], [fmt(coi), coi === 1 ? "potential conflict of interest" : "potential conflicts of interest"]]
    .map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
}

// ---------- profiles ----------
const OFF_TIP = "Europe Elects does not republish these polls: we could not confirm that they meet our standards for transparency and representativeness.";
function profile(r, i) {
  const out = r._cov === "no";
  const notes = r[F.note] ? r[F.note].split(/\n|•/).map(s => s.trim()).filter(Boolean) : [];
  const detail = [
    known(r[F.method]) ? `<div><h4>Methodology</h4><p>${linkify(r[F.method])}</p></div>` : "",
    r._coi ? `<div class="coi"><h4>${icon("warn", "warn")}Potential conflict of interest</h4><p>${linkify(r[F.coi])}</p></div>` : "",
    notes.length ? `<div><h4>Notes</h4>${notes.length > 1 ? `<ul>${notes.map(n => `<li>${linkify(n)}</li>`).join("")}</ul>` : `<p>${linkify(notes[0])}</p>`}</div>` : "",
    known(r[F.presence]) ? `<div><h4>Presence / experience</h4><p>${linkify(r[F.presence])}</p></div>` : "",
    known(r[F.clients]) ? `<div><h4>Notable commissioners</h4><p>${linkify(r[F.clients])}</p></div>` : "",
    known(r[F.member]) ? `<div><h4>Memberships</h4><p>${linkify(r[F.member])}</p></div>` : "",
    known(r[F.acc]) && !r._accUrl ? `<div><h4>Accuracy</h4><p>${linkify(r[F.acc])}</p></div>` : "",
    known(r[F.ref]) ? `<div><h4>Reference</h4><p>${linkify(r[F.ref])}</p></div>` : "",
    known(r[F.addr]) || known(r[F.mail]) ? `<div><h4>Contact</h4>${known(r[F.addr]) ? `<p>${esc(r[F.addr]).replace(/\n/g, "<br>")}</p>` : ""}${known(r[F.mail]) ? `<p>${mailify(r[F.mail])}</p>` : ""}</div>` : "",
  ].join("");
  return `<article class="p${r._coi ? " flag" : ""}${out ? " off" : ""}" data-i="${i}">
    <div class="p-head">
      <h3 class="p-name${out ? " out" : ""}">${esc(r[F.name])}</h3>
      ${r._coi ? `<svg class="warn" role="img" aria-label="Potential conflict of interest"><title>Potential conflict of interest – see Details</title><use href="#i-warn"/></svg>` : ""}
      ${r._est ? `<span class="est">Est. ${esc(r._est)}</span>` : ""}
    </div>
    ${out ? `<div class="off-label" title="${esc(OFF_TIP)}">Not republished by Europe Elects</div>` : ""}
    ${r._modes.length ? `<div class="methods">${r._modes.map(m => `<span class="m">${icon(m.id)}${m.label}</span>`).join("")}</div>` : ""}
    ${r._sample || r._moe ? `<div class="facts">${r._sample ? `<div><b>${esc(r._sample)}</b> <span>respondents</span></div>` : ""}${r._moe ? `<div><b>${esc(r._moe)}</b> <span>margin of error</span></div>` : ""}</div>` : ""}
    ${known(r[F.people]) ? `<p class="people">${esc(r[F.people])}</p>` : ""}
    <div class="p-actions">
      ${r._accUrl ? `<a class="btn acc" href="${esc(r._accUrl)}" target="_blank" rel="noopener">Accuracy review ↗</a>` : ""}
      ${r._site ? `<a class="btn" href="${esc(r._site)}" target="_blank" rel="noopener">${esc(host(r._site))} ↗</a>` : ""}
      ${detail ? `<button type="button" class="btn more" aria-expanded="false">Details ▾</button>` : ""}
    </div>
    ${detail ? `<div class="details">${detail}</div>` : ""}
  </article>`;
}
function renderList() {
  const rows = ALL.filter(r => passes(r));
  renderStats(rows);
  const groups = d3.groups(rows, r => r._iso || r._country).map(([k, rs]) => ({ k, name: rs[0]._country, rs }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const order = (a, b) => (a._cov === "no") - (b._cov === "no") || a[F.name].localeCompare(b[F.name], "en", { sensitivity: "base" });
  $("#list").innerHTML = groups.length ? groups.map(g => {
    const cov = g.rs.filter(r => r._cov === "yes").length, coi = g.rs.filter(r => r._coi).length;
    return `<section class="country" id="c-${esc(g.k)}"><h2>${esc(g.name)}<small>${g.rs.length} ${g.rs.length === 1 ? "self-identified pollster" : "self-identified pollsters"} · ${cov} republished by us${coi ? ` · ${coi} potential ${coi === 1 ? "conflict" : "conflicts"} of interest` : ""}</small></h2>${AUTHORITARIAN.includes(g.k) ? AUTH_NOTE : ""}
      <div class="cards">${g.rs.slice().sort(order).map(r => profile(r, ALL.indexOf(r))).join("")}</div></section>`;
  }).join("") : '<div class="empty card">No pollster matches these filters.</div>';
  $("#list").querySelectorAll(".btn.more").forEach(b => (b.onclick = () => {
    const p = b.closest(".p"), open = p.classList.toggle("open");
    b.setAttribute("aria-expanded", open); b.textContent = open ? "Less ▴" : "Details ▾"; postHeight();
  }));
}
// Authoritarian regimes: the self-censorship warning turns red when one of them is selected, and is repeated above its pollsters.
const AUTHORITARIAN = ["RU", "BY", "AZ"];
const AUTH_NOTE = `<div class="warning alert"><svg class="warn" aria-hidden="true"><use href="#i-warn"/></svg><p><strong>Polling has structural limits in this country.</strong> In <a href="https://v-dem.net/data_analysis/MapGraph/" target="_blank" rel="noopener">authoritarian regimes</a>, even technically rigorous surveys may fail to capture genuine public opinion due to respondent self-censorship.</p></div>`;
function setCountry(iso, scroll) {
  state.country = iso; $("#f-country").value = iso; render();
  if (scroll && iso) { const el = document.getElementById("c-" + iso); if (el && !EMBEDDED) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
}
function render() { $("#w-auth").classList.toggle("alert", AUTHORITARIAN.includes(state.country)); renderMap(); renderList(); setTimeout(postHeight, 50); }

// ---------- embedding (WordPress iframe) ----------
const EMBEDDED = window.self !== window.top;
if (EMBEDDED) document.documentElement.classList.add("embedded");
function postHeight() { if (EMBEDDED) parent.postMessage({ "datawrapper-height": { "ee-pollsters": document.body.scrollHeight } }, "*"); }

// ---------- boot ----------
async function boot() {
  let data;
  try { data = await load(); } catch (e) { $("#data-stamp").textContent = "Could not load the data"; return; }
  ALL = data.rows.filter(r => !/^(calculations?|summary|sources|data|template|readme|lists?)$/i.test(clean(r[F.tab]))).map(normalise);
  const nC = new Set(ALL.map(r => r._iso || r._country)).size;
  $("#data-stamp").textContent = `${fmt(new Set(ALL.map(r => r._key)).size)} self-described polling companies in ${nC} ${nC === 1 ? "country" : "countries"} · updated ${DATA_DATE}`;
  const countries = [...d3.rollup(ALL, v => v[0]._country, r => r._iso || r._country)].sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }));
  $("#f-country").innerHTML = '<option value="">All countries</option>' + countries.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("");
  $("#f-country").onchange = e => setCountry(e.target.value);
  let t; $("#q").oninput = e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); };
  const tog = (id, k) => ($(id).onclick = () => { state[k] = !state[k]; $(id).setAttribute("aria-pressed", state[k]); render(); });
  tog("#t-cov", "cov"); tog("#t-coi", "coi");
  $("#reset").onclick = () => { state = { q: "", country: "", cov: false, coi: false }; $("#q").value = ""; $("#f-country").value = "";
    ["#t-cov", "#t-coi"].forEach(s => $(s).setAttribute("aria-pressed", "false")); render(); };
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderMap, 150); });
  render();
}
boot();
if (window.ResizeObserver) new ResizeObserver(() => postHeight()).observe(document.body);
})();
