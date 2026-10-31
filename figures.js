// Strichfiguren: Seitenansicht, Blick nach rechts. Posen werden über
// Ziele für Hände/Füße beschrieben, Ellbogen/Knie per 2-Gelenk-IK berechnet.
'use strict';

const FIG = (() => {
  const L = { T: 36, N: 12, HR: 7, UA: 17, FA: 16, TH: 22, SH: 22, FOOT: 7 };
  const FLOOR = 115;
  const rad = d => d * Math.PI / 180;
  const dir = d => [Math.cos(rad(d)), Math.sin(rad(d))];
  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  function ik(base, target, a, b, hint) {
    let dx = target[0] - base[0], dy = target[1] - base[1];
    let d = Math.hypot(dx, dy) || 0.001;
    const u = [dx / d, dy / d];
    d = Math.min(Math.max(d, Math.abs(a - b) + 0.5), a + b - 0.05);
    const th = Math.atan2(u[1], u[0]);
    const al = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
    const j1 = [base[0] + a * Math.cos(th + al), base[1] + a * Math.sin(th + al)];
    const j2 = [base[0] + a * Math.cos(th - al), base[1] + a * Math.sin(th - al)];
    const mid = add(base, u, d / 2);
    const s1 = (j1[0] - mid[0]) * hint[0] + (j1[1] - mid[1]) * hint[1];
    const s2 = (j2[0] - mid[0]) * hint[0] + (j2[1] - mid[1]) * hint[1];
    return { joint: s1 >= s2 ? j1 : j2, end: add(base, u, d) };
  }

  // Pose-Felder: hip, torso, head, arch, hand/hand2 | armA/armA2, foot/foot2,
  // eh/eh2 (Ellbogen-Hinweis), kh/kh2 (Knie-Hinweis), toe/toe2 (Fußwinkel)
  function solve(p) {
    const hip = p.hip;
    const sh = add(hip, dir(p.torso), L.T);
    const head = add(sh, dir(p.torso + (p.head || 0)), L.N);
    const arm = (hand, armA, hint) => {
      if (armA !== undefined) {
        const e = add(sh, dir(armA), L.UA);
        return { joint: e, end: add(e, dir(armA), L.FA) };
      }
      return ik(sh, hand, L.UA, L.FA, hint || [-1, 0.4]);
    };
    const leg = (foot, hint) => ik(hip, foot, L.TH, L.SH, hint || [1, 0]);
    return {
      hip, sh, head, torso: p.torso, arch: p.arch || 0,
      a1: arm(p.hand, p.armA, p.eh),
      a2: arm(p.hand2 || p.hand, p.armA2 !== undefined ? p.armA2 : (p.hand2 ? undefined : p.armA), p.eh2 || p.eh),
      l1: leg(p.foot, p.kh),
      l2: leg(p.foot2 || p.foot, p.kh2 || p.kh),
      toe: p.toe || 0,
      toe2: p.toe2 !== undefined ? p.toe2 : (p.toe || 0),
    };
  }

  function mix(A, B, t) {
    const o = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const a = A[k] !== undefined ? A[k] : B[k];
      const b = B[k] !== undefined ? B[k] : A[k];
      if (Array.isArray(a) && typeof a[0] === 'number') o[k] = lerpV(a, b, t);
      else if (typeof a === 'number') o[k] = lerp(a, b, t);
      else o[k] = a;
    }
    return o;
  }

  // Requisiten (statisch)
  const PROPS = {
    wall: x => `<rect x="${x}" y="-6" width="6" height="${FLOOR + 6}" class="prop"/>`,
    table: (x1, x2, y) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="4" rx="1" class="prop"/>` +
      `<rect x="${x1 + 3}" y="${y + 4}" width="3" height="${FLOOR - y - 4}" class="prop"/>` +
      `<rect x="${x2 - 6}" y="${y + 4}" width="3" height="${FLOOR - y - 4}" class="prop"/>`,
    box: (x1, x2, y, back) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${FLOOR - y}" rx="2" class="prop"/>` +
      (back ? `<rect x="${back[0]}" y="${back[1]}" width="${back[2]}" height="${y - back[1]}" rx="2" class="prop"/>` : ''),
    bar: x => `<rect x="${x - 5}" y="-10" width="10" height="${FLOOR + 10}" class="prop faint"/>`,
  };
  // vor der Figur gezeichnet (Hände greifen um die Stange)
  const FRONT = { bar: (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" class="prop solid"/>` };

  function propSvg(list, layer = PROPS) {
    return (list || []).filter(([k]) => layer[k]).map(([k, ...args]) => layer[k](...args)).join('');
  }

  const f = n => n.toFixed(1);
  const seg = (a, b) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
  const limb = (base, j) => `M${f(base[0])} ${f(base[1])}L${f(j.joint[0])} ${f(j.joint[1])}L${f(j.end[0])} ${f(j.end[1])}`;
  const foot = (j, ang) => seg(j.end, add(j.end, dir(ang), L.FOOT));

  function render(s) {
    const back = dir(s.torso - 90);
    const mid = lerpV(s.hip, s.sh, 0.5);
    const c = add(mid, back, s.arch * 2);
    const neckStart = s.sh;
    const neckEnd = add(s.head, [s.sh[0] - s.head[0], s.sh[1] - s.head[1]], L.HR / L.N);
    return {
      back: limb(s.sh, s.a2) + limb(s.hip, s.l2) + foot(s.l2, s.toe2),
      front: `M${f(s.hip[0])} ${f(s.hip[1])}Q${f(c[0])} ${f(c[1])} ${f(s.sh[0])} ${f(s.sh[1])}` +
        seg(neckStart, neckEnd) + limb(s.hip, s.l1) + foot(s.l1, s.toe) + limb(s.sh, s.a1),
      head: s.head,
    };
  }

  const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * t);

  // Zeitverlauf: [A halten, A→B, B halten, B→A]; loop = nach B sofort neu bei A
  function phase(ex, time) {
    const [h1, ab, h2, ba] = ex.tempo || [0.4, 1.2, 0.3, 1.2];
    if (ex.loop) return (time % ab) / ab;
    const tot = h1 + ab + h2 + ba;
    let t = time % tot;
    if (t < h1) return 0;
    t -= h1;
    if (t < ab) return ease(t / ab);
    t -= ab;
    if (t < h2) return 1;
    t -= h2;
    return 1 - ease(t / ba);
  }

  const live = new Set();
  let raf = 0, t0 = 0;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick(now) {
    if (!t0) t0 = now;
    const time = (now - t0) / 1000;
    for (const fig of live) {
      if (!fig.svg.isConnected) { live.delete(fig); continue; }
      fig.draw(phase(fig.ex, time));
    }
    raf = live.size ? requestAnimationFrame(tick) : 0;
  }

  function create(ex) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 -10 200 130');
    svg.setAttribute('class', 'fig');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ex.name);
    svg.innerHTML = `<line x1="0" y1="${FLOOR + 1.5}" x2="200" y2="${FLOOR + 1.5}" class="floor"/>` +
      propSvg(ex.props) +
      `<path class="limb back"/><path class="limb front"/><circle class="headc" r="${L.HR}"/>` +
      propSvg(ex.props, FRONT);
    const [pb, pf] = svg.querySelectorAll('path');
    const hc = svg.querySelector('circle.headc');
    const fig = {
      svg, ex,
      draw(t) {
        const r = render(solve(mix(ex.A, ex.B || ex.A, t)));
        pb.setAttribute('d', r.back);
        pf.setAttribute('d', r.front);
        hc.setAttribute('cx', f(r.head[0]));
        hc.setAttribute('cy', f(r.head[1]));
      },
    };
    fig.draw(reduced ? 1 : 0);
    if (!reduced && ex.B) {
      live.add(fig);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    return svg;
  }

  return { create, FLOOR };
})();
