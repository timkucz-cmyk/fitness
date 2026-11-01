'use strict';

const KEY = 'fit.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt1 = n => n.toFixed(1).replace('.', ',');

// ---------- Datum (lokal, als YYYY-MM-DD) ----------
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
const weekStart = s => { const d = toDate(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
const fmtDate = s => toDate(s).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtShort = s => toDate(s).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
function isoWeek(s) {
  const d = toDate(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7);
}
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.max(0, Math.floor(s % 60)))}`;

// ---------- Speicher ----------
let S = load();

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.version ? s : null; } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Speichern nicht möglich – bitte exportieren'); }
}
function newState(p) {
  return {
    version: 1, created: Date.now(),
    profile: { start: ymd(), goalWeight: p.goalWeight, startTime: p.startTime, weeklyGoal: 3, rounds: 2, hasBar: p.hasBar, sound: true },
    levels: p.levels, sessions: [], weights: [], tests: [], miniWeeks: [], lastExport: null, reentryAck: null, installHintOff: false,
  };
}
const sortSessions = () => S.sessions.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts);

// ---------- Regeln ----------
const isUnit = s => s.type === 'training' || s.type === 'badminton';
const effLevel = m => m === 'pull' && !S.profile.hasBar ? Math.min(S.levels.pull, 3) : S.levels[m];
const exFor = (m, lv) => PATTERNS.find(p => p.id === m).ladder[lv - 1];
const unitLabel = ex => EX[ex].unit === 'sec' ? 's' : 'Wdh.';

function weekStats(ws) {
  const we = addDays(ws, 6);
  const list = S.sessions.filter(s => s.date >= ws && s.date <= we);
  const units = list.filter(isUnit).length;
  const mini = S.miniWeeks.includes(ws);
  const goal = S.profile.weeklyGoal;
  return { ws, list, units, contacts: list.length, mini, full: units >= goal, ok: units >= goal || (mini && list.length >= goal) };
}

function blockInfo(today = ymd()) {
  const d = Math.max(0, diffDays(S.profile.start, today));
  const block = Math.floor(d / 42) + 1;
  return { block, week: Math.floor((d % 42) / 7) + 1, testFrom: addDays(S.profile.start, (block - 1) * 42 + 35) };
}

function retestDue() {
  if (!S.tests.length) return 'baseline';
  const { testFrom } = blockInfo();
  return ymd() >= testFrom && !S.tests.some(t => t.date >= testFrom) ? 'retest' : null;
}

const lastOf = pred => { for (let i = S.sessions.length - 1; i >= 0; i--) if (pred(S.sessions[i])) return S.sessions[i]; return null; };

function lastValue(m, lv) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const sets = (S.sessions[i].sets || []).filter(x => x.m === m && x.level === lv && !x.warm);
    if (sets.length) return Math.max(...sets.map(x => x.v));
  }
  return null;
}

function decide(m, sets) {
  const ws = sets.filter(s => s.m === m && !s.warm && !s.mini);
  if (!ws.length) return { d: 0, lv: S.levels[m], why: 'Keine Arbeitssätze' };
  const lv = ws[0].level, r = range(ws[0].ex);
  const min = Math.min(...ws.map(s => s.v)), max = Math.max(...ws.map(s => s.v));
  const p = PATTERNS.find(x => x.id === m);
  if (min >= r.hi) {
    if (lv >= 5) return { d: 0, lv, why: 'Stufe 5 gemeistert – jetzt 3 s langsam ablassen' };
    if (EX[p.ladder[lv]].needsBar && !S.profile.hasBar) return { d: 0, lv, why: 'Nächste Stufe braucht die Klimmzugstange' };
    return { d: 1, lv, why: `Alle Sätze ≥ ${r.hi} → Stufe ${lv + 1}` };
  }
  if (max < r.down && lv > 1) return { d: -1, lv, why: `Unter ${r.down} → Stufe ${lv - 1}` };
  return { d: 0, lv, why: `Weiter auf Stufe ${lv}, Ziel ${r.hi} in allen Sätzen` };
}

function banners() {
  const out = [], today = ymd();
  const due = retestDue();
  if (due === 'baseline') out.push({ cls: 'info', t: 'Woche-0-Test fehlt', d: 'Er ist der Vergleichspunkt für alle Re-Tests. Ca. 15 Minuten.', act: 'test', btn: 'Test eintragen' });
  if (due === 'retest') out.push({ cls: 'info', t: `Re-Test Block ${blockInfo().block}`, d: 'Woche 6: Tests wiederholen. Danach startet der nächste Block automatisch.', act: 'test', btn: 'Test eintragen' });

  const lastT = lastOf(s => s.type === 'training');
  const gapT = lastT ? diffDays(lastT.date, today) : 0;
  const reentry = lastT && gapT >= 7 && S.reentryAck !== lastT.id;
  if (reentry) out.push({ cls: 'warn', t: 'Wiedereinstieg', d: `${gapT} Tage ohne Training. Heute je eine Stufe tiefer – nicht bei null.`, act: 'reentry', btn: 'Stufen −1', act2: 'reentryNo', btn2: 'Nein' });

  const lastAny = S.sessions[S.sessions.length - 1];
  if (!reentry && lastAny && diffDays(lastAny.date, today) >= 2) out.push({ cls: 'warn', t: 'Nicht zweimal auslassen', d: 'Heute reicht die Mini-Version. Matte ausrollen zählt.', act: 'mini', btn: 'Mini starten' });

  const ws = weekStart(today), p1 = addDays(ws, -7), p2 = addDays(ws, -14);
  if (S.miniWeeks.includes(ws)) out.push({ cls: 'info', t: 'Mini-Woche aktiv', d: `Ziel: ${S.profile.weeklyGoal} Kontakte, Minis zählen. Nächste Woche gilt wieder das normale Ziel.` });
  else if (p2 >= weekStart(S.profile.start) && !weekStats(p1).ok && !weekStats(p2).ok)
    out.push({ cls: 'warn', t: 'Zwei Wochen unter Ziel', d: 'Diese Woche als Mini-Woche: Auch Minis zählen. Das ist ein normaler Zustand, kein Scheitern.', act: 'miniweek', btn: 'Mini-Woche' });

  if (S.sessions.length + S.weights.length >= 3 && (!S.lastExport || diffDays(S.lastExport, today) >= 14))
    out.push({ cls: 'info', t: 'Backup fällig', d: S.lastExport ? `Letzter Export: ${fmtDate(S.lastExport)}.` : 'Die Daten liegen nur auf diesem Gerät.', act: 'export', btn: 'Exportieren' });

  if (isIOS() && !standalone() && !S.installHintOff)
    out.push({ cls: 'info', t: 'Auf den Home-Bildschirm', d: 'Safari: Teilen-Symbol → „Zum Home-Bildschirm“. Dann läuft die App im Vollbild und die Daten bleiben sicherer gespeichert.', act: 'hideInstall', btn: 'Ausblenden' });
  return out;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------- Ton & Bildschirm ----------
let AC = null;
function audioInit() {
  if (!S.profile.sound) return;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // mischt mit Spotify statt zu unterbrechen
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch { AC = null; }
}
function beep(freq = 880, dur = 0.12, vol = 0.25) {
  if (!S.profile.sound || !AC) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* ohne Ton weiter */ }
}
function flash() {
  const el = $('#run'); if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

let WL = null;
async function wakeOn() {
  try { if ('wakeLock' in navigator && !WL) { WL = await navigator.wakeLock.request('screen'); WL.addEventListener('release', () => { WL = null; }); } } catch { WL = null; }
}
function wakeOff() { try { WL && WL.release(); } catch { /* egal */ } WL = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && RUN) { wakeOn(); runTick(); } });

// ---------- Toast ----------
let toastTimer = 0;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button" data-act="undo">Rückgängig</button>' : '');
  el.hidden = false; toast.undo = undo || null;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; toast.undo = null; }, undo ? 5000 : 2600);
}

// ---------- Navigation ----------
let VIEW = (location.hash || '#heute').slice(1);
function go(v, to) {
  VIEW = v; history.replaceState(null, '', '#' + v); render(); window.scrollTo(0, 0);
  const el = to && document.getElementById(to); if (el) el.scrollIntoView({ block: 'start' });
}

function render() {
  const main = $('#view');
  $$('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.go === VIEW); b.toggleAttribute('aria-current', b.dataset.go === VIEW); });
  $('.tabs').hidden = !S;
  if (!S) { main.innerHTML = viewOnboarding(); return; }
  main.innerHTML = ({ heute: viewHome, verlauf: viewHistory, uebungen: viewExercises, mehr: viewMore }[VIEW] || viewHome)();
  mountFigs(main);
}

function mountFigs(root) {
  $$('.figslot', root).forEach(el => { if (!el.firstChild) el.appendChild(FIG.create(EX[el.dataset.ex])); });
}
const figSlot = (ex, cls = '') => `<div class="figslot ${cls}" data-ex="${ex}"></div>`;

// ---------- Onboarding ----------
function viewOnboarding() {
  const pick = p => {
    const def = p.id === 'pull' ? 1 : 2;
    return `<fieldset class="pick"><legend><b>${p.name}</b><span id="obx_${p.id}">${esc(EX[p.ladder[def - 1]].name)}</span></legend>
      <input type="hidden" name="lv_${p.id}" value="${def}"><div class="five">` +
      p.ladder.map((id, i) => `<button type="button" data-act="obLv" data-m="${p.id}" data-lv="${i + 1}" aria-pressed="${i + 1 === def}" aria-label="${p.name} Stufe ${i + 1}: ${esc(EX[id].name)}">${i + 1}</button>`).join('') +
      '</div></fieldset>';
  };
  return `<section class="hero">
    <span class="eyebrow accent">FITNESS · START</span>
    <h1>Kein Ziel­datum.<br><span class="accent glow">Nur nächste Woche.</span></h1>
    <p>Diese App zählt keine Tage in Folge. Sie zählt Wochen mit drei Einheiten, zeigt deine Stufen und den Trend.</p>
  </section>
  <form class="obform" id="onboard">
    <div class="card">
      <div class="grid2">
        <label class="field">Zielgewicht (kg)<input name="goal" inputmode="decimal" value="80"></label>
        <label class="field">Heute (optional)<input name="weight" inputmode="decimal" placeholder="z. B. 93,0"></label>
      </div>
      <div class="grid2" style="align-items:end;grid-template-columns:minmax(0,1fr) auto">
        <label class="field">Standardzeit<input name="time" type="time" value="05:00"></label>
        <label class="checkbox"><input type="checkbox" name="bar">Klimmzugstange</label>
      </div>
      <div class="divider"><h2>Startstufen</h2><p>Die Stufe, auf der du 8–12 saubere Wiederholungen schaffst. Im Zweifel die tiefere.</p></div>
      ${PATTERNS.map(pick).join('')}
    </div>
    <button class="btn primary big" type="submit">Los geht’s</button>
    <p class="center small muted">Alle Daten bleiben auf diesem Gerät.</p>
  </form>`;
}

// ---------- Heute ----------
function viewHome() {
  const today = ymd(), ws = weekStart(today), st = weekStats(ws), bi = blockInfo();
  const h = new Date().getHours();
  const hello = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  const goal = S.profile.weeklyGoal;
  const val = st.mini ? st.contacts : st.units;
  const frac = Math.min(1, val / goal);
  const ARC = Math.PI * 90;
  const ticks = [...Array(Math.max(0, goal - 1))].map((_, i) => {
    const a = Math.PI * (1 - (i + 1) / goal), c = Math.cos(a), s = Math.sin(a);
    return `<line class="tick" x1="${(110 + 90 * c).toFixed(1)}" y1="${(110 - 90 * s).toFixed(1)}" x2="${(110 + 78 * c).toFixed(1)}" y2="${(110 - 78 * s).toFixed(1)}"/>`;
  }).join('');
  const dayNames = [];
  const days = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), list = st.list.filter(s => s.date === d);
    const u = list.some(isUnit), m = list.some(s => s.type === 'mini');
    dayNames.push(`${DAYS[i]} ${u ? 'Einheit' : m ? 'Mini' : 'leer'}`);
    return `<div class="${d === today ? 'today' : ''}"><span>${DAYS[i]}</span><i class="mk ${u ? 'u' : m ? 'm' : ''}"></i></div>`;
  }).join('');
  const ban = banners().map(b => `<section class="banner ${b.cls}">${b.cls === 'warn' ? ICON.warn : ICON.info}<div class="btxt"><b>${esc(b.t)}</b><span>${esc(b.d)}</span></div>` +
    (b.btn ? `<div class="bbtns">${b.btn2 ? `<button class="btn sm ghost" data-act="${b.act2}">${b.btn2}</button>` : ''}<button class="btn sm" data-act="${b.act}">${b.btn}</button></div>` : '') + '</section>').join('');
  const ser = weightSeries(), lastW = ser[ser.length - 1], t = trend(ser);
  const todayW = S.weights.find(w => w.date === today);
  const levels = PATTERNS.map(p => {
    const lv = effLevel(p.id), ex = exFor(p.id, lv);
    return `<button class="lvrow" data-go="uebungen" data-to="lad-${p.id}" aria-label="${p.name}, Stufe ${lv} von 5: ${esc(EX[ex].name)}"><span class="lvtop"><span><b>${p.name}</b> <span class="muted">${esc(EX[ex].name)}</span></span><span class="mono">S${lv}</span></span>${seg5(lv)}</button>`;
  }).join('');
  const minutes = S.profile.rounds === 3 ? 25 : 20;
  const dIn = Math.max(0, diffDays(S.profile.start, today)) % 42, wNow = Math.floor(dIn / 7) + 1;
  const bar = [1, 2, 3, 4, 5, 6].map(n => `<div class="${n < wNow ? 'done' : ''} ${n === wNow ? 'cur' : ''} ${n === 6 ? 'test' : ''}"${n === wNow ? ` style="--p:${Math.round((dIn % 7 + 1) / 7 * 100)}%"` : ''}><i></i><span>${n === 6 ? 'TEST' : 'W' + n}</span></div>`).join('');
  const now = new Date();
  return `<header class="top"><div class="stack"><p class="eyebrow">${DAYS[(now.getDay() + 6) % 7]} ${pad(now.getDate())}.${pad(now.getMonth() + 1)}. · ${pad(now.getHours())}:${pad(now.getMinutes())}</p><h1>${hello}</h1></div>
    <div class="blockno"><span>BLOCK <b>${pad(bi.block)}</b></span><span>WOCHE <b>${bi.week}/6</b></span></div></header>
  <section class="blockbar" role="img" aria-label="Block ${bi.block}, Woche ${bi.week} von 6, Woche 6 ist Testwoche">${bar}</section>
  <section class="card">
    <div class="chead"><h2>Wochenziel</h2><span class="meta ${st.ok ? 'accent' : ''}">${st.ok ? 'erfüllt' : `noch ${Math.max(0, goal - val)}`}</span></div>
    <div class="gauge"><svg viewBox="0 0 220 120" fill="none" role="img" aria-label="Wochenziel: ${val} von ${goal} ${st.mini ? 'Kontakten' : 'Einheiten'}">
      <defs><linearGradient id="gArc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>
      <path class="trk" d="M20 110 A90 90 0 0 1 200 110" stroke-width="14" stroke-linecap="round"/>
      <path class="arc" d="M20 110 A90 90 0 0 1 200 110" stroke="url(#gArc)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(ARC * frac).toFixed(1)} 400" ${frac ? '' : 'visibility="hidden"'}/>${ticks}</svg>
      <div class="gaugetxt"><b>${val}<span>/${goal}</span></b><small>${st.mini ? 'KONTAKTE · MINI-WOCHE' : 'EINHEITEN'}</small></div></div>
    <div class="days" role="img" aria-label="Diese Woche: ${dayNames.join(', ')}">${days}</div>
  </section>
  ${ban}
  <div class="grid2">
    <section class="card wcard"><h2>Gewicht · Ø 7 T</h2>
      ${lastW ? `<span class="wbig">${fmt1(lastW.ma)}<small> kg</small></span>${spark(ser)}<span class="trendtxt ${trendCls(t)}">${t === null ? 'Trend ab 2 Wochen' : `${t > 0 ? '+' : '−'}${fmt1(Math.abs(t))} kg/Woche`}</span>`
        : '<span class="small muted">Morgens nach dem Aufstehen wiegen. Gewertet wird nur der 7-Tage-Mittelwert.</span>'}
    </section>
    <form class="card wform" id="wform"><h2>Heute wiegen</h2><label for="kgIn">kg, nüchtern</label>
      <input id="kgIn" name="kg" inputmode="decimal" placeholder="${todayW ? fmt1(todayW.kg) : '00,0'}"><button class="btn sm" type="submit">${todayW ? 'Ändern' : 'Speichern'}</button></form>
  </div>
  <button class="btn primary big split" data-act="start">Training starten <span>~${minutes} MIN</span></button>
  <div class="grid2">
    <button class="btn sec split" data-act="mini">Mini <span>5 MIN</span></button>
    <button class="btn sec split" data-act="badminton">Badminton <span>+1</span></button>
  </div>
  <p class="slot">Standard ${esc(S.profile.startTime)} · Nachmittag zählt voll · nach 23 Uhr ins Bett → Nachmittag · <button class="link" data-act="later">Nachtragen</button></p>
  <section class="card"><h2>Stufen · 1–5</h2><div class="lvlist">${levels}</div></section>`;
}

const DAYS = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];
const ICON = {
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4M12 17v.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4M5 20h14"/></svg>',
};
const seg5 = lv => `<span class="seg5" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span>`;
const trendCls = t => t === null ? 'muted' : t < -0.7 ? 'warn' : t < -0.1 ? 'good' : 'muted';

function spark(ser) {
  const from = addDays(ser[ser.length - 1].date, -55), pts = ser.filter(p => p.date >= from);
  if (pts.length < 2) return '';
  const span = Math.max(1, diffDays(pts[0].date, pts[pts.length - 1].date));
  const lo = Math.min(...pts.map(p => p.ma)), hi = Math.max(...pts.map(p => p.ma)), r = Math.max(0.5, hi - lo);
  const xy = pts.map(p => [diffDays(pts[0].date, p.date) / span * 140, 6 + (hi - p.ma) / r * 26]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), [ex, ey] = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 140 40" role="img" aria-label="7-Tage-Mittel von ${fmt1(pts[0].ma)} auf ${fmt1(pts[pts.length - 1].ma)} kg">
    <defs><linearGradient id="gSpark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="areastop" stop-opacity=".35"/><stop offset="1" class="areastop" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${line} 140,40 0,40" fill="url(#gSpark)"/><polyline class="ln" points="${line}"/><circle class="end" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3"/></svg>`;
}

