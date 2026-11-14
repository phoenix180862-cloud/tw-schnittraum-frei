// TW Schnittraum – Gesichter finden, Rechenkern (ohne Oberfläche und ohne Rechenwerk): das Bild für den Gesichtsfinder vorbereiten,
// seine Antwort auswerten, doppelte Funde aussortieren und aus den Funden vieler Bilder Spuren bilden, denen eine „Stelle im Bild“ folgt.
// Alle Lagen sind Anteile des Bildes (0 … 1): x, y = Mitte, w, h = Breite und Höhe. Zeiten in Sekunden der Quelle.
// Der Gesichtsfinder ist YuNet (Shiqi Yu u. a., BSD 3-Clause) – siehe lib/gesicht/LIESMICH.txt. Er findet Gesichter, er erkennt keine Personen.

const SCHRITTE = [8, 16, 32];
const klemm = (v, a, b) => Math.min(b, Math.max(a, v));
const rund4 = (v) => Math.round(v * 1e4) / 1e4;

/** Eingangsgröße für ein Bild b × h: lange Seite = lang, das Feld darum hat durch 32 teilbare Seiten. → { w, h, W, H } */
export function eingang(b, h, lang = 640) {
  const k = lang / Math.max(b, h, 1), w = Math.max(16, Math.round(b * k)), hh = Math.max(16, Math.round(h * k));
  return { w, h: hh, W: Math.ceil(w / 32) * 32, H: Math.ceil(hh / 32) * 32 };
}

/** Bildpunkte (RGBA, W × H) → Zahlenfeld für den Gesichtsfinder: Blau, Grün, Rot je als eigene Ebene, Werte 0 … 255. */
export function vorbereiten(rgba, W, H) {
  const n = W * H, x = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { x[i] = rgba[j + 2]; x[n + i] = rgba[j + 1]; x[2 * n + i] = rgba[j]; }
  return x;
}

/** Antwort des Gesichtsfinders auswerten. aus = { cls_8, obj_8, bbox_8, … } (Zahlenfelder), Feld W × H, Bildinhalt w × h. → Funde [{ x, y, w, h, wert }] */
export function auswerten(aus, W, H, w, h, grenze = 0.35) {
  const funde = [];
  for (const st of SCHRITTE) {
    const cols = W / st, rows = H / st, cls = aus['cls_' + st], obj = aus['obj_' + st], box = aus['bbox_' + st];
    if (!cls || !obj || !box || cls.length < cols * rows) continue;
    for (let i = 0, n = cols * rows; i < n; i++) {
      const a = klemm(cls[i], 0, 1), b = klemm(obj[i], 0, 1), wert = Math.sqrt(a * b);
      if (!(wert >= grenze)) continue;
      const r = Math.floor(i / cols), c = i - r * cols;
      const bw = Math.exp(box[i * 4 + 2]) * st, bh = Math.exp(box[i * 4 + 3]) * st;
      if (!(bw > 2 && bh > 2) || !Number.isFinite(bw + bh)) continue;
      funde.push({ x: (c + box[i * 4]) * st / w, y: (r + box[i * 4 + 1]) * st / h, w: bw / w, h: bh / h, wert });
    }
  }
  return funde;
}

/** Wie stark überdecken sich zwei Funde? (gemeinsame Fläche durch Gesamtfläche, 0 … 1) */
export function ueberdeckung(a, b) {
  const x1 = Math.max(a.x - a.w / 2, b.x - b.w / 2), x2 = Math.min(a.x + a.w / 2, b.x + b.w / 2), y1 = Math.max(a.y - a.h / 2, b.y - b.h / 2), y2 = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  const s = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return s / (a.w * a.h + b.w * b.h - s + 1e-12);
}

/** Doppelte Funde aussortieren: Der sicherste bleibt, was sich stark mit ihm überdeckt, fällt weg. Funde am Bildrand außerhalb des Bildes fallen ebenfalls weg. */
export function auslese(funde, grenze = 0.3) {
  const aus = [];
  for (const f of [...funde].sort((a, b) => b.wert - a.wert)) {
    if (f.x < -0.02 || f.x > 1.02 || f.y < -0.02 || f.y > 1.02) continue;
    if (aus.every((g) => ueberdeckung(f, g) < grenze)) aus.push(f);
  }
  return aus;
}

// Abstand zweier Funde in Gesichtsgrößen (Seitenverhältnis des Bildes berücksichtigt): 0 = gleiche Stelle, 1 = eine Gesichtsbreite daneben.
function abstand(a, b, seite) {
  const gr = Math.max(a.w * seite, a.h, b.w * seite, b.h, 1e-6);
  return Math.hypot((a.x - b.x) * seite, a.y - b.y) / gr;
}

/**
 * Aus den Funden vieler Bilder werden Spuren. messungen = [{ t, funde }] in zeitlicher Folge, seite = Breite durch Höhe des Bildes.
 * Ein Gesicht darf kurz verschwinden (luecke Sekunden), ohne dass die Spur reißt. Was nur einmal schwach aufblitzt, gilt nicht als Gesicht.
 * → [{ punkte: [{ t, x, y, w, h, wert }], von, bis, wert, gewicht }] – wichtigste zuerst (groß und lange im Bild)
 */
