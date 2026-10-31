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
function go(v) { VIEW = v; history.replaceState(null, '', '#' + v); render(); window.scrollTo(0, 0); }

function render() {
  const main = $('#view');
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === VIEW));
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
  const sel = p => `<label class="field"><span>${p.name}</span><select name="lv_${p.id}">` +
    p.ladder.map((id, i) => `<option value="${i + 1}" ${i === (p.id === 'pull' ? 0 : 1) ? 'selected' : ''}>${i + 1} · ${esc(EX[id].name)}</option>`).join('') + '</select></label>';
  return `<section class="hero">
    <h1>Kein Ziel­datum.<br><span class="accent">Nur nächste Woche.</span></h1>
    <p>Diese App zählt keine Tage in Folge. Sie zählt Wochen mit drei Einheiten, zeigt deine Stufen und den Trend.</p>
  </section>
  <form class="card" id="onboard">
    <h2>Start</h2>
    <label class="field"><span>Zielgewicht (kg)</span><input name="goal" inputmode="decimal" value="80"></label>
    <label class="field"><span>Gewicht heute (kg, optional)</span><input name="weight" inputmode="decimal" placeholder="z. B. 93,0"></label>
    <label class="field"><span>Standardzeit</span><input name="time" type="time" value="05:00"></label>
    <label class="check"><input type="checkbox" name="bar"> Klimmzugstange vorhanden</label>
    <h3>Startstufen</h3>
    <p class="muted small">Wähle je Muster die Stufe, auf der du 8–12 saubere Wiederholungen schaffst. Im Zweifel die tiefere.</p>
    ${PATTERNS.map(sel).join('')}
    <button class="btn primary big" type="submit">Los geht’s</button>
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
  const C = 2 * Math.PI * 44;
  const days = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), list = st.list.filter(s => s.date === d);
    const u = list.some(isUnit), m = list.some(s => s.type === 'mini');
    return `<div class="day ${d === today ? 'today' : ''}"><span>${'MDMDFSS'[i]}</span><i class="${u ? 'u' : m ? 'm' : ''}"></i></div>`;
  }).join('');
  const ban = banners().map(b => `<div class="banner ${b.cls}"><div><b>${esc(b.t)}</b><p>${esc(b.d)}</p></div>` +
    (b.btn ? `<div class="bbtns">${b.btn2 ? `<button class="btn ghost sm" data-act="${b.act2}">${b.btn2}</button>` : ''}<button class="btn sm" data-act="${b.act}">${b.btn}</button></div>` : '') + '</div>').join('');
  const ser = weightSeries(), lastW = ser[ser.length - 1];
  const todayW = S.weights.find(w => w.date === today);
  const levels = PATTERNS.map(p => {
    const lv = effLevel(p.id), ex = exFor(p.id, lv);
    return `<button class="lvl" data-go="uebungen">${figSlot(ex, 'mini')}<span><small>${p.name} · Stufe ${lv}</small>${esc(EX[ex].name)}</span></button>`;
  }).join('');
  const minutes = S.profile.rounds === 3 ? 25 : 20;
  return `<header class="top"><div><p class="muted">${hello} · ${fmtDate(today)}</p><h1>Block ${bi.block} <span class="muted">· Woche ${bi.week}/6</span></h1></div></header>
  <section class="card weekcard">
    <svg viewBox="0 0 100 100" class="ring" aria-hidden="true"><circle cx="50" cy="50" r="44" class="track"/>
      <circle cx="50" cy="50" r="44" class="arc ${st.ok ? 'done' : ''}" ${frac ? '' : 'visibility="hidden"'} stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
    <div class="ringtxt"><b>${val}<span>/${goal}</span></b><small>${st.mini ? 'Kontakte' : 'Einheiten'}</small></div>
    <div class="weekinfo"><p>${st.ok ? '<b class="accent">Woche erfüllt.</b> Alles weitere ist Bonus.' : `Noch ${Math.max(0, goal - val)} bis zum Wochenziel.`}</p><div class="days">${days}</div></div>
  </section>
  ${ban}
  <button class="btn primary big" data-act="start">Training starten <small>~${minutes} min</small></button>
  <div class="row2">
    <button class="btn" data-act="mini">Mini <small>5 min</small></button>
    <button class="btn" data-act="badminton">Badminton <small>eintragen</small></button>
  </div>
  <p class="slot muted small">Standard ${esc(S.profile.startTime)} Uhr · Ersatz am Nachmittag zählt voll · nach 23 Uhr ins Bett → Nachmittag. <button class="link" data-act="later">Nachtragen</button></p>
  <section class="card">
    <h2>Gewicht</h2>
    <form class="inline" id="wform"><input name="kg" inputmode="decimal" placeholder="${todayW ? fmt1(todayW.kg) : 'kg heute'}" aria-label="Gewicht heute in kg"><button class="btn sm" type="submit">${todayW ? 'Ändern' : 'Speichern'}</button></form>
    <p class="muted small">${lastW ? `7-Tage-Mittel: <b class="num">${fmt1(lastW.ma)} kg</b>` : 'Morgens nach dem Aufstehen wiegen. Gewertet wird nur der 7-Tage-Mittelwert.'}</p>
  </section>
  <section class="card"><h2>Deine Stufen</h2><div class="lvls">${levels}</div></section>`;
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
function chart(id, W, H, body, pts, top, bottom) {
  CH[id] = { W, H, pts };
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img">${body}
    <line class="xhair" x1="0" x2="0" y1="${top}" y2="${bottom}" visibility="hidden"/><circle class="hl" r="4.5" visibility="hidden"/></svg><div class="tip" hidden></div></div>`;
}