// ---------- Verlauf ----------
function weightSeries() {
  const w = [...S.weights].sort((a, b) => a.date < b.date ? -1 : 1);
  return w.map(p => {
    const from = addDays(p.date, -6), win = w.filter(q => q.date >= from && q.date <= p.date);
    return { date: p.date, kg: p.kg, ma: avg(win.map(q => q.kg)) };
  });
}
function trend(ser) {
  if (ser.length < 5) return null;
  const end = ser[ser.length - 1].date, from = addDays(end, -21);
  const pts = ser.filter(p => p.date >= from);
  if (pts.length < 5 || diffDays(pts[0].date, end) < 10) return null;
  const xs = pts.map(p => diffDays(from, p.date)), ys = pts.map(p => p.ma), mx = avg(xs), my = avg(ys);
  let n = 0, d = 0; xs.forEach((x, i) => { n += (x - mx) * (ys[i] - my); d += (x - mx) ** 2; });
  return d ? n / d * 7 : null;
}
function niceTicks(lo, hi, max = 4) {
  const step = [0.5, 1, 2, 5, 10, 20].find(s => (hi - lo) / s <= max) || 50;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(2));
  return out;
}

const CH = {};
function chart(id, W, H, body, pts, top, bottom, label) {
  CH[id] = { W, H, pts };
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${esc(label)}">${body}
    <line class="xhair" x1="0" x2="0" y1="${top}" y2="${bottom}" visibility="hidden"/><circle class="hl" r="4.5" visibility="hidden"/></svg><div class="tip" hidden></div></div>`;
}

function weightChart(ser) {
  if (ser.length < 2) return '<p class="muted small">Ab zwei Messungen erscheint hier der Verlauf.</p>';
  const W = 330, H = 180, L = 30, R = 8, T = 10, B = 20;
  const d0 = ser[0].date, d1 = ser[ser.length - 1].date, span = Math.max(1, diffDays(d0, d1));
  let lo = Math.min(...ser.map(p => Math.min(p.kg, p.ma))), hi = Math.max(...ser.map(p => Math.max(p.kg, p.ma)));
  const goal = S.profile.goalWeight;
  if (goal && goal < lo && goal >= lo - 3) lo = goal;
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const x = d => L + diffDays(d0, d) / span * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B), base = H - B;
  let s = niceTicks(lo, hi).map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="0" y="${y(v) + 3.5}">${v}</text>`).join('');
  if (goal >= lo && goal <= hi) s += `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="ax" x="${W - R}" y="${y(goal) - 4}" text-anchor="end">ZIEL</text>`;
  const dm = addDays(d0, Math.round(span / 2));
  s += `<text class="ax" x="${L}" y="${H - 4}">${fmtShort(d0)}</text>` + (span >= 14 ? `<text class="ax" x="${x(dm)}" y="${H - 4}" text-anchor="middle">${fmtShort(dm)}</text>` : '') + `<text class="ax" x="${W - R}" y="${H - 4}" text-anchor="end">${fmtShort(d1)}</text>`;
  const line = ser.map(p => `${x(p.date).toFixed(1)},${y(p.ma).toFixed(1)}`).join(' ');
  s += `<defs><linearGradient id="gWArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="areastop" stop-opacity=".3"/><stop offset="1" class="areastop" stop-opacity="0"/></linearGradient></defs>`;
  s += `<polygon points="${line} ${x(d1).toFixed(1)},${base} ${L},${base}" fill="url(#gWArea)"/>`;
  s += `<path class="dots" d="${ser.map(p => `M${x(p.date).toFixed(1)} ${y(p.kg).toFixed(1)}h0`).join('')}"/>`;
  s += `<polyline class="line" points="${line}"/>`;
  const first = ser[0], last = ser[ser.length - 1];
  s += `<circle class="end" cx="${x(last.date).toFixed(1)}" cy="${y(last.ma).toFixed(1)}" r="4"/>`;
  const pts = ser.map(p => ({ cx: x(p.date), cy: y(p.ma), html: `<b>${fmtDate(p.date)}</b><br>Mittel ${fmt1(p.ma)} kg<br><span class="muted">gewogen ${fmt1(p.kg)} kg</span>` }));
  const dir = last.ma < first.ma - 0.05 ? 'fällt' : last.ma > first.ma + 0.05 ? 'steigt' : 'bleibt';
  return chart('weight', W, H, s, pts, T, base, `7-Tage-Mittel ${dir} von ${fmt1(first.ma)} auf ${fmt1(last.ma)} kg`);
}