export function spuren(messungen, seite = 16 / 9, o = {}) {
  const neuAb = o.neuAb ?? 0.6, luecke = o.luecke ?? 1.0, weit = o.weit ?? 1.6, einzeln = messungen.length <= 1;
  const laufend = [], fertig = [];
  for (const m of messungen) {
    for (let i = laufend.length - 1; i >= 0; i--) if (m.t - laufend[i].letzt.t > luecke + 1e-6) fertig.push(laufend.splice(i, 1)[0]);
    const paare = [];
    for (let i = 0; i < laufend.length; i++) for (let j = 0; j < m.funde.length; j++) {
      const L = laufend[i].letzt, f = m.funde[j], d = abstand(L, f, seite), fl = (f.w * f.h) / Math.max(1e-9, L.w * L.h);
      if (d < weit && fl > 0.3 && fl < 3.3) paare.push([d, i, j]);
    }
    paare.sort((a, b) => a[0] - b[0]);
    const vergebenS = new Set(), vergebenF = new Set();
    for (const [, i, j] of paare) {
      if (vergebenS.has(i) || vergebenF.has(j)) continue;
      vergebenS.add(i); vergebenF.add(j);
      const p = { t: m.t, ...m.funde[j] }; laufend[i].punkte.push(p); laufend[i].letzt = p;
    }
    for (let j = 0; j < m.funde.length; j++) if (!vergebenF.has(j) && m.funde[j].wert >= neuAb) { const p = { t: m.t, ...m.funde[j] }; laufend.push({ punkte: [p], letzt: p }); }
  }
  fertig.push(...laufend);
  // Was derselbe Kopf ist, gehört zusammen: Reißt eine Spur und beginnt bald darauf an derselben Stelle eine neue, wird daraus eine.
  fertig.sort((a, b) => a.punkte[0].t - b.punkte[0].t);
  const bruecke = o.bruecke ?? 2.5;
  for (let i = 0; i < fertig.length; i++) for (let j = i + 1; j < fertig.length; j++) {
    const A = fertig[i], B = fertig[j], a = A.punkte[A.punkte.length - 1], b = B.punkte[0];
    if (b.t > a.t && b.t - a.t <= bruecke && abstand(a, b, seite) < weit) { A.punkte.push(...B.punkte); fertig.splice(j, 1); j = i; }
  }
  const aus = [];
  for (const s of fertig) {
    const P = s.punkte, wert = Math.max(...P.map((p) => p.wert));
    if (!einzeln && !(P.length >= 3 || (P.length >= 2 && wert >= 0.7) || wert >= 0.85)) continue;      // einmal schwach aufgeblitzt: kein Gesicht
    const flaeche = P.reduce((n, p) => n + p.w * p.h, 0) / P.length;
    aus.push({ punkte: P, von: P[0].t, bis: P[P.length - 1].t, wert, gewicht: flaeche * (1 + Math.min(10, P[P.length - 1].t - P[0].t)) });
  }
  return aus.sort((a, b) => b.gewicht - a.gewicht);
}

/**
 * Aus einer Spur wird der Lauf einer Stelle: [[t, x, y, w, h], …]. Um das Gesicht herum kommt etwas Luft (Stirn, Kinn, Wangen).
 * Geglättet wird nur gegen das Zittern – bewegt sich das Gesicht zügig, bleibt der gemessene Ort (sonst liefe die Stelle hinterher), und die
 * Stelle wird etwas größer, weil das Gesicht zwischen zwei Messungen weiterläuft. Vor dem ersten und nach dem letzten Fund läuft die Stelle
 * ein Stück in der letzten Richtung weiter – so bleibt ein Gesicht bedeckt, das gerade ins Bild kommt oder es verlässt.
 */