function weightChart(ser) {
  if (ser.length < 2) return '<p class="muted small">Ab zwei Messungen erscheint hier der Verlauf.</p>';
  const W = 340, H = 170, L = 30, R = 40, T = 10, B = 22;
  const d0 = ser[0].date, d1 = ser[ser.length - 1].date, span = Math.max(1, diffDays(d0, d1));
  let lo = Math.min(...ser.map(p => Math.min(p.kg, p.ma))), hi = Math.max(...ser.map(p => Math.max(p.kg, p.ma)));
  const goal = S.profile.goalWeight;
  if (goal && goal < lo && goal >= lo - 3) lo = goal;
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const x = d => L + diffDays(d0, d) / span * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  let s = niceTicks(lo, hi).map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('');
  if (goal >= lo && goal <= hi) s += `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="ax" x="${W - R + 4}" y="${y(goal) + 3.5}">Ziel</text>`;
  s += `<text class="ax" x="${L}" y="${H - 6}">${fmtShort(d0)}</text><text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtShort(d1)}</text>`;
  s += ser.map(p => `<circle class="dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.2"/>`).join('');
  s += `<path class="line" d="${ser.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.ma).toFixed(1)}`).join('')}"/>`;
  const last = ser[ser.length - 1];
  s += `<text class="lbl" x="${x(last.date) + 6}" y="${y(last.ma) + 4}">${fmt1(last.ma)}</text>`;
  const pts = ser.map(p => ({ cx: x(p.date), cy: y(p.ma), html: `<b>${fmtDate(p.date)}</b><br>Mittel ${fmt1(p.ma)} kg<br><span class="muted">gewogen ${fmt1(p.kg)} kg</span>` }));
  return chart('weight', W, H, s, pts, T, H - B);
}

function trendText(t) {
  if (t === null) return 'Trend ab ca. 2 Wochen Messungen.';
  const v = `${t > 0 ? '+' : '−'}${fmt1(Math.abs(t))} kg/Woche`;
  if (t < -0.7) return `${v}: schneller als geplant. Etwas mehr essen und aufs Protein achten, sonst geht Muskulatur mit.`;
  if (t <= -0.3) return `${v}: im Zielkorridor.`;
  if (t < -0.1) return `${v}: langsam – in Ordnung, solange die Taille kleiner wird.`;
  return `${v}: Trend steht. Hält das 3 Wochen an, etwas weniger essen.`;
}