function trendText(t) {
  if (t === null) return 'Trend ab ca. 2 Wochen Messungen.';
  const v = `${t > 0 ? '+' : '−'}${fmt1(Math.abs(t))} kg/Woche`;
  if (t < -0.7) return `${v}: schneller als geplant. Etwas mehr essen und aufs Protein achten, sonst geht Muskulatur mit.`;
  if (t <= -0.3) return `${v}: im Zielkorridor.`;
  if (t < -0.1) return `${v}: langsam – in Ordnung, solange die Taille kleiner wird.`;
  return `${v}: Trend steht. Hält das 3 Wochen an, etwas weniger essen.`;
}

function weekTiles(n) {
  const cur = weekStart(ymd()), startWs = weekStart(S.profile.start);
  const count = Math.min(n || Infinity, Math.floor(diffDays(startWs, cur) / 7) + 1);
  const weeks = [...Array(count)].map((_, i) => weekStats(addDays(cur, -7 * (count - 1 - i))));
  return `<ul class="tiles">${weeks.map(w => {
    const v = w.mini ? w.contacts : w.units, kw = isoWeek(w.ws);
    const cls = w.ws === cur ? 'cur' : w.full ? 'ok' : w.ok ? 'mini' : 'no';
    const state = { cur: 'läuft', ok: 'erfüllt', mini: 'Mini-Woche erfüllt', no: 'darunter' }[cls];
    const detail = `${w.units} Einheiten${w.contacts > w.units ? `, ${w.contacts - w.units} Mini` : ''}`;
    return `<li class="tile ${cls}" aria-label="KW ${kw}: ${detail}, ${state}" title="KW ${kw}: ${detail} · ${state}"><b>${v}</b><small>KW${kw}</small></li>`;
  }).join('')}</ul>`;
}

function weekQuota(lastN) {
  const cur = weekStart(ymd()), startWs = weekStart(S.profile.start);
  let ok = 0, tot = 0;
  for (let ws = addDays(cur, -7); ws >= startWs && tot < lastN; ws = addDays(ws, -7)) { tot++; if (weekStats(ws).full) ok++; }
  return { ok, tot };
}

function perfSeries(m) {
  return S.sessions.filter(s => s.type === 'training' && (s.sets || []).some(x => x.m === m && !x.warm)).map(s => {
    const ws = s.sets.filter(x => x.m === m && !x.warm), lv = Math.max(...ws.map(x => x.level));
    const top = ws.filter(x => x.level === lv), best = Math.max(...top.map(x => x.v)), ex = top[0].ex, r = range(ex);
    return { date: s.date, idx: lv + Math.max(-0.5, Math.min(1, (best - r.lo) / (r.hi - r.lo))) * 0.9, lv, best, ex };
  });
}
function perfRow(p) {
  const all = perfSeries(p.id), ser = all.slice(-10), off = all.length - ser.length;
  const bars = ser.map((q, i) => {
    const share = Math.max(0, Math.min(1, q.best / range(q.ex).hi));
    const prev = all[off + i - 1], up = prev && q.lv > prev.lv;
    return `<i class="${up ? 'up' : ''}" style="height:${Math.round(6 + share * 30)}px" title="${fmtShort(q.date)} · S${q.lv} · ${q.best} ${unitLabel(q.ex)}${up ? ' · Aufstieg' : ''}"></i>`;
  });
  while (bars.length < 10) bars.unshift('<i class="empty"></i>');
  const a = all[off - 1] || ser[0], b = ser[ser.length - 1];
  const tr = !b ? 'keine Daten' : a.lv === b.lv ? 'konstant' : `${a.lv} → ${b.lv}`;
  const label = b ? `${p.name}: letzte ${ser.length} Einheiten, Stufe ${tr === 'konstant' ? `konstant ${b.lv}` : tr}, zuletzt ${b.best} ${unitLabel(b.ex)}` : `${p.name}: noch keine Daten`;
  return `<div class="perfrow"><span class="pn"><b>${p.name}</b><small>${tr}</small></span><span class="pbars" role="img" aria-label="${esc(label)}">${bars.join('')}</span><span class="plv">S${effLevel(p.id)}</span></div>`;
}