export function alsLauf(spur, o = {}) {
  const P = spur.punkte, n = P.length, lb = o.breiter ?? 1.3, lh = o.hoeher ?? 1.5, hoch = o.hoch ?? 0.05, seite = o.seite || 16 / 9, weiter = o.weiter ?? 0.4;
  const nah = (a, b) => a && b && Math.abs(b.t - a.t) <= 0.6;      // Nachbarn im Takt der Messung (keine Lücke dazwischen)
  const ruhig = (i) => nah(P[i - 1], P[i]) && nah(P[i], P[i + 1]) && Math.hypot((P[i + 1].x - P[i - 1].x) * seite, P[i + 1].y - P[i - 1].y) < 0.5 * Math.max(P[i].w * seite, P[i].h);
  const ort = (i, f) => (ruhig(i) ? (f(P[i - 1]) + 2 * f(P[i]) + f(P[i + 1])) / 4 : f(P[i]));
  const groesse = (i, f) => { let su = 0, g = 0; for (let k = -2; k <= 2; k++) { const p = P[i + k]; if (!p || Math.abs(p.t - P[i].t) > 1.2) continue; const w = 3 - Math.abs(k); su += f(p) * w; g += w; } return su / g; };
  const lauf = [];
  for (let i = 0; i < n; i++) {
    const v = P[i - 1], z = P[i + 1], p = P[i];
    const dx = Math.max(nah(v, p) ? Math.abs(p.x - v.x) : 0, nah(p, z) ? Math.abs(z.x - p.x) : 0), dy = Math.max(nah(v, p) ? Math.abs(p.y - v.y) : 0, nah(p, z) ? Math.abs(z.y - p.y) : 0);
    const w0 = groesse(i, (q) => q.w) * lb, h0 = groesse(i, (q) => q.h) * lh, w = w0 + Math.min(dx * 0.7, w0 * 0.7), h = h0 + Math.min(dy * 0.7, h0 * 0.7);
    lauf.push([rund4(p.t), rund4(ort(i, (q) => q.x)), rund4(ort(i, (q) => q.y) - h0 * hoch), rund4(w), rund4(h)]);
  }
  // Punkte weglassen, die sich aus ihren Nachbarn von selbst ergeben (spart Platz im gesicherten Film)
  const tx = o.genau ?? 0.004, behalten = [0];
  for (let i = 1; i < n - 1; i++) {
    const a = lauf[behalten[behalten.length - 1]], b = lauf[i + 1], c = lauf[i], k = (c[0] - a[0]) / Math.max(1e-6, b[0] - a[0]);
    let noetig = b[0] - a[0] > 1.2;       // spätestens nach gut einer Sekunde wieder ein fester Punkt
    for (let j = 1; j <= 4 && !noetig; j++) { const soll = a[j] + (b[j] - a[j]) * k, tol = j <= 2 ? tx : Math.max(tx, c[j] * 0.05); if (Math.abs(soll - c[j]) > tol) noetig = true; }
    if (noetig) behalten.push(i);
  }
  if (n > 1) behalten.push(n - 1);
  const aus = behalten.map((i) => lauf[i]);
  // weiterlaufen: vor dem ersten und nach dem letzten Fund in der zuletzt gemessenen Richtung (nur bei Videos mit wenigstens zwei Funden im Takt)
  if (n > 1 && weiter > 0) {
    const fort = (a, b, t) => { const dt = b[0] - a[0]; return [rund4(b[0] + t), rund4(b[1] + (b[1] - a[1]) / dt * t), rund4(b[2] + (b[2] - a[2]) / dt * t), b[3], b[4]]; };
    if (nah(P[0], P[1])) aus.unshift(fort(lauf[1], lauf[0], -weiter));
    if (nah(P[n - 2], P[n - 1])) aus.push(fort(lauf[n - 2], lauf[n - 1], weiter));
  }
  return aus;
}

/**
 * Viele Spuren auf wenige Stellen verteilen: Gesichter, die nacheinander im Bild sind, teilen sich eine Stelle (dazwischen ist sie unsichtbar).
 * laeufe = [[[t, x, y, w, h], …], …] (wichtigste zuerst), plaetze = freie Stellen. → { stellen: [Lauf, …], uebrig: Anzahl der Läufe ohne Platz }
 */
export function verteile(laeufe, plaetze, pause = 1.5) {
  const stellen = [], reihen = [], rest = [];
  for (const L of laeufe) {
    const von = L[0][0], bis = L[L.length - 1][0];
    let platz = reihen.findIndex((R) => R.every(([a, b]) => von > b + pause || bis < a - pause));
    if (platz < 0 && reihen.length < plaetze) { reihen.push([]); stellen.push([]); platz = reihen.length - 1; }
    if (platz < 0) { rest.push(L); continue; }
    reihen[platz].push([von, bis]); stellen[platz].push(L);
  }
  const aus = stellen.map((teile) => {
    teile.sort((a, b) => a[0][0] - b[0][0]);
    const lauf = [];
    teile.forEach((L, i) => {
      if (i) { const v = lauf[lauf.length - 1], e = L[0]; lauf.push([rund4(v[0] + 0.5), v[1], v[2], 0, 0], [rund4(e[0] - 0.3), e[1], e[2], 0, 0]); }   // dazwischen unsichtbar
      lauf.push(...L);
    });
    return lauf;
  });
  return { stellen: aus, uebrig: rest.length };
}

/** Funde aus einem gedrehten oder gespiegelten Bild zurück in das Quellbild rechnen (grad = 0, 90, 180, 270 im Uhrzeigersinn; spiegel = seitenverkehrt). */
export function zurueck(f, grad = 0, spiegel = false) {
  const g = ((Math.round(grad / 90) % 4) + 4) % 4;
  let x = f.x - 0.5, y = f.y - 0.5, w = f.w, h = f.h;
  if (g === 1) { [x, y] = [y, -x]; [w, h] = [h, w]; } else if (g === 2) { x = -x; y = -y; } else if (g === 3) { [x, y] = [-y, x]; [w, h] = [h, w]; }
  if (spiegel) x = -x;
  return { ...f, x: x + 0.5, y: y + 0.5, w, h };
}