function weeksChart() {
  const n = 12, cur = weekStart(ymd()), startWs = weekStart(S.profile.start), goal = S.profile.weeklyGoal;
  const weeks = [...Array(n)].map((_, i) => weekStats(addDays(cur, -7 * (n - 1 - i))));
  const W = 340, H = 140, L = 22, R = 8, T = 10, B = 22;
  const max = Math.max(goal + 2, ...weeks.map(w => w.contacts));
  const bw = (W - L - R) / n, y = v => T + (max - v) / max * (H - T - B), base = H - B;
  let s = `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="ax" x="${L - 5}" y="${y(goal) + 3.5}" text-anchor="end">${goal}</text>`;
  s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>`;
  const pts = [];
  weeks.forEach((w, i) => {
    const x0 = L + i * bw + 3, bwi = bw - 6, cx = x0 + bwi / 2;
    if (w.ws < startWs) { pts.push({ cx, cy: base, html: `<b>KW ${isoWeek(w.ws)}</b><br><span class="muted">vor dem Start</span>` }); return; }
    const v = w.mini ? w.contacts : w.units;
    const cls = w.ws === cur ? 'cur' : w.full ? 'ok' : w.ok ? 'mini' : 'no';
    if (v > 0) {
      const top = y(v), r = Math.min(4, (base - top) / 2);
      s += `<path class="bar ${cls}" d="M${x0} ${base}V${top + r}Q${x0} ${top} ${x0 + r} ${top}H${x0 + bwi - r}Q${x0 + bwi} ${top} ${x0 + bwi} ${top + r}V${base}Z"/>`;
    }
    if (i % 2 === 1 || i === n - 1) s += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${isoWeek(w.ws)}</text>`;
    pts.push({ cx, cy: y(v), html: `<b>KW ${isoWeek(w.ws)}</b>${w.ws === cur ? ' (läuft)' : ''}<br>${w.units} Einheiten${w.contacts > w.units ? `, ${w.contacts - w.units} Mini` : ''}${w.mini ? '<br>Mini-Woche' : ''}` });
  });
  return chart('weeks', W, H, s, pts, T, base);
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
function perfChart(p) {
  const ser = perfSeries(p.id);
  const W = 160, H = 96, L = 16, R = 6, T = 6, B = 14;
  const y = v => T + (6 - v) / 5.5 * (H - T - B);
  let s = [1, 2, 3, 4, 5].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  let pts = [];
  if (ser.length) {
    const d0 = ser[0].date, span = Math.max(1, diffDays(d0, ser[ser.length - 1].date));
    const x = d => ser.length === 1 ? (L + W - R) / 2 : L + diffDays(d0, d) / span * (W - L - R);
    if (ser.length > 1) s += `<path class="line" d="${ser.map((q, i) => `${i ? 'L' : 'M'}${x(q.date).toFixed(1)} ${y(q.idx).toFixed(1)}`).join('')}"/>`;
    s += ser.map(q => `<circle class="pdot" cx="${x(q.date).toFixed(1)}" cy="${y(q.idx).toFixed(1)}" r="2.6"/>`).join('');
    pts = ser.map(q => ({ cx: x(q.date), cy: y(q.idx), html: `<b>${fmtDate(q.date)}</b><br>Stufe ${q.lv}: ${q.best} ${unitLabel(q.ex)}` }));
  }
  const last = ser[ser.length - 1];
  return `<div class="perf"><p><b>${p.name}</b> <span class="muted small">${last ? `St. ${last.lv} · ${last.best} ${unitLabel(last.ex)}` : 'noch keine Daten'}</span></p>${chart('perf_' + p.id, W, H, s, pts, T, H - B)}</div>`;
}