function testsTable() {
  if (!S.tests.length) return '<p class="muted small">Noch kein Test eingetragen.</p>';
  const a = S.tests[0], b = S.tests[S.tests.length - 1], one = S.tests.length === 1;
  const cell = (t, v, st) => v === null || v === undefined ? '–' : `${fmtNum(v)}${t.id === 'push' && st ? ` <small class="muted">S${st}</small>` : ''}`;
  const rows = TESTS.map(t => {
    const va = a.v[t.id], vb = b.v[t.id];
    let delta = '';
    if (!one && va != null && vb != null) {
      if (t.id === 'push' && a.pushStage !== b.pushStage) delta = b.pushStage > a.pushStage ? '<span class="good">▲ S</span>' : '<span class="bad">▼ S</span>';
      else { const d = vb - va, good = d * t.better > 0; delta = d === 0 ? '<span class="muted">±0</span>' : `<span class="${good ? 'good' : 'bad'}">${good ? '▲' : '▼'} ${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}</span>`; }
    }
    return `<tr><th scope="row">${esc(t.label)} <small class="muted">${t.unit}</small></th><td>${cell(t, va, a.pushStage)}</td>${one ? '' : `<td>${cell(t, vb, b.pushStage)}</td><td>${delta}</td>`}</tr>`;
  }).join('');
  const colB = b.block ? `B${b.block}` : fmtShort(b.date);
  return `<div class="tablewrap"><table class="tests"><thead><tr><th scope="col">TEST</th><th scope="col" title="${fmtShort(a.date)}">START</th>${one ? '' : `<th scope="col" title="${fmtShort(b.date)}">${colB}</th><th scope="col">Δ</th>`}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">${S.tests.length} Test${S.tests.length === 1 ? '' : 's'} · ▲ = besser, ▼ = schlechter (bei Umfang und Puls ist weniger besser).</p>`;
}
const fmtNum = v => Number.isInteger(v) ? String(v) : fmt1(v);

let RANGE = 12; // Zeitraum im Verlauf: 12, 52 oder 0 (alle)

function viewHistory() {
  const all = weightSeries(), t = trend(all);
  const ser = RANGE ? all.filter(p => p.date >= addDays(ymd(), -7 * RANGE)) : all;
  const lastW = all[all.length - 1];
  const q12 = weekQuota(12), qAll = weekQuota(52);
  const together = S.sessions.filter(s => s.together).length;
  const list = [...S.sessions].reverse().slice(0, 25).map(s => {
    const icon = { training: 'Training', mini: 'Mini', badminton: 'Badminton' }[s.type];
    const sum = (s.sets || []).filter(x => !x.warm).length
      ? PATTERNS.map(p => { const v = s.sets.filter(x => x.m === p.id && !x.warm); return v.length ? `${p.name[0]}${v[0].level}: ${v.map(x => x.v).join('/')}${EX[v[0].ex].unit === 'sec' ? ' s' : ''}` : ''; }).filter(Boolean).join(' · ')
      : s.type === 'badminton' ? 'zählt fürs Wochenziel' : s.type === 'mini' ? 'Kontakt' : '';
    return `<li><i class="sd ${s.type}" aria-hidden="true"></i><span class="st"><span><b class="mono">${fmtShort(s.date)}</b> · ${icon}${s.together ? '<span class="chip">gemeinsam</span>' : ''}${s.late ? ' <span class="muted small">(nachgetragen)</span>' : ''}</span><small>${esc(sum)}${s.note ? ` · ${esc(s.note)}` : ''}</small></span><button class="x" data-act="delSession" data-id="${s.id}" aria-label="Eintrag vom ${fmtShort(s.date)} löschen">×</button></li>`;
  }).join('');
  const wl = [...S.weights].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 30).map(w =>
    `<li><span>${fmtDate(w.date)}</span><span class="mono">${fmt1(w.kg)} kg</span><button class="x" data-act="delWeight" data-date="${w.date}" aria-label="Messung vom ${fmtShort(w.date)} löschen">×</button></li>`).join('');
  const goal = S.profile.weeklyGoal, gw = S.profile.goalWeight;
  const rng = [[12, '12 W'], [52, '52 W'], [0, 'Alle']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${RANGE === v}" data-act="range" data-v="${v}">${l}</button>`).join('');
  return `<header class="top"><h1>Verlauf</h1><div class="seg" role="radiogroup" aria-label="Zeitraum">${rng}</div></header>
  <section class="card"><div class="chead"><h2>Gewicht · Ø 7 Tage</h2>${gw ? `<span class="meta">Ziel ${fmtNum(gw)} kg</span>` : ''}</div>
    ${lastW ? `<div class="wsum"><span class="wval">${fmt1(lastW.ma)}</span><span class="mono muted">kg</span>${t !== null ? `<span class="pill ${trendCls(t) === 'good' ? 'good' : ''} ${trendCls(t)}">${t > 0 ? '+' : '−'}${fmt1(Math.abs(t))} kg/Wo</span>` : ''}</div>` : ''}
    ${weightChart(ser)}
    <p class="small text2">${trendText(t)}</p>
    ${wl ? `<details class="mess"><summary>Messungen</summary><ul class="plain">${wl}</ul></details>` : ''}</section>
  <section class="card"><h2>Wochen mit ≥ ${goal} Einheiten</h2>
    <div class="stats"><div><b>${q12.ok}<span>/${q12.tot}</span></b><small>letzte 12 Wo</small></div><div><b>${qAll.ok}<span>/${qAll.tot}</span></b><small>letzte 52 Wo</small></div><div><b>${together}</b><small>gemeinsam</small></div></div>
    ${weekTiles(RANGE)}
    <div class="legend"><span><i class="ok"></i>erfüllt</span><span><i class="mini"></i>Mini-Woche</span><span><i class="no"></i>darunter</span><span><i class="cur"></i>laufend</span></div></section>
  <section class="card"><div class="chead"><h2>Leistung</h2><small class="muted">Balken = Anteil am Zielbereich</small></div>${PATTERNS.map(perfRow).join('')}
    <p class="small muted">Heller Balken = Stufenaufstieg in dieser Einheit.</p></section>
  <section class="card"><h2>Tests</h2>${testsTable()}<button class="btn sm" data-act="test" style="align-self:flex-start">Test eintragen</button></section>
  <section class="card" style="padding-bottom:6px;gap:6px"><h2>Einheiten</h2>${list ? `<ul class="sessions">${list}</ul>` : '<p class="muted small">Noch keine Einheit.</p>'}</section>`;
}

// ---------- Übungen ----------
const cueList = (e, cls = 'dash') => `<ul class="${cls}">${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`;
function targetText(id) {
  const r = range(id), e = EX[id];
  return `ZIEL ${r.lo}–${r.hi} ${e.unit === 'sec' ? 'S' : 'WDH.'}${e.perSide ? ' JE SEITE' : ''}${e.needsBar ? ' · STANGE' : ''}`;
}
function viewExercises() {
  const ladders = PATTERNS.map(p => {
    const cur = effLevel(p.id);
    const steps = p.ladder.map((id, i) => {
      const lv = i + 1, e = EX[id], st = lv < cur ? 'done' : lv === cur ? 'cur' : '';
      return `<li class="${st}"><div class="rail"><span class="dot" aria-hidden="true">${lv}</span><span class="line"></span></div>
        <div class="body"><details ${lv === cur ? 'open' : ''}><summary><span class="nm">${esc(e.name)}</span><small>STUFE ${lv} · ${targetText(id)}</small></summary>
          <div class="curbox"><div class="figbox">${figSlot(id)}</div>${cueList(e)}</div></details>
          ${lv === cur ? '' : `<button class="link" data-act="setLevel" data-m="${p.id}" data-lv="${lv}" style="align-self:flex-start">Als aktuelle Stufe setzen</button>`}</div></li>`;
    }).join('');
    const lock = p.ladder.some(id => EX[id].needsBar) && !S.profile.hasBar
      ? `<p class="lock">${ICON.lock}Stufe ${p.ladder.findIndex(id => EX[id].needsBar) + 1}–5 brauchen eine Klimmzugstange.</p>` : '';
    return `<section class="card ladder" id="lad-${p.id}"><div class="chead"><h2>${p.name} · Leiter</h2><span class="meta accent">AKTUELL S${cur}</span></div><ol>${steps}</ol>${lock}</section>`;
  }).join('');
  const list = (items, id, title, min) => `<details class="card" id="${id}"><summary><h2>${title}</h2><span class="meta">${items.length} ÜBUNGEN · ${min} MIN</span></summary>` +
    items.map(it => `<div class="exrow"><div class="figbox">${figSlot(it.ex)}</div><div class="body" style="display:flex;flex-direction:column;gap:4px"><h3>${esc(EX[it.ex].name)}</h3><small class="mono muted">${it.sec} S${it.note ? ` · ${esc(it.note).toUpperCase()}` : ''}</small>${cueList(EX[it.ex])}</div></div>`).join('') + '</details>';
  const chips = [['sec-warm', 'Aufwärmen'], ...PATTERNS.map(p => [`lad-${p.id}`, `${p.name} · ${effLevel(p.id)}`]), ['sec-cool', 'Dehnen']]
    .map(([to, l]) => `<button type="button" data-act="jump" data-to="${to}">${l}</button>`).join('');
  return `<header class="top"><div class="stack"><h1>Übungen</h1><p class="text2">Alle Arbeitssätze am oberen Ende des Zielbereichs → nächste Einheit eine Stufe höher. Unter dem Mindestwert → eine Stufe zurück.</p></div></header>
    <nav class="chips" aria-label="Abschnitte">${chips}</nav>
    ${list(WARMUP, 'sec-warm', 'Aufwärmen', 4)}${ladders}${list(COOLDOWN, 'sec-cool', 'Dehnen', 3)}`;
}

