// TW Schnittraum – Musik von der App.
// Die Musik wird im Gerät erzeugt: gerechnete Töne (gezupfte Saite, Klavier, Fläche, Bass, Schlagzeug) nach einfachen Regeln der Harmonielehre.
// Es steckt keine fremde Aufnahme und kein fremdes Stück darin – sie gehört niemandem und darf überall verwendet werden.
// Nichts kommt aus dem Netz, nichts verlässt das Gerät. Gleiche Angaben (Stil, Länge, Variante) ergeben immer dasselbe Stück.
export const RATE = 32000;
export const LAENGE_HOECHSTENS = 180;      // ein Stück ist höchstens 3 Minuten lang – längere Filme bekommen es mehrmals bzw. im Wechsel mit einer zweiten Variante
export const MUSIK_STILE = {
  ruhig: ['Ruhig', 'weiche Flächen und einzelne gezupfte Töne – für ruhige Bilder'],
  heiter: ['Heiter', 'gezupfte Gitarre mit leichtem Rhythmus – freundlich, für Baustelle und Alltag'],
  schwung: ['Mit Schwung', 'Schlagzeug, Bass und schnelle Läufe – für Werbung und Tempo'],
  klavier: ['Klavier', 'ruhiges Klavier – für Stimmung und Rückblick'],
};
const EINSTELLUNG = {
  //         Tempo  Grundton (MIDI)  Tonart   Akkordfolgen (Stufen der Tonleiter, eine je Takt)
  ruhig:   { bpm: 70,  grund: 50, moll: false, folgen: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 5, 4]] },
  heiter:  { bpm: 108, grund: 55, moll: false, folgen: [[0, 4, 5, 3], [0, 3, 0, 4], [0, 5, 3, 4]] },
  schwung: { bpm: 122, grund: 45, moll: true,  folgen: [[0, 5, 2, 6], [0, 3, 5, 6], [0, 5, 3, 6]] },
  klavier: { bpm: 64,  grund: 48, moll: false, folgen: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4]] },
};
const DUR = [0, 2, 4, 5, 7, 9, 11], MOLL = [0, 2, 3, 5, 7, 8, 10];
const PENTA_DUR = [0, 1, 2, 4, 5], PENTA_MOLL = [0, 2, 3, 4, 6];     // Stufen, aus denen die Melodie besteht (klingt über jedem Akkord der Tonart)
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const zufall = (saat) => { let a = saat >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pause = () => new Promise((ok) => setTimeout(ok, 0));

// ───────────────────────── Klangtafeln (eine Schwingung, aus Teiltönen gerechnet – dadurch ohne Störtöne) ─────────────────────────
const tafel = (teile, fall) => { const t = new Float32Array(2049); let gr = 0; for (let i = 0; i <= 2048; i++) { let v = 0; for (let k = 1; k <= teile; k++) v += Math.sin(2 * Math.PI * k * i / 2048) / Math.pow(k, fall); t[i] = v; gr = Math.max(gr, Math.abs(v)); } for (let i = 0; i <= 2048; i++) t[i] /= gr; return t; };
const T_FLAECHE = tafel(7, 1.6), T_HELL = tafel(10, 1.05), T_WEICH = tafel(4, 2.0), T_BASS = tafel(3, 1.8);
const lies = (t, ph) => { const x = ph * 2048, i = x | 0; return t[i] + (t[i + 1] - t[i]) * (x - i); };

// ───────────────────────── Instrumente – jedes schreibt in die Spuren S.l / S.r (trocken) und S.h (Anteil für den Hall) ─────────────────────────
const lr = (laut, lage) => [laut * Math.cos((lage + 1) * Math.PI / 4), laut * Math.sin((lage + 1) * Math.PI / 4)];

/** Gezupfte Saite (Karplus-Strong mit Feinstimmung: Schleife = N − ½ aus dem Mitteln + Bruchteil aus dem Allpass; nachgemessen auf unter 2 Cent). hell 0…1, halb = Sekunden bis zur halben Lautstärke. */
function zupf(S, t, f, dauer, laut, lage = 0, hell = 0.5, hall = 0.3, halb = 0.9) {
  const n0 = Math.round(t * RATE), len = Math.min(S.n - n0, Math.round(dauer * RATE)); if (len <= 0 || n0 < 0) return;
  const P = RATE / f, N = Math.max(2, Math.floor(P + 0.4)), bruch = P + 0.5 - N, C = (1 - bruch) / (1 + bruch), d = new Float32Array(N);
  let vor = 0, mitte = 0;
  for (let i = 0; i < N; i++) { vor += (0.15 + 0.85 * hell) * ((S.z() * 2 - 1) - vor); d[i] = vor; mitte += vor; }
  mitte /= N; let gr = 1e-6; for (let i = 0; i < N; i++) { d[i] -= mitte; gr = Math.max(gr, Math.abs(d[i])); } for (let i = 0; i < N; i++) d[i] /= gr;
  const daempf = Math.pow(0.5, 1 / (f * halb)), [gl, gr2] = lr(laut, lage), hm = laut * hall * 0.7, aus = Math.min(len, Math.round(0.03 * RATE));
  let p = 0, x1 = 0, y1 = 0;
  for (let i = 0; i < len; i++) {
    const q = p + 1 === N ? 0 : p + 1, v = d[p], m = (v + d[q]) * 0.5 * daempf, y = C * m + x1 - C * y1; x1 = m; y1 = y; d[p] = y; p = q;
    const w = v * (i > len - aus ? (len - i) / aus : 1), k = n0 + i;
    S.l[k] += w * gl; S.r[k] += w * gr2; S.h[k] += w * hm;
  }
}
/** Weiche Fläche: mehrere Töne, je zwei leicht verstimmte Schwingungen links und rechts. */
function flaeche(S, t, dauer, toene, laut, an = 0.9, ab = 1.4, hall = 0.55) {
  const n0 = Math.round(t * RATE), len = Math.min(S.n - n0, Math.round((dauer + ab) * RATE)); if (len <= 0) return;
  const A = Math.round(an * RATE), H = Math.round(dauer * RATE), B = Math.round(ab * RATE), g = laut / Math.sqrt(toene.length);
  const ph = toene.map(() => [S.z(), S.z()]), sch = toene.map((f) => [f * 0.9977 / RATE, f * 1.0023 / RATE]);
  for (let i = 0; i < len; i++) {
    const e = i < A ? i / A : i > H ? Math.max(0, 1 - (i - H) / B) : 1, h = e * e * (3 - 2 * e); let a = 0, b = 0;
    for (let j = 0; j < toene.length; j++) { const p = ph[j], s = sch[j]; p[0] += s[0]; if (p[0] >= 1) p[0] -= 1; p[1] += s[1]; if (p[1] >= 1) p[1] -= 1; a += lies(T_FLAECHE, p[0]); b += lies(T_FLAECHE, p[1]); }
    const k = n0 + i, x = (a * 0.8 + b * 0.2) * g * h, y = (b * 0.8 + a * 0.2) * g * h;
    S.l[k] += x; S.r[k] += y; S.h[k] += (x + y) * 0.5 * hall;
  }
}
/** Klavierartiger Ton: heller Anschlag, der schnell weich wird; zwei leicht verstimmte Saiten. */
function klavier(S, t, f, dauer, laut, lage = 0, hall = 0.35) {
  const n0 = Math.round(t * RATE), aus = Math.round(0.28 * RATE), len = Math.min(S.n - n0, Math.round(dauer * RATE) + aus); if (len <= 0 || n0 < 0) return;
  const tau = Math.min(3.6, Math.max(0.5, 2.3 * Math.pow(220 / f, 0.45))) * RATE, an = Math.round(0.004 * RATE), H = len - aus, [gl, gr] = lr(laut, lage), hm = laut * hall * 0.7;
  let p1 = 0, p2 = 0.31; const s1 = f * 0.9991 / RATE, s2 = f * 1.0009 / RATE;
  for (let i = 0; i < len; i++) {
    p1 += s1; if (p1 >= 1) p1 -= 1; p2 += s2; if (p2 >= 1) p2 -= 1;
    const e = Math.exp(-i / tau) * (i < an ? i / an : 1) * (i > H ? Math.max(0, 1 - (i - H) / aus) : 1), hell = Math.exp(-i / (tau * 0.22));
    const v = ((lies(T_WEICH, p1) + lies(T_WEICH, p2)) * 0.5 * (1 - 0.45 * hell) + (lies(T_HELL, p1) + lies(T_HELL, p2)) * 0.5 * 0.45 * hell) * e, k = n0 + i;
    S.l[k] += v * gl; S.r[k] += v * gr; S.h[k] += v * hm;
  }
}
function bass(S, t, f, dauer, laut) {
  const n0 = Math.round(t * RATE), aus = Math.round(0.06 * RATE), len = Math.min(S.n - n0, Math.round(dauer * RATE) + aus); if (len <= 0 || n0 < 0) return;
  const an = Math.round(0.008 * RATE), H = len - aus, tau = 0.9 * RATE, s = f / RATE; let p = 0;
  for (let i = 0; i < len; i++) { p += s; if (p >= 1) p -= 1; const v = lies(T_BASS, p) * laut * (0.35 + 0.65 * Math.exp(-i / tau)) * (i < an ? i / an : 1) * (i > H ? Math.max(0, 1 - (i - H) / aus) : 1), k = n0 + i; S.l[k] += v; S.r[k] += v; }
}
function trommel(S, t, laut) {      // große Trommel: ein Ton, der schnell nach unten fällt
  const n0 = Math.round(t * RATE), len = Math.min(S.n - n0, Math.round(0.42 * RATE)); if (len <= 0 || n0 < 0) return; let ph = 0;
  for (let i = 0; i < len; i++) { const s = i / RATE; ph += (44 + 115 * Math.exp(-s / 0.028)) / RATE; const v = Math.sin(2 * Math.PI * ph) * Math.exp(-s / 0.16) * laut * (i < 40 ? i / 40 : 1), k = n0 + i; S.l[k] += v; S.r[k] += v; }
}
function rauschen(S, t, laut, lage, dauer, abkling, anstieg = 0.001, hoch = 0.75, ton = 0, hall = 0.12) {      // Becken, Rassel, kleine Trommel – gefiltertes Rauschen
  const n0 = Math.round(t * RATE), len = Math.min(S.n - n0, Math.round(dauer * RATE)); if (len <= 0 || n0 < 0) return;
  const [gl, gr] = lr(laut, lage), hm = laut * hall * 0.7, A = Math.max(1, Math.round(anstieg * RATE)); let tief = 0, ph = 0;
  for (let i = 0; i < len; i++) {
    const r = S.z() * 2 - 1; tief += (1 - hoch) * (r - tief); const s = i / RATE; let v = (r - tief) * Math.exp(-s / abkling);
    if (ton) { ph += ton / RATE; v = v * 0.7 + Math.sin(2 * Math.PI * ph) * Math.exp(-s / 0.06) * 0.6; }
    v *= (i < A ? i / A : 1) * (i > len - 60 ? (len - i) / 60 : 1); const k = n0 + i;
    S.l[k] += v * gl; S.r[k] += v * gr; S.h[k] += v * hm;
  }
}
/** Hall: vier Kämme und zwei Allpässe je Seite (links und rechts leicht verschieden lang → Raum). */
function hall(ein, versatz) {
  const n = ein.length, aus = new Float32Array(n);
  for (const L of [811, 863, 929, 983]) { const N = L + versatz, d = new Float32Array(N); let p = 0, f = 0; for (let i = 0; i < n; i++) { const y = d[p]; f = y * 0.72 + f * 0.28; d[p] = ein[i] + f * 0.83; aus[i] += y; if (++p === N) p = 0; } }
  for (const L of [401, 317]) { const N = L + versatz, d = new Float32Array(N); let p = 0; for (let i = 0; i < n; i++) { const b = d[p], x = aus[i]; d[p] = x + b * 0.5; aus[i] = b - x * 0.5; if (++p === N) p = 0; } }
  return aus;
}

// ───────────────────────── Das Stück ─────────────────────────
/**
 * Erzeugt ein Musikstück. → { l, r, rate, dauer }
 * @param stil      Schlüssel aus MUSIK_STILE
 * @param sekunden  Länge (8 … 180)
 * @param variante  1, 2, 3 … – andere Akkordfolge und andere Melodie
 */
export async function erzeuge(stil, sekunden, variante = 1, melde = () => {}) {
  const E = EINSTELLUNG[stil] || EINSTELLUNG.heiter, name = EINSTELLUNG[stil] ? stil : 'heiter';
  const dauer = Math.min(LAENGE_HOECHSTENS, Math.max(8, Math.round(sekunden))), n = Math.round(dauer * RATE);
  const z = zufall(Object.keys(EINSTELLUNG).indexOf(name) * 1009 + variante * 7919 + 17);
  const S = { n, l: new Float32Array(n), r: new Float32Array(n), h: new Float32Array(n), z };
  const schlag = 60 / E.bpm, takt = 4 * schlag, leiter = E.moll ? MOLL : DUR, penta = E.moll ? PENTA_MOLL : PENTA_DUR;
  const takte = Math.max(2, Math.floor((dauer - Math.min(3, dauer * 0.2)) / takt)), schluss = takte - 1;      // der letzte Takt ist der Schlussakkord, danach klingt es aus
  const folgeA = E.folgen[(variante - 1) % E.folgen.length], folgeB = E.folgen[variante % E.folgen.length];
  const ton = (stufe, oktave = 0) => E.grund + 12 * (oktave + Math.floor(stufe / 7)) + leiter[((stufe % 7) + 7) % 7];
  const akkord = (stufe, oktave) => [ton(stufe, oktave), ton(stufe + 2, oktave), ton(stufe + 4, oktave)];
  // Aufbau: Vorspiel (leise) – dann im Wechsel Teil A und Teil B zu je 8 Takten – vor dem Schluss wieder leiser.
  const vor = E.bpm < 80 ? 2 : 4;
  const teil = (b) => { if (takte < 8) return { st: 2, a: true, i: b }; if (b < vor) return { st: 1, a: true, i: b }; const k = b - vor, blk = Math.floor(k / 8), a = blk % 2 === 0; if (takte >= 20 && b >= schluss - 4) return { st: 1, a: true, i: k % 8 }; return { st: a ? 2 : 3, a, i: k % 8 }; };
  const stufeVon = (b) => { if (b >= schluss) return 0; const x = teil(b); return (x.a ? folgeA : folgeB)[x.i % 4]; };
  // Melodie: je Teil ein Motiv über 8 Takte, das bei jeder Wiederkehr gleich bleibt (so prägt es sich ein).
  const motiv = (dichte) => { const aus = []; let lage = 2 + Math.floor(z() * 3);
    for (let b = 0; b < 8; b++) { const noten = [];
      if (b === 7) { noten.push([0, 3, -1]); aus.push(noten); continue; }                 // letzter Takt: langer Ton auf dem Akkord
      for (let s = 0; s < 4;) { const lang = z() < dichte ? (z() < 0.5 ? 0.5 : 1) : (z() < 0.6 ? 2 : 1); if (z() < 0.14 && s > 0) { s += lang; continue; }
        lage = Math.max(0, Math.min(9, lage + [-2, -1, -1, 0, 1, 1, 2][Math.floor(z() * 7)])); noten.push([s, Math.min(lang, 4 - s), lage]); s += lang; }
      aus.push(noten); }
    return aus; };
  const mA = motiv(name === 'schwung' ? 0.75 : name === 'heiter' ? 0.6 : 0.3), mB = motiv(name === 'schwung' ? 0.8 : name === 'heiter' ? 0.7 : 0.4);
  const mel = (lage, stufe, okt) => (lage < 0 ? ton(stufe + [0, 2, 4][Math.floor(z() * 3) % 3], okt) : ton(penta[lage % 5], okt + Math.floor(lage / 5)));
  const fein = () => (z() - 0.5) * 0.012;          // kleine Ungenauigkeit im Anschlag, damit es nicht wie eine Maschine klingt

  for (let b = 0; b <= schluss; b++) {
    if (b % 8 === 0) { melde(b / (schluss + 1) * 0.8); await pause(); }
    const t0 = 0.05 + b * takt, x = teil(b), st = b === schluss ? 2 : x.st, stufe = stufeVon(b), ende = b === schluss, m = (x.a ? mA : mB)[x.i] || [];
    if (name === 'ruhig') {
      flaeche(S, t0, ende ? takt * 1.2 : takt, [hz(ton(stufe, 0)), ...akkord(stufe, 1).map(hz)], 0.15, 1.2, ende ? 3 : 1.6);
      if (st >= 2 || ende) bass(S, t0, hz(ton(stufe, -1)), ende ? takt * 1.5 : takt * 0.95, 0.2);
      if (ende) { akkord(0, 2).forEach((q, i) => zupf(S, t0 + i * 0.09, hz(q), 4, 0.2, i - 1, 0.35, 0.6, 1.6)); continue; }
      if (st >= 2) { const a = akkord(stufe, 2), reihe = [a[0], a[2], a[1] + 12, a[2], a[0] + 12, a[2], a[1] + 12, a[2]]; for (let i = 0; i < 8; i++) zupf(S, t0 + i * schlag / 2 + fein(), hz(reihe[i]), schlag * 2.2, 0.11 + (i % 4 === 0 ? 0.04 : 0), i % 2 ? 0.45 : -0.45, 0.32, 0.55, 1.2); }
      if (st >= 3) for (const [s, lang, lage] of m) if (lang >= 1) klavier(S, t0 + s * schlag + fein(), hz(mel(lage, stufe, 2)), lang * schlag, 0.15, 0.15, 0.6);
    } else if (name === 'heiter') {
      const a = akkord(stufe, 1), saiten = [a[0], a[2], a[0] + 12, a[1] + 12];
      if (ende) { saiten.forEach((q, i) => zupf(S, t0 + i * 0.03, hz(q), 4, 0.24, (i - 1.5) * 0.4, 0.6, 0.4, 1.6)); bass(S, t0, hz(ton(0, 0)), takt, 0.24); trommel(S, t0, 0.5); continue; }
      [0, 1, 1.5, 2.5, 3, 3.5].forEach((s, k) => { const ab = k % 2 === 0, laut = s === 0 ? 0.19 : 0.14; (ab ? saiten : [...saiten].reverse().slice(0, 3)).forEach((q, i) => zupf(S, t0 + s * schlag + i * 0.012 + fein(), hz(q), schlag * 1.6, laut, (i - 1.5) * 0.35, ab ? 0.55 : 0.7, 0.3, 0.7)); });
      bass(S, t0, hz(ton(stufe, 0)), schlag * 1.7, 0.2); bass(S, t0 + 2 * schlag, hz(ton(stufe + 4, -1)), schlag * 1.7, 0.17);
      if (st >= 2) { trommel(S, t0, 0.34); trommel(S, t0 + 2 * schlag, 0.28);
        for (let i = 0; i < 8; i++) rauschen(S, t0 + i * schlag / 2 + fein(), i % 2 ? 0.05 : 0.035, 0.3, 0.09, 0.03, 0.012, 0.6); }
      if (st >= 3) { rauschen(S, t0 + schlag, 0.13, -0.1, 0.16, 0.05, 0.001, 0.5, 210, 0.25); rauschen(S, t0 + 3 * schlag, 0.13, -0.1, 0.16, 0.05, 0.001, 0.5, 210, 0.25); }
      if (st >= 2) for (const [s, lang, lage] of m) zupf(S, t0 + s * schlag + fein(), hz(mel(lage, stufe, 2)), Math.max(0.5, lang * schlag * 1.5), 0.2, -0.2, 0.85, 0.45, 0.8);
    } else if (name === 'schwung') {
      flaeche(S, t0, ende ? takt * 1.4 : takt, akkord(stufe, 1).map(hz), 0.14, 0.25, ende ? 2.5 : 0.5, 0.4);
      if (ende) { trommel(S, t0, 0.6); bass(S, t0, hz(ton(0, 0)), takt * 1.2, 0.3); rauschen(S, t0, 0.1, 0.2, 1.4, 0.5, 0.002, 0.8, 0, 0.5); akkord(0, 2).forEach((q, i) => zupf(S, t0 + i * 0.02, hz(q), 3.5, 0.2, i - 1, 0.8, 0.5, 1.4)); continue; }
      for (let i = 0; i < 8; i++) bass(S, t0 + i * schlag / 2, hz(ton(stufe, i === 7 ? 1 : 0)), schlag * 0.42, i % 2 ? 0.11 : 0.15);
      for (let i = 0; i < 4; i++) if (st >= 2 || i % 2 === 0) trommel(S, t0 + i * schlag, 0.36);
      if (st >= 2) { rauschen(S, t0 + schlag, 0.2, 0, 0.2, 0.07, 0.001, 0.45, 185, 0.22); rauschen(S, t0 + 3 * schlag, 0.2, 0, 0.2, 0.07, 0.001, 0.45, 185, 0.22);
        for (let i = 0; i < (st >= 3 ? 16 : 8); i++) { const s = st >= 3 ? i * schlag / 4 : (i + 0.5) * schlag / 2; rauschen(S, t0 + s, st >= 3 && i % 4 !== 2 ? 0.05 : 0.09, 0.35, 0.05, 0.016, 0.001, 0.85, 0, 0.08); } }
      if (st >= 3) { const a = akkord(stufe, 2), reihe = [a[0], a[1], a[2], a[0] + 12, a[2], a[1], a[2], a[0] + 12]; for (let i = 0; i < 16; i++) zupf(S, t0 + i * schlag / 4, hz(reihe[i % 8]), schlag * 0.7, 0.11, i % 2 ? 0.55 : -0.55, 0.75, 0.4, 0.35); }
      if (st >= 2) for (const [s, lang, lage] of m) klavier(S, t0 + s * schlag, hz(mel(lage, stufe, 2)), Math.max(0.2, lang * schlag * 0.9), 0.21, -0.15, 0.45);
    } else {     // klavier
      const a = akkord(stufe, 0);
      if (ende) { [a[0] - 12, a[0], a[2], a[1] + 12, a[0] + 24].forEach((q, i) => klavier(S, t0 + i * 0.07, hz(q), 5, i ? 0.2 : 0.26, (i - 2) * 0.2, 0.55)); continue; }
      const reihe = [a[0] - 12, a[2] - 12, a[0], a[1], a[2], a[1], a[0], a[2] - 12];
      for (let i = 0; i < 8; i++) klavier(S, t0 + i * schlag / 2 + fein(), hz(reihe[i]), schlag * (i === 0 ? 3.5 : 1.4), (i === 0 ? 0.24 : 0.14) * (0.9 + z() * 0.2), -0.25, 0.4);
      if (st >= 2) for (const [s, lang, lage] of m) { const q = mel(lage, stufe, 2); klavier(S, t0 + s * schlag + fein(), hz(q), lang * schlag * 1.1, 0.24 * (0.85 + z() * 0.3), 0.25, 0.5); if (st >= 3 && lang >= 2) klavier(S, t0 + s * schlag + fein(), hz(q - (E.moll ? 3 : 4)), lang * schlag, 0.1, 0.35, 0.5); }
      if (st >= 3) flaeche(S, t0, takt, [hz(a[0]), hz(a[2])], 0.05, 1.5, 1.8, 0.6);
    }
  }
  melde(0.85); await pause();
  const wl = hall(S.h, 0), wr = hall(S.h, 23), l = S.l, r = S.r, nass = name === 'schwung' ? 0.11 : 0.16;
  let q = 0; for (let i = 0; i < n; i++) { l[i] += wl[i] * nass; r[i] += wr[i] * nass; q += l[i] * l[i] + r[i] * r[i]; }
  // Lautheit angleichen (gleich laut für alle Stile), Spitzen weich begrenzen, am Anfang und Ende blenden.
  const g = 0.115 / Math.max(1e-6, Math.sqrt(q / (2 * n))), ein = Math.round(0.03 * RATE), aus = Math.round(Math.min(2.6, dauer * 0.25) * RATE);
  for (let i = 0; i < n; i++) { const b = (i < ein ? i / ein : 1) * (i > n - aus ? 0.5 - 0.5 * Math.cos(Math.PI * (n - i) / aus) : 1); l[i] = Math.tanh(l[i] * g * 1.15) / 1.15 * b; r[i] = Math.tanh(r[i] * g * 1.15) / 1.15 * b; }
  melde(1);
  return { l, r, rate: RATE, dauer };
}

/** WAV-Datei (16 Bit, zwei Kanäle) aus zwei Spuren. */
export function alsWav(l, r, rate = RATE) {
  const n = l.length, puffer = new ArrayBuffer(44 + n * 4), v = new DataView(puffer), text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); text(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, n * 4, true);
  const d = new Int16Array(puffer, 44, n * 2);
  for (let i = 0; i < n; i++) { d[i * 2] = Math.max(-32767, Math.min(32767, Math.round(l[i] * 32767))); d[i * 2 + 1] = Math.max(-32767, Math.min(32767, Math.round(r[i] * 32767))); }
  return new Blob([puffer], { type: 'audio/wav' });
}
export const musikName = (stil, sekunden, variante = 1) => { const s = Math.min(LAENGE_HOECHSTENS, Math.max(8, Math.round(sekunden))); return `App-Musik ${(MUSIK_STILE[stil] || MUSIK_STILE.heiter)[0]}${variante > 1 ? ' ' + variante : ''} ${Math.floor(s / 60)}-${String(s % 60).padStart(2, '0')}.wav`; };
/** Das Stück als Datei (für die Mediathek). Gleicher Name und gleiche Größe = dasselbe Stück – die Mediathek legt es dann nicht doppelt an. */
export async function musikDatei(stil, sekunden, variante = 1, melde) {
  const k = await erzeuge(stil, sekunden, variante, melde);
  return new File([alsWav(k.l, k.r, k.rate)], musikName(stil, sekunden, variante), { type: 'audio/wav', lastModified: 1763000000000 });
}