function testsTable() {
  if (!S.tests.length) return '<p class="muted small">Noch kein Test eingetragen.</p>';
  const a = S.tests[0], b = S.tests[S.tests.length - 1], one = S.tests.length === 1;
  const cell = (t, v, st) => v === null || v === undefined ? '–' : `${fmtNum(v)}${t.id === 'push' && st ? ` <small class="muted">St.${st}</small>` : ''}`;
  const rows = TESTS.map(t => {
    const va = a.v[t.id], vb = b.v[t.id];
    let delta = '';
    if (!one && va != null && vb != null) {
      if (t.id === 'push' && a.pushStage !== b.pushStage) delta = b.pushStage > a.pushStage ? '<span class="good">Stufe ↑</span>' : '<span class="bad">Stufe ↓</span>';
      else { const d = vb - va, good = d * t.better > 0; delta = d === 0 ? '<span class="muted">±0</span>' : `<span class="${good ? 'good' : 'bad'}">${good ? '▲' : '▼'} ${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}</span>`; }
    }
    return `<tr><th>${esc(t.label)} <small class="muted">${t.unit}</small></th><td>${cell(t, va, a.pushStage)}</td>${one ? '' : `<td>${cell(t, vb, b.pushStage)}</td><td>${delta}</td>`}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="tests"><thead><tr><th></th><th>${fmtShort(a.date)}</th>${one ? '' : `<th>${fmtShort(b.date)}</th><th>Δ</th>`}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">${S.tests.length} Test${S.tests.length === 1 ? '' : 's'} · ▲ = besser, ▼ = schlechter (bei Umfang und Puls ist weniger besser).</p>`;
}
const fmtNum = v => Number.isInteger(v) ? String(v) : fmt1(v);

function viewHistory() {
  const ser = weightSeries(), t = trend(ser);
  const q12 = weekQuota(12), qAll = weekQuota(52);
  const together = S.sessions.filter(s => s.together).length;
  const list = [...S.sessions].reverse().slice(0, 25).map(s => {
    const icon = { training: 'Training', mini: 'Mini', badminton: 'Badminton' }[s.type];
    const sum = (s.sets || []).filter(x => !x.warm).length ? PATTERNS.map(p => { const v = s.sets.filter(x => x.m === p.id && !x.warm); return v.length ? `${p.name[0]}${v[0].level}: ${v.map(x => x.v).join('/')}` : ''; }).filter(Boolean).join(' · ') : '';
    return `<li><div><b>${fmtDate(s.date)}</b> · ${icon}${s.together ? ' · <span class="tag">gemeinsam</span>' : ''}${s.late ? ' <span class="muted small">(nachgetragen)</span>' : ''}<br><small class="muted">${esc(sum)}${s.note ? ` · ${esc(s.note)}` : ''}</small></div><button class="x" data-act="delSession" data-id="${s.id}" aria-label="Eintrag löschen">×</button></li>`;
  }).join('');
  const wl = [...S.weights].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 30).map(w =>
    `<li><span>${fmtDate(w.date)}</span><span class="num">${fmt1(w.kg)} kg</span><button class="x" data-act="delWeight" data-date="${w.date}" aria-label="Messung löschen">×</button></li>`).join('');
  const goal = S.profile.weeklyGoal;
  return `<header class="top"><h1>Verlauf</h1></header>
  <section class="card"><h2>Gewicht <small class="muted">7-Tage-Mittel</small></h2>${weightChart(ser)}
    <p class="small">${trendText(t)}</p>
    ${wl ? `<details><summary class="muted small">Messungen</summary><ul class="plain">${wl}</ul></details>` : ''}</section>
  <section class="card"><h2>Wochen mit ≥ ${goal} Einheiten</h2>
    <div class="stats"><div><b class="num">${q12.ok}<span>/${q12.tot}</span></b><small>letzte 12 Wochen</small></div><div><b class="num">${qAll.ok}<span>/${qAll.tot}</span></b><small>letzte 52 Wochen</small></div><div><b class="num">${together}</b><small>gemeinsam</small></div></div>
    ${weeksChart()}
    <p class="legend small"><i class="sw ok"></i>erfüllt <i class="sw mini"></i>Mini-Woche erfüllt <i class="sw no"></i>darunter <i class="sw cur"></i>laufend</p></section>
  <section class="card"><h2>Leistung <small class="muted">Stufe + Anteil am Zielbereich</small></h2><div class="perfgrid">${PATTERNS.map(perfChart).join('')}</div></section>
  <section class="card"><h2>Tests</h2>${testsTable()}<button class="btn sm" data-act="test">Test eintragen</button></section>
  <section class="card"><h2>Einheiten</h2>${list ? `<ul class="plain sessions">${list}</ul>` : '<p class="muted small">Noch keine Einheit.</p>'}</section>`;
}

// ---------- Übungen ----------
function exCard(id, extra = '') {
  const e = EX[id], r = range(id);
  return `<article class="excard">${figSlot(id)}<div><h3>${esc(e.name)}</h3><ul>${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>${extra}</div></article>`;
}
function viewExercises() {
  const ladders = PATTERNS.map(p => {
    const cur = effLevel(p.id);
    return `<section class="card"><h2>${p.name} <small class="muted">aktuell Stufe ${cur}</small></h2>` + p.ladder.map((id, i) => {
      const r = range(id), lv = i + 1, e = EX[id];
      const rng = e.unit === 'sec' ? `${r.lo}–${r.hi} s` : `${r.lo}–${r.hi} Wdh.`;
      const extra = `<p class="muted small">Stufe ${lv} · Ziel ${rng}${e.perSide ? ' je Seite' : ''}${e.needsBar ? ' · Klimmzugstange' : ''}</p>` +
        (lv === cur ? '<span class="tag">deine Stufe</span>' : `<button class="link" data-act="setLevel" data-m="${p.id}" data-lv="${lv}">Als aktuelle Stufe setzen</button>`);
      return `<div class="${lv === cur ? 'current' : ''}">${exCard(id, extra)}</div>`;
    }).join('') + '</section>';
  }).join('');
  const list = (items, title) => `<section class="card"><h2>${title}</h2>${items.map(it => exCard(it.ex, `<p class="muted small">${it.sec} s${it.note ? ` · ${esc(it.note)}` : ''}</p>`)).join('')}</section>`;
  return `<header class="top"><h1>Übungen</h1><p class="muted small">Aufstieg: alle Arbeitssätze am oberen Ende des Zielbereichs → nächste Einheit eine Stufe höher. Unter dem Mindestwert → eine Stufe zurück.</p></header>
    ${list(WARMUP, 'Aufwärmen · ca. 4 min')}${ladders}${list(COOLDOWN, 'Dehnen · ca. 3 min')}`;
}

// ---------- Mehr ----------
function viewMore() {
  const p = S.profile;
  return `<header class="top"><h1>Mehr</h1></header>
  <section class="card"><h2>Einstellungen</h2>
    <label class="field"><span>Zielgewicht (kg)</span><input data-set="goalWeight" inputmode="decimal" value="${p.goalWeight ?? ''}"></label>
    <label class="field"><span>Standardzeit</span><input data-set="startTime" type="time" value="${esc(p.startTime)}"></label>
    <label class="field"><span>Arbeitsrunden pro Training</span><select data-set="rounds"><option value="2" ${p.rounds === 2 ? 'selected' : ''}>2 · ca. 20 min</option><option value="3" ${p.rounds === 3 ? 'selected' : ''}>3 · ca. 25 min</option></select></label>
    <label class="check"><input type="checkbox" data-set="hasBar" ${p.hasBar ? 'checked' : ''}> Klimmzugstange vorhanden</label>
    <label class="check"><input type="checkbox" data-set="sound" ${p.sound ? 'checked' : ''}> Signaltöne</label>
    <p class="muted small">Die Töne mischen sich mit Spotify und sind bei stummgeschaltetem iPhone aus. Unterbricht Spotify trotzdem, Signaltöne ausschalten – die Anzeige blinkt zusätzlich.</p>
  </section>
  <section class="card"><h2>Daten</h2>
    <p class="small">Alles liegt nur auf diesem Gerät. Nichts wird hochgeladen.${S.lastExport ? ` Letzter Export: ${fmtDate(S.lastExport)}.` : ''}</p>
    <div class="row2"><button class="btn" data-act="export">Exportieren</button><label class="btn">Importieren<input type="file" accept="application/json,.json" id="importFile" hidden></label></div>
  </section>
  <section class="card rules"><h2>Die Regeln</h2><ol>
    <li><b>Kein Ende.</b> 6-Wochen-Blöcke mit Re-Test, danach automatisch der nächste.</li>
    <li><b>Standardzeit + Ersatz.</b> ${esc(p.startTime)} Uhr; Nachmittag zählt voll. Nach 23 Uhr ins Bett → Nachmittag.</li>
    <li><b>Wochenziel statt Tageskette.</b> ${p.weeklyGoal} Einheiten. Badminton zählt.</li>
    <li><b>Mini (5 min)</b> zählt als Kontakt. Matte ausgerollt = Tag gewertet.</li>
    <li><b>Nie zweimal auslassen.</b> Nach 7 Tagen Pause eine Stufe tiefer, nicht bei null.</li>
    <li><b>Zwei schwache Wochen</b> → Mini-Woche. Normaler Zustand, kein Scheitern.</li>
    <li><b>Sichtbar:</b> Stufen, Trend, gemeinsame Einheiten. Kein Streak.</li>
  </ol>
  <h3>Ernährung: zwei Stellgrößen</h3>
  <ul><li>Defizit über den Trend steuern: −0,3 bis −0,6 kg/Woche im 7-Tage-Mittel.</li><li>Protein ca. 1,6 g pro kg Zielgewicht (${p.goalWeight ? Math.round(p.goalWeight * 1.6) : '–'} g/Tag).</li></ul></section>
  <section class="card"><h2>Zurücksetzen</h2><p class="muted small">Löscht alle Daten auf diesem Gerät. Vorher exportieren.</p><button class="btn danger sm" data-act="reset">Alle Daten löschen</button></section>
  <p class="muted small center">Fitness · Daten lokal · v1</p>`;
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

function dlgTest() {
  const lv = effLevel('push');
  const fields = TESTS.map(t => `<label class="field"><span>${esc(t.label)} <small class="muted">${t.unit}${t.optional ? ', optional' : ''}</small></span>
    <input name="${t.id}" inputmode="decimal"><small class="muted">${esc(t.how)}</small></label>` +
    (t.id === 'push' ? `<label class="field"><span>Liegestütz-Stufe</span><select name="pushStage">${PATTERNS[0].ladder.map((id, i) => `<option value="${i + 1}" ${i + 1 === lv ? 'selected' : ''}>${i + 1} · ${esc(EX[id].name)}</option>`).join('')}</select></label>` : '')).join('');
  openDialog(`<h2>${S.tests.length ? `Re-Test Block ${blockInfo().block}` : 'Woche-0-Test'}</h2><p class="muted small">Nach dem Aufwärmen, immer zur gleichen Tageszeit. Leere Felder werden übersprungen.</p>${fields}
    <div class="row2"><button class="btn ghost" value="cancel">Abbrechen</button><button class="btn primary" value="ok">Speichern</button></div>`, fd => {
    const v = {}; TESTS.forEach(t => { v[t.id] = num(fd.get(t.id)); });
    if (Object.values(v).every(x => x === null)) { toast('Keine Werte eingetragen'); return false; }
    S.tests.push({ date: ymd(), block: S.tests.length ? blockInfo().block : 0, v, pushStage: +fd.get('pushStage') });
    save(); render(); toast('Test gespeichert');
  });
}

function dlgLater() {
  openDialog(`<h2>Nachtragen</h2>
    <label class="field"><span>Art</span><select name="type"><option value="training">Training (ohne Sätze)</option><option value="mini">Mini</option><option value="badminton">Badminton</option></select></label>
    <label class="field"><span>Datum</span><input type="date" name="date" value="${addDays(ymd(), -1)}" max="${ymd()}"></label>
    <label class="check"><input type="checkbox" name="together"> gemeinsam</label>
    <div class="row2"><button class="btn ghost" value="cancel">Abbrechen</button><button class="btn primary" value="ok">Eintragen</button></div>`, fd => {
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
}
function stopRun() {
  clearInterval(RUN_INT); RUN = null; wakeOff();
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
    if (t.paused === null && c !== t.last) {
      t.last = c;
      if (c <= 3 && c > 0) beep(660, 0.08, 0.18);
    }
    if (t.half && !t.halfDone && t.paused === null && left <= t.half) { t.halfDone = true; beep(880, 0.2, 0.25); flash(); }
    if (t.paused === null && left <= 0) { beep(990, 0.35, 0.3); flash(); nextStep(); }
  } else if (RUN.sw && RUN.sw.running) {
    const s = Math.floor((Date.now() - RUN.sw.start) / 1000);
    if (s !== RUN.val) {
      RUN.val = s; if (out) out.textContent = mmss(s);
      const st = RUN.steps[RUN.i], r = range(exFor(st.m, st.level));
      if (s === r.hi) { beep(990, 0.25, 0.3); flash(); }
    }
  }
}

function runHeader(st) {
  const total = RUN.steps.length - 1, pct = Math.round(RUN.i / total * 100);
  return `<div class="runhead"><button class="x big" data-act="abort" aria-label="Einheit abbrechen">×</button><div><small>${esc(st.phase || '')}</small><div class="prog"><i style="width:${pct}%"></i></div></div><span class="muted small num">${mmss((Date.now() - RUN.start) / 1000)}</span></div>`;
}

function renderStep() {
  const el = $('#run'), st = RUN.steps[RUN.i];
  let html = runHeader(st);
  if (st.k === 'timed') {
    const e = EX[st.ex];
    html += `<div class="stage">${figSlot(st.ex, 'big')}<h2>${esc(e.name)}</h2>${st.note ? `<p class="accent small">${esc(st.note)}</p>` : ''}
      <ul class="cues">${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="clock num" id="clock">${mmss(st.sec)}</div><div class="tbar"><i id="tbar"></i></div></div>
      <div class="runbtns"><button class="btn" data-act="pause">Pause</button><button class="btn primary" data-act="next">Weiter</button></div>`;
  } else if (st.k === 'rest') {
    const nx = RUN.steps.slice(RUN.i + 1).find(s => s.k === 'set' || s.k === 'timed');
    const nxEx = nx ? (nx.k === 'set' ? exFor(nx.m, nx.level) : nx.ex) : null;
    html += `<div class="stage rest"><p class="muted">Pause</p><div class="clock num" id="clock">${mmss(st.sec)}</div><div class="tbar"><i id="tbar"></i></div>
      ${nxEx ? `<p class="muted small">Als Nächstes</p>${figSlot(nxEx, 'mid')}<h3>${esc(EX[nxEx].name)}${nx.k === 'set' ? ` <small class="muted">Stufe ${nx.level}</small>` : ''}</h3>` : ''}</div>
      <div class="runbtns"><button class="btn" data-act="plus15">+15 s</button><button class="btn primary" data-act="next">Weiter</button></div>`;
  } else if (st.k === 'set') {
    const ex = exFor(st.m, st.level), e = EX[ex], r = range(ex), p = PATTERNS.find(x => x.id === st.m);
    const prev = lastValue(st.m, st.level);
    const done = RUN.sets.filter(x => x.m === st.m && x.level === st.level && !x.warm).map(x => x.v);
    RUN.val = st.warm ? (e.unit === 'sec' ? 20 : 8) : done.length ? done[done.length - 1] : prev ?? (e.unit === 'sec' ? 0 : r.lo);
    const target = st.warm ? `Locker, ca. ${e.unit === 'sec' ? '20 s' : '8 Wdh.'} – zählt nicht` : `Ziel ${r.lo}–${r.hi} ${unitLabel(ex)}${e.perSide ? ' je Seite' : ''}`;
    html += `<div class="stage">${figSlot(ex, 'big')}<p class="muted small">${p.name} · Stufe ${st.level}</p><h2>${esc(e.name)}</h2>
      <p class="target">${target}${!st.warm && prev !== null ? ` <span class="muted">· zuletzt ${prev}</span>` : ''}</p>
      <ul class="cues">${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`;
    if (e.unit === 'sec') {
      RUN.sw = { running: false, start: 0 };
      html += `<div class="clock num" id="clock">${mmss(RUN.val)}</div>
        <div class="stepper"><button class="btn round" data-act="dec5" aria-label="5 Sekunden weniger">−5</button><button class="btn primary round wide" data-act="sw">Start</button><button class="btn round" data-act="inc5" aria-label="5 Sekunden mehr">+5</button></div></div>`;
    } else {
      html += `<div class="stepper"><button class="btn round" data-act="dec" aria-label="Eine Wiederholung weniger">−</button><div class="clock num" id="clock">${RUN.val}</div><button class="btn round" data-act="inc" aria-label="Eine Wiederholung mehr">+</button></div></div>`;
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

function summaryHtml() {
  const mini = RUN.kind === 'mini';
  const rows = PATTERNS.map(p => {
    const sets = RUN.sets.filter(x => x.m === p.id && !x.warm);
    if (!sets.length) return `<li><b>${p.name}</b> <span class="muted">ausgelassen</span></li>`;
    const ex = sets[0].ex, d = mini ? null : decide(p.id, RUN.sets);
    const sel = d ? `<select data-lvsel="${p.id}" aria-label="Nächste Stufe ${p.name}">${[1, 2, 3, 4, 5].map(l => `<option value="${l}" ${l === d.lv + d.d ? 'selected' : ''}>Stufe ${l}</option>`).join('')}</select>` : '';
    return `<li><div><b>${p.name}</b> · ${esc(EX[ex].name)}<br><span class="num">${sets.map(x => x.v).join(' / ')} ${unitLabel(ex)}</span>${d ? `<br><small class="${d.d > 0 ? 'good' : d.d < 0 ? 'bad' : 'muted'}">${esc(d.why)}</small>` : ''}</div>${sel}</li>`;
  }).join('');
  const ups = mini ? 0 : PATTERNS.filter(p => decide(p.id, RUN.sets).d > 0).length;
  return `<div class="stage sum"><h1>${ups ? `<span class="accent">${ups}× Stufe hoch.</span>` : 'Erledigt.'}</h1>
    <p class="muted">${mini ? 'Mini zählt als Kontakt.' : 'Zählt fürs Wochenziel.'} Dauer ${mmss((Date.now() - RUN.start) / 1000)}.</p>
    <ul class="plain sumlist">${rows}</ul>
    <label class="check"><input type="checkbox" id="together"> gemeinsam trainiert</label>
    <label class="field"><span>Notiz (optional)</span><input id="note" maxlength="140"></label></div>
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
    case 'inc': case 'dec': RUN.val = Math.max(0, RUN.val + (act === 'inc' ? 1 : -1)); $('#clock').textContent = RUN.val; return;
    case 'inc5': case 'dec5':
      if (RUN.sw && RUN.sw.running) return;
      RUN.val = Math.max(0, RUN.val + (act === 'inc5' ? 5 : -5)); $('#clock').textContent = mmss(RUN.val); return;
    case 'sw': {
      const b = $('[data-act=sw]');
      if (!RUN.sw.running) { RUN.sw = { running: true, start: Date.now() }; RUN.val = 0; $('#clock').textContent = '0:00'; b.textContent = 'Stopp'; clearInterval(RUN_INT); RUN_INT = setInterval(runTick, 200); }
      else { RUN.sw.running = false; RUN.val = Math.floor((Date.now() - RUN.sw.start) / 1000); clearInterval(RUN_INT); $('#clock').textContent = mmss(RUN.val); b.textContent = 'Neu starten'; }
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
  if (g && !RUN) { go(g.dataset.go); return; }
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

window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== VIEW) { VIEW = v; render(); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