// ---------- Mehr ----------
function viewMore() {
  const p = S.profile;
  const rules = [
    ['Kein Ende.', '6-Wochen-Blöcke mit Re-Test, danach automatisch der nächste.'],
    ['Standardzeit + Ersatz.', `${esc(p.startTime)} Uhr; Nachmittag zählt voll. Nach 23 Uhr ins Bett → Nachmittag.`],
    ['Wochenziel statt Tageskette.', `${p.weeklyGoal} Einheiten. Badminton zählt.`],
    ['Mini (5 min)', 'zählt als Kontakt. Matte ausgerollt = Tag gewertet.'],
    ['Nie zweimal auslassen.', 'Nach 7 Tagen Pause eine Stufe tiefer, nicht bei null.'],
    ['Zwei schwache Wochen', '→ Mini-Woche. Normaler Zustand, kein Scheitern.'],
    ['Sichtbar:', 'Stufen, Trend, gemeinsame Einheiten. Kein Streak.'],
  ].map(([b, t], i) => `<li><span>${pad(i + 1)}</span><span><b>${b}</b> <span>${t}</span></span></li>`).join('');
  const rounds = [[2, '2 · 20 MIN'], [3, '3 · 25 MIN']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${p.rounds === v}" data-act="rounds" data-v="${v}">${l}</button>`).join('');
  return `<header class="top"><h1>Mehr</h1></header>
  <section class="card setlist"><h2>Einstellungen</h2>
    <label class="setrow">Zielgewicht<span class="unit"><input data-set="goalWeight" inputmode="decimal" value="${p.goalWeight ?? ''}">kg</span></label>
    <label class="setrow">Standardzeit<input data-set="startTime" type="time" value="${esc(p.startTime)}"></label>
    <div class="setrow"><span id="roundsL">Arbeitsrunden</span><div class="seg solid" role="radiogroup" aria-labelledby="roundsL">${rounds}</div></div>
    <label class="setrow">Klimmzugstange vorhanden<input type="checkbox" class="switch" role="switch" data-set="hasBar" ${p.hasBar ? 'checked' : ''}></label>
    <label class="setrow" style="border-bottom:0">Signaltöne<input type="checkbox" class="switch" role="switch" data-set="sound" ${p.sound ? 'checked' : ''}></label>
    <p class="hint">Töne mischen sich mit Spotify und sind bei stummgeschaltetem iPhone aus. Unterbricht Spotify trotzdem, Signaltöne ausschalten – die Anzeige blinkt zusätzlich.</p>
  </section>
  <section class="card"><div class="chead"><h2>Daten</h2><span class="meta">LOKAL · ${S.lastExport ? `EXPORT ${fmtShort(S.lastExport)}` : 'NOCH KEIN EXPORT'}</span></div>
    <p class="small text2">Alles liegt nur auf diesem Gerät. Nichts wird hochgeladen.</p>
    <div class="grid2"><button class="btn" data-act="export">${ICON.down}Exportieren</button><label class="btn">${ICON.up}Importieren<input type="file" accept="application/json,.json" id="importFile" hidden></label></div>
  </section>
  <section class="card"><h2>Die Regeln</h2><ol class="rules">${rules}</ol></section>
  <section class="card"><h2>Ernährung · zwei Stellgrößen</h2><div class="grid2" style="gap:10px">
    <div class="kpi"><small>Defizit über Trend</small><b>−0,3…−0,6</b><small class="mono">KG/WOCHE</small></div>
    <div class="kpi"><small>Protein · 1,6 g/kg Ziel</small><b class="accent">${p.goalWeight ? Math.round(p.goalWeight * 1.6) + ' g' : '–'}</b><small class="mono">PRO TAG</small></div></div></section>
  <section class="dangercard"><div><b>Zurücksetzen</b><small>Löscht alle Daten. Vorher exportieren.</small></div><button class="btn danger sm" data-act="reset">Alle Daten löschen</button></section>
  <p class="foot">FITNESS · DATEN LOKAL · V2</p>`;
}

// ---------- Dialoge ----------
function openDialog(html, onSubmit) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog">${html}</form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', e => {
    const btn = e.submitter;
    if (btn && btn.value === 'cancel') return;
    e.preventDefault();
    if (onSubmit(new FormData(form)) !== false) dlg.close();
  });
  dlg.showModal();
}

const sheetHead = (kicker, title) => `<span class="grip" aria-hidden="true"></span>
  <div class="shead"><div><small>${kicker}</small><h2 id="dlgT">${title}</h2></div><button type="button" class="x box" data-act="closeDlg" aria-label="Schließen">×</button></div>`;
const sheetBtns = ok => `<div class="runbtns"><button type="button" class="btn ghost" data-act="closeDlg">Abbrechen</button><button class="btn primary" value="ok">${ok}</button></div>`;

function dlgTest() {
  const lv = effLevel('push'), prev = S.tests[S.tests.length - 1], bi = blockInfo();
  const fields = TESTS.map(t => {
    const last = prev && prev.v[t.id] != null ? fmtNum(prev.v[t.id]) : '–';
    return `<div class="frow"><label for="t_${t.id}"><span>${esc(t.label)}${t.optional ? ' <span>· optional</span>' : ''}</span><small>${esc(t.how)}</small></label>
      <span class="unitin"><input id="t_${t.id}" name="${t.id}" inputmode="decimal" placeholder="${last}"><small>${esc(t.unit.toUpperCase())}</small></span></div>` +
      (t.id === 'push' ? `<label class="field">Liegestütz-Stufe<select name="pushStage">${PATTERNS[0].ladder.map((id, i) => `<option value="${i + 1}" ${i + 1 === lv ? 'selected' : ''}>${i + 1} · ${esc(EX[id].name)}</option>`).join('')}</select></label>` : '');
  }).join('');
  openDialog(sheetHead(S.tests.length ? `BLOCK ${bi.block} · WOCHE ${bi.week}` : 'WOCHE 0', S.tests.length ? 'Re-Test eintragen' : 'Woche-0-Test eintragen') +
    `<p class="intro">Nach dem Aufwärmen, immer zur gleichen Tageszeit. Leere Felder werden übersprungen.</p>${fields}
    ${prev ? '<p class="note">Grau im Feld: Wert vom letzten Test.</p>' : ''}${sheetBtns('Speichern')}`, fd => {
    const v = {}; TESTS.forEach(t => { v[t.id] = num(fd.get(t.id)); });
    if (Object.values(v).every(x => x === null)) { toast('Keine Werte eingetragen'); return false; }
    S.tests.push({ date: ymd(), block: S.tests.length ? blockInfo().block : 0, v, pushStage: +fd.get('pushStage') });
    save(); render(); toast('Test gespeichert');
  });
}

function dlgLater() {
  openDialog(sheetHead('NACHTRAGEN', 'Einheit nachtragen') + `
    <div class="frow wide"><label for="lt"><span>Art</span><small>Training ohne Sätze</small></label><select id="lt" name="type"><option value="training">Training</option><option value="mini">Mini</option><option value="badminton">Badminton</option></select></div>
    <div class="frow wide"><label for="ld"><span>Datum</span></label><input id="ld" type="date" name="date" value="${addDays(ymd(), -1)}" max="${ymd()}"></div>
    <label class="frow wide" style="cursor:pointer"><span style="font-size:14px;font-weight:600">Gemeinsam</span><input type="checkbox" class="switch" role="switch" name="together" style="justify-self:end"></label>
    ${sheetBtns('Eintragen')}`, fd => {
    const date = fd.get('date');
    if (!date) return false;
    S.sessions.push({ id: uid(), type: fd.get('type'), date, ts: Date.now(), sets: [], together: !!fd.get('together'), late: true });
    sortSessions(); save(); render(); toast('Nachgetragen');
  });
}

// ---------- Export / Import ----------
async function doExport() {
  const name = `fitness-backup-${ymd()}.json`;
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    S.lastExport = ymd(); save(); render(); toast('Export erstellt');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Export fehlgeschlagen'); }
}
function doImport(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || d.version !== 1 || !d.profile || !Array.isArray(d.sessions)) throw new Error();
      if (!confirm('Import ersetzt alle Daten auf diesem Gerät. Fortfahren?')) return;
      S = d; save(); render(); toast('Import abgeschlossen');
    } catch { toast('Datei ist kein gültiges Backup'); }
  };
  rd.readAsText(file);
}

// ---------- Einheit (Vollbild) ----------
let RUN = null, RUN_INT = 0;

function buildSteps(kind) {
  const steps = [];
  const timed = (list, phase) => list.forEach(it => steps.push({ k: 'timed', ex: it.ex, sec: it.sec, note: it.note, phase }));
  if (kind === 'mini') {
    timed(MINI_MOB, 'Beweglichkeit');
    PATTERNS.forEach((p, i) => {
      steps.push({ k: 'set', m: p.id, level: effLevel(p.id), mini: true, phase: 'Ein Satz je Muster' });
      if (i < PATTERNS.length - 1) steps.push({ k: 'rest', sec: 15, phase: 'Wechsel' });
    });
  } else {
    const rounds = S.profile.rounds;
    timed(WARMUP, 'Aufwärmen');
    for (let r = 0; r <= rounds; r++) {
      PATTERNS.forEach((p, i) => {
        const lv = r === 0 ? Math.max(1, effLevel(p.id) - 1) : effLevel(p.id);
        steps.push({ k: 'set', m: p.id, level: lv, warm: r === 0, phase: r === 0 ? 'Aufwärmrunde' : `Runde ${r} von ${rounds}` });
        const lastInRound = i === PATTERNS.length - 1;
        if (!(r === rounds && lastInRound)) steps.push({ k: 'rest', sec: lastInRound ? 60 : 20, phase: 'Pause' });
      });
    }
    timed(COOLDOWN, 'Dehnen');
  }
  steps.push({ k: 'summary', phase: 'Abschluss' });
  return steps;
}

function startRun(kind) {
  audioInit(); wakeOn();
  RUN = { kind, steps: buildSteps(kind), i: 0, sets: [], start: Date.now(), timer: null, sw: null, val: 0 };
  $('#run').hidden = false; document.body.classList.add('running');
  renderStep();
  clearInterval(EL_INT); EL_INT = setInterval(() => { const e = $('#elapsed'); if (e && RUN) e.textContent = mmss((Date.now() - RUN.start) / 1000); }, 1000);
}
let EL_INT = 0;
function stopRun() {
  clearInterval(RUN_INT); clearInterval(EL_INT); RUN = null; wakeOff();
  $('#run').hidden = true; $('#run').innerHTML = ''; document.body.classList.remove('running');
  render();
}
function nextStep() { if (!RUN) return; clearInterval(RUN_INT); RUN.timer = null; RUN.sw = null; RUN.i++; renderStep(); }

function setTimer(sec) { RUN.timer = { end: Date.now() + sec * 1000, paused: null, last: Math.ceil(sec) }; clearInterval(RUN_INT); RUN_INT = setInterval(runTick, 200); runTick(); }

function runTick() {
  if (!RUN) return;
  const out = $('#clock');
  if (RUN.timer) {
    const t = RUN.timer;
    const left = t.paused !== null ? t.paused : Math.max(0, (t.end - Date.now()) / 1000);
    const c = Math.ceil(left);
    if (out) out.textContent = mmss(c);
    const bar = $('#tbar'); if (bar && RUN.timer.total) bar.style.width = `${(1 - left / RUN.timer.total) * 100}%`;
    const ring = $('#tring'); if (ring && RUN.timer.total) { ring.style.strokeDasharray = `${(RING * left / RUN.timer.total).toFixed(1)} ${RING}`; $('#tof').textContent = `VON ${mmss(RUN.timer.total)}`; }
    if (t.paused === null && c !== t.last) {
      t.last = c;
      if (c <= 3 && c > 0) beep(660, 0.08, 0.18);
    }
    if (t.half && !t.halfDone && t.paused === null && left <= t.half) { t.halfDone = true; beep(880, 0.2, 0.25); flash(); }
    if (t.paused === null && left <= 0) { beep(990, 0.35, 0.3); flash(); nextStep(); }
  } else if (RUN.sw && RUN.sw.running) {
    const s = Math.floor((Date.now() - RUN.sw.start) / 1000);
    if (s !== RUN.val) {
      RUN.val = s; if (out) out.textContent = mmss(s); setMark();
      const st = RUN.steps[RUN.i], r = range(exFor(st.m, st.level));
      if (s === r.hi) { beep(990, 0.25, 0.3); flash(); }
    }
  }
}

// Fortschritt innerhalb der Phase: Aufwärmen/Dehnen je Übung, Sätze über alle Runden
const stepKey = s => s.k === 'set' || s.k === 'rest' ? 'sets' : s.k === 'timed' ? s.phase : 'end';
const setPhase = s => s.warm ? 'AUFWÄRMRUNDE' : s.mini ? 'MINI' : s.phase.replace(/Runde (\d+) von (\d+)/, 'RUNDE $1/$2').toUpperCase();

function runHeader(st) {
  const k = stepKey(st), idx = RUN.steps.map((s, j) => j).filter(j => stepKey(RUN.steps[j]) === k && RUN.steps[j].k !== 'rest');
  let label;
  if (st.k === 'timed') label = `${st.phase} · ${idx.indexOf(RUN.i) + 1}/${idx.length}`;
  else if (st.k === 'set') label = `${setPhase(st)} · SATZ ${PATTERNS.findIndex(p => p.id === st.m) + 1}/${PATTERNS.length}`;
  else if (st.k === 'rest') { const pv = RUN.steps.slice(0, RUN.i).reverse().find(s => s.k === 'set'); label = `${pv ? setPhase(pv) : ''} · ${RUN.kind === 'mini' ? 'WECHSEL' : 'PAUSE'}`; }
  else label = 'ABSCHLUSS';
  const segs = st.k === 'summary' ? '' : `<div class="steps" style="grid-template-columns:repeat(${idx.length},minmax(0,1fr))" aria-hidden="true">${idx.map(j => `<i class="${j < RUN.i ? 'done' : j === RUN.i ? 'cur' : ''}"></i>`).join('')}</div>`;
  return `<div class="runhead"><button class="x box" data-act="abort" aria-label="Einheit abbrechen">×</button><div><small>${esc(label)}</small>${segs}</div><span class="el" id="elapsed">${mmss((Date.now() - RUN.start) / 1000)}</span></div>`;
}

function scaleMax(hi) { return [10, 15, 20, 30, 45, 60, 90, 120].find(v => v >= hi * 1.3) || Math.ceil(hi * 1.3); }
function setMark() { const m = $('#mark'); if (m && RUN.scaleMax) m.style.left = `${Math.min(100, RUN.val / RUN.scaleMax * 100)}%`; }

function lastSets(m, lv, n) {
  const out = [];
  for (let i = S.sessions.length - 1; i >= 0 && out.length < n; i--) {
    const v = (S.sessions[i].sets || []).filter(x => x.m === m && x.level === lv && !x.warm);
    if (v.length) out.unshift(`${fmtShort(S.sessions[i].date)} · ${v.map(x => x.v).join('/')}`);
  }
  return out;
}

function renderStep() {
  const el = $('#run'), st = RUN.steps[RUN.i];
  el.className = 'k-' + st.k;
  let html = runHeader(st);
  if (st.k === 'timed') {
    const e = EX[st.ex];
    html += `<div class="stage"><div class="figfield">${figSlot(st.ex)}</div>
      <div style="display:flex;flex-direction:column;gap:6px"><h1>${esc(e.name)}</h1>${st.note ? `<p class="notepill">${ICON.swap}${esc(st.note)}</p>` : ''}<ul class="cues">${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
      <section class="tclock"><b id="clock">${mmss(st.sec)}</b><div class="tbar"><i id="tbar"></i>${st.note ? '<span class="half"></span>' : ''}</div>
        <div class="tlbl"><span>0:00</span>${st.note ? '<span class="mid">SEITE</span>' : ''}<span class="end">${mmss(st.sec)}</span></div></section></div>
      <div class="runbtns"><button class="btn ghost" data-act="pause">Pause</button><button class="btn primary" data-act="next">Weiter</button></div>`;
  } else if (st.k === 'rest') {
    const nx = RUN.steps.slice(RUN.i + 1).find(s => s.k === 'set' || s.k === 'timed');
    const nxEx = nx ? (nx.k === 'set' ? exFor(nx.m, nx.level) : nx.ex) : null;
    let nxInfo = '';
    if (nx && nx.k === 'set') {
      const r = range(nxEx), pv = lastValue(nx.m, nx.level);
      nxInfo = nx.warm ? '<small>Aufwärmrunde · locker</small>' : `<small>Ziel ${r.lo}–${r.hi} ${unitLabel(nxEx)}${pv !== null ? ` · zuletzt ${pv}` : ''}</small>`;
    }
    html += `<div class="stage"><section class="restc" aria-label="Pause"><small>PAUSE</small>
      <div class="ring"><svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><defs><linearGradient id="gRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>
        <circle class="trk" cx="100" cy="100" r="88" stroke-width="8"/><circle class="arc" id="tring" cx="100" cy="100" r="88" stroke="url(#gRing)" stroke-width="8" stroke-linecap="round" style="stroke-dasharray:${RING} ${RING}" transform="rotate(-90 100 100)"/></svg>
        <div><b id="clock">${mmss(st.sec)}</b><small id="tof">VON ${mmss(st.sec)}</small></div></div>
      <p>Atmen. Wasser trinken.</p></section>
      ${nxEx ? `<section class="card nextcard"><div class="figbox">${figSlot(nxEx)}</div><div><small class="mono">ALS NÄCHSTES${nx.k === 'set' ? ` · ${PATTERNS.find(p => p.id === nx.m).name.toUpperCase()} S${nx.level}` : ''}</small><b>${esc(EX[nxEx].name)}</b>${nxInfo}</div></section>` : ''}</div>
      <div class="runbtns"><button class="btn ghost mono" data-act="plus15">+15 S</button><button class="btn primary" data-act="next">Weiter</button></div>`;
  } else if (st.k === 'set') {
    const ex = exFor(st.m, st.level), e = EX[ex], r = range(ex), p = PATTERNS.find(x => x.id === st.m), sec = e.unit === 'sec';
    const prev = lastValue(st.m, st.level);
    const done = RUN.sets.filter(x => x.m === st.m && x.level === st.level && !x.warm).map(x => x.v);
    RUN.val = st.warm ? (e.unit === 'sec' ? 20 : 8) : done.length ? done[done.length - 1] : prev ?? (e.unit === 'sec' ? 0 : r.lo);
    RUN.scaleMax = st.warm ? 0 : scaleMax(r.hi);
    const pct = v => Math.min(100, v / RUN.scaleMax * 100).toFixed(1);
    html += `<div class="stage"><div class="settitle"><div><small>${p.name.toUpperCase()} · S${st.level}</small><h1>${esc(e.name)}</h1></div><div class="figbox">${figSlot(ex)}</div></div>`;
    if (st.warm) html += `<p class="warmnote">AUFWÄRMRUNDE · LOCKER, CA. ${sec ? '20 S' : '8 WDH.'} – ZÄHLT NICHT</p>`;
    else html += `<section class="card scale" aria-label="Zielbereich ${r.lo} bis ${r.hi}${prev !== null ? `, zuletzt ${prev}` : ''}"><div class="sh"><span>ZIELBEREICH ${r.lo}–${r.hi}${sec ? ' S' : ''}${e.perSide ? ' JE SEITE' : ''}</span><span>${prev !== null ? `ZULETZT ${prev}` : 'ERSTES MAL'}</span></div>
      <div class="trk"><div class="band" style="left:${pct(r.lo)}%;width:${(pct(r.hi) - pct(r.lo)).toFixed(1)}%"></div><div class="mark" id="mark" style="left:${pct(RUN.val)}%"></div></div>
      <div class="lbl" aria-hidden="true"><span style="left:0">0</span><span style="left:${pct(r.lo)}%">${r.lo}</span><span style="left:${pct(r.hi)}%">${r.hi}</span><span style="left:100%">${RUN.scaleMax}</span></div></section>`;
    if (!sec) html += '<section class="tempo" aria-label="Tempo pro Wiederholung: 2 Sekunden runter, 1 halten, 1 hoch"><div><i></i><span>2 S RUNTER</span></div><div><i></i><span>1 S HALTEN</span></div><div><i></i><span>1 S HOCH</span></div></section>';
    html += `<ul class="cues">${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`;
    const hist = st.warm ? [] : lastSets(st.m, st.level, 2);
    if (hist.length || done.length) html += `<section class="hist" aria-label="Letzte Einheiten auf dieser Stufe"><small>VERLAUF</small>${hist.map(h => `<span>${h}</span>`).join('')}<span class="now">heute · ${done.length ? done.join('/') : '…'}</span></section>`;
    if (sec) {
      RUN.sw = { running: false, start: 0 };
      html += `<div class="counter"><button class="btn sec mono" data-act="dec5" aria-label="5 Sekunden weniger">−5</button><div class="val"><b class="time" id="clock">${mmss(RUN.val)}</b><small>SEK.${e.perSide ? ' JE SEITE' : ''}</small></div><button class="btn sec mono" data-act="inc5" aria-label="5 Sekunden mehr">+5</button></div>
        <button class="btn sec swbtn" data-act="sw">Start</button></div>`;
    } else {
      html += `<div class="counter"><button class="btn sec" data-act="dec" aria-label="Eine Wiederholung weniger">−</button><div class="val"><b id="clock">${RUN.val}</b><small>WDH.${e.perSide ? ' JE SEITE' : ''}</small></div><button class="btn sec" data-act="inc" aria-label="Eine Wiederholung mehr">+</button></div></div>`;
    }
    html += `<div class="runbtns"><button class="btn ghost" data-act="skipSet">Auslassen</button><button class="btn primary" data-act="logSet">Satz fertig</button></div>`;
  } else {
    html += summaryHtml();
  }
  el.innerHTML = html;
  mountFigs(el);
  if (st.k === 'timed' || st.k === 'rest') {
    setTimer(st.sec); RUN.timer.total = st.sec;
    if (st.note) RUN.timer.half = st.sec / 2; // Seitenwechsel
  }
}
const RING = 552.9; // Umfang Pausen-Ring (r = 88)

function summaryHtml() {
  const mini = RUN.kind === 'mini', goal = S.profile.weeklyGoal;
  const wk = weekStats(weekStart(ymd()));
  const before = wk.mini ? wk.contacts : wk.units, adds = !mini || wk.mini ? 1 : 0, after = before + adds;
  const segs = [...Array(goal)].map((_, i) => `<i class="${i < Math.min(after, goal) ? (adds && i === after - 1 ? 'new' : 'on') : ''}"></i>`).join('');
  const rows = PATTERNS.map(p => {
    const sets = RUN.sets.filter(x => x.m === p.id && !x.warm);
    if (!sets.length) return `<div class="sumrow nosel"><div><span><b>${p.name}</b></span><small class="muted">ausgelassen</small></div></div>`;
    const ex = sets[0].ex, d = mini ? null : decide(p.id, RUN.sets);
    const sel = d ? `<label>NÄCHSTE<select data-lvsel="${p.id}" class="${d.d > 0 ? 'up' : ''}" aria-label="Nächste Stufe ${p.name}">${[1, 2, 3, 4, 5].map(l => `<option value="${l}" ${l === d.lv + d.d ? 'selected' : ''}>S${l}</option>`).join('')}</select></label>` : '';
    const why = d ? `<small class="${d.d > 0 ? 'good' : d.d < 0 ? 'bad' : 'muted'}">${d.d > 0 ? '▲' : d.d < 0 ? '▼' : '■'} ${esc(d.why)}</small>` : '';
    return `<div class="sumrow ${d ? '' : 'nosel'}"><div><span><b>${p.name}</b> <span class="muted">· ${esc(EX[ex].name)}</span></span><span class="vals">${sets.map(x => x.v).join(' / ')} ${unitLabel(ex)}</span>${why}</div>${sel}</div>`;
  }).join('');
  const ups = mini ? 0 : PATTERNS.filter(p => decide(p.id, RUN.sets).d > 0).length;
  return `<div class="stage"><section class="sumhead"><small>EINHEIT ABGESCHLOSSEN · ${mmss((Date.now() - RUN.start) / 1000)}</small>
      <h1>${ups ? `${ups}× Stufe hoch.` : 'Erledigt.'}</h1><p>${mini ? 'Mini zählt als Kontakt.' : 'Zählt fürs Wochenziel.'}</p></section>
    <section class="card wkdone"><div class="chead"><span>${after >= goal ? 'Woche erfüllt' : 'Wochenziel'}</span><span class="mono accent">${after}/${goal}</span></div>
      <div class="wsegs" style="grid-template-columns:repeat(${goal},minmax(0,1fr))" role="img" aria-label="${after} von ${goal}">${segs}</div>
      <small>${after >= goal ? 'Alles Weitere ist Bonus.' : `Noch ${goal - after} bis zum Wochenziel.`}</small></section>
    <section class="card sumlist">${rows}</section>
    <label class="checkbox"><input type="checkbox" id="together">Gemeinsam trainiert</label>
    <label class="field">Notiz (optional)<input id="note" maxlength="140" placeholder="z. B. Schulter etwas fest"></label></div>
    <div class="runbtns"><button class="btn ghost" data-act="abort">Verwerfen</button><button class="btn primary" data-act="saveRun">Speichern</button></div>`;
}

function saveRun() {
  const mini = RUN.kind === 'mini';
  const s = { id: uid(), type: mini ? 'mini' : 'training', date: ymd(), ts: Date.now(), dur: Math.round((Date.now() - RUN.start) / 1000), sets: RUN.sets, together: $('#together').checked, note: $('#note').value.trim() };
  if (!mini) {
    $$('[data-lvsel]').forEach(sel => { S.levels[sel.dataset.lvsel] = +sel.value; });
    s.levels = { ...S.levels };
  }
  S.sessions.push(s); sortSessions(); save();
  const st = weekStats(weekStart(ymd()));
  stopRun();
  toast(st.ok ? 'Gespeichert – Woche erfüllt' : 'Gespeichert');
}

function runAction(act) {
  const st = RUN.steps[RUN.i];
  switch (act) {
    case 'abort':
      if (RUN.sets.length && st.k !== 'summary' && !confirm('Einheit abbrechen? Bisherige Sätze werden verworfen.')) return;
      stopRun(); return;
    case 'next': nextStep(); return;
    case 'pause': {
      const t = RUN.timer; if (!t) return;
      if (t.paused === null) { t.paused = Math.max(0, (t.end - Date.now()) / 1000); $('[data-act=pause]').textContent = 'Fortsetzen'; }
      else { t.end = Date.now() + t.paused * 1000; t.paused = null; $('[data-act=pause]').textContent = 'Pause'; }
      return;
    }
    case 'plus15': if (RUN.timer) { RUN.timer.end += 15000; RUN.timer.total += 15; } return;
    case 'inc': case 'dec': RUN.val = Math.max(0, RUN.val + (act === 'inc' ? 1 : -1)); $('#clock').textContent = RUN.val; setMark(); return;
    case 'inc5': case 'dec5':
      if (RUN.sw && RUN.sw.running) return;
      RUN.val = Math.max(0, RUN.val + (act === 'inc5' ? 5 : -5)); $('#clock').textContent = mmss(RUN.val); setMark(); return;
    case 'sw': {
      const b = $('[data-act=sw]');
      if (!RUN.sw.running) { RUN.sw = { running: true, start: Date.now() }; RUN.val = 0; $('#clock').textContent = '0:00'; b.textContent = 'Stopp'; clearInterval(RUN_INT); RUN_INT = setInterval(runTick, 200); }
      else { RUN.sw.running = false; RUN.val = Math.floor((Date.now() - RUN.sw.start) / 1000); clearInterval(RUN_INT); $('#clock').textContent = mmss(RUN.val); setMark(); b.textContent = 'Neu starten'; }
      return;
    }
    case 'logSet': {
      if (RUN.sw && RUN.sw.running) runAction('sw');
      RUN.sets.push({ m: st.m, ex: exFor(st.m, st.level), level: st.level, v: RUN.val, warm: !!st.warm, mini: !!st.mini });
      nextStep(); return;
    }
    case 'skipSet': nextStep(); return;
    case 'saveRun': saveRun(); return;
  }
}

// ---------- Ereignisse ----------
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g && !RUN) { go(g.dataset.go, g.dataset.to); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (RUN && b.closest('#run')) { runAction(act); return; }
  switch (act) {
    case 'start': startRun('training'); break;
    case 'mini': startRun('mini'); break;
    case 'badminton': {
      const s = { id: uid(), type: 'badminton', date: ymd(), ts: Date.now(), sets: [] };
      S.sessions.push(s); sortSessions(); save(); render();
      toast('Badminton eingetragen', () => { S.sessions = S.sessions.filter(x => x.id !== s.id); save(); render(); });
      break;
    }
    case 'undo': if (toast.undo) { toast.undo(); toast.undo = null; $('#toast').hidden = true; } break;
    case 'closeDlg': $('#dlg').close(); break;
    case 'obLv': {
      const fs = b.closest('.pick');
      $(`input[name=lv_${b.dataset.m}]`, fs).value = b.dataset.lv;
      $$('button', fs).forEach(x => x.setAttribute('aria-pressed', x === b));
      $(`#obx_${b.dataset.m}`).textContent = EX[exFor(b.dataset.m, +b.dataset.lv)].name;
      break;
    }
    case 'range': RANGE = +b.dataset.v; render(); break;
    case 'rounds': S.profile.rounds = +b.dataset.v; save(); render(); toast('Gespeichert'); break;
    case 'jump': { const el = document.getElementById(b.dataset.to); if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } $$('.chips button').forEach(x => x.classList.toggle('on', x === b)); break; }
    case 'later': dlgLater(); break;
    case 'test': dlgTest(); break;
    case 'export': doExport(); break;
    case 'hideInstall': S.installHintOff = true; save(); render(); break;
    case 'miniweek': { const ws = weekStart(ymd()); if (!S.miniWeeks.includes(ws)) S.miniWeeks.push(ws); save(); render(); break; }
    case 'reentry': {
      const lastT = lastOf(s => s.type === 'training');
      PATTERNS.forEach(p => { S.levels[p.id] = Math.max(1, S.levels[p.id] - 1); });
      S.reentryAck = lastT && lastT.id; save(); render(); toast('Alle Stufen eine tiefer');
      break;
    }
    case 'reentryNo': { const lastT = lastOf(s => s.type === 'training'); S.reentryAck = lastT && lastT.id; save(); render(); break; }
    case 'setLevel': S.levels[b.dataset.m] = +b.dataset.lv; save(); render(); toast(`Stufe ${b.dataset.lv} gesetzt`); break;
    case 'delSession': {
      const i = S.sessions.findIndex(x => x.id === b.dataset.id); if (i < 0) break;
      const [old] = S.sessions.splice(i, 1); save(); render();
      toast('Eintrag gelöscht', () => { S.sessions.push(old); sortSessions(); save(); render(); });
      break;
    }
    case 'delWeight': {
      const i = S.weights.findIndex(x => x.date === b.dataset.date); if (i < 0) break;
      const [old] = S.weights.splice(i, 1); save(); render();
      toast('Messung gelöscht', () => { S.weights.push(old); save(); render(); });
      break;
    }
    case 'reset':
      if (confirm('Wirklich alle Daten auf diesem Gerät löschen?')) { try { localStorage.removeItem(KEY); } catch { /* egal */ } S = null; go('heute'); }
      break;
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'onboard') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const levels = {}; PATTERNS.forEach(p => { levels[p.id] = +fd.get('lv_' + p.id); });
    S = newState({ goalWeight: num(fd.get('goal')), startTime: fd.get('time') || '05:00', hasBar: !!fd.get('bar'), levels });
    const w = num(fd.get('weight')); if (w) S.weights.push({ date: ymd(), kg: w });
    save();
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* optional */ }
    go('heute');
  } else if (e.target.id === 'wform') {
    e.preventDefault();
    const kg = num(new FormData(e.target).get('kg'));
    if (!kg || kg < 30 || kg > 300) { toast('Bitte Gewicht in kg eingeben'); return; }
    const today = ymd(); S.weights = S.weights.filter(w => w.date !== today); S.weights.push({ date: today, kg });
    save(); render(); toast('Gewicht gespeichert');
  }
});

document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.set;
  if (k) {
    const el = e.target;
    S.profile[k] = el.type === 'checkbox' ? el.checked : k === 'rounds' ? +el.value : k === 'goalWeight' ? num(el.value) : el.value;
    save(); toast('Gespeichert');
    if (k === 'goalWeight') render(); // Proteinwert aktualisieren
  } else if (e.target.id === 'importFile' && e.target.files[0]) doImport(e.target.files[0]);
});

// Tooltips für Diagramme
function chartPoint(e) {
  const box = e.target.closest('.chart'); if (!box) return;
  const c = CH[box.dataset.chart]; if (!c || !c.pts.length) return;
  const svg = $('svg', box), rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * c.W;
  let best = c.pts[0]; c.pts.forEach(p => { if (Math.abs(p.cx - x) < Math.abs(best.cx - x)) best = p; });
  const xh = $('.xhair', svg), hl = $('.hl', svg), tip = $('.tip', box);
  xh.setAttribute('x1', best.cx); xh.setAttribute('x2', best.cx); xh.setAttribute('visibility', 'visible');
  hl.setAttribute('cx', best.cx); hl.setAttribute('cy', best.cy); hl.setAttribute('visibility', 'visible');
  tip.innerHTML = best.html; tip.hidden = false;
  const px = best.cx / c.W * rect.width, w = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(0, px - w / 2), rect.width - w)}px`;
  tip.style.top = `${Math.max(0, best.cy / c.H * rect.height - tip.offsetHeight - 10)}px`;
}
function chartHide(box) {
  if (!box) return;
  $('.tip', box).hidden = true; $$('.xhair, .hl', box).forEach(n => n.setAttribute('visibility', 'hidden'));
}
document.addEventListener('pointermove', chartPoint);
document.addEventListener('pointerdown', e => {
  if (e.target.closest('.chart')) chartPoint(e);
  else $$('.chart').forEach(chartHide);
});
document.addEventListener('pointerout', e => { const box = e.target.closest && e.target.closest('.chart'); if (box && e.pointerType === 'mouse' && !box.contains(e.relatedTarget)) chartHide(box); });

// Übungen: Chip des sichtbaren Abschnitts hervorheben
window.addEventListener('scroll', () => {
  if (VIEW !== 'uebungen' || RUN) return;
  let on = null;
  $$('.chips button').forEach(b => { const el = document.getElementById(b.dataset.to); if (el && el.getBoundingClientRect().top < 120) on = b; });
  $$('.chips button').forEach(b => b.classList.toggle('on', b === on));
}, { passive: true });

window.addEventListener('hashchange',() => { const v = location.hash.slice(1); if (v && v !== VIEW) { VIEW = v; render(); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
