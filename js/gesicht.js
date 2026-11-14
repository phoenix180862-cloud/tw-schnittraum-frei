// TW Schnittraum – Gesichter finden (im Gerät): holt Bilder aus einem Clip, lässt sie vom Arbeiter im Hintergrund absuchen und bildet
// daraus „Stellen im Bild“, die mit dem Gesicht mitlaufen. Es wird nichts hochgeladen. Der Gesichtsfinder findet Gesichter –
// er erkennt keine Personen und merkt sich niemanden.
import { eingang, spuren, alsLauf, verteile, zurueck } from './gesicht-kern.js';
import { neueStelle, STELLEN_HOECHSTENS } from './effekte.js';

let arbeiter = null, ladeP = null, zaehler = 0, beiLaden = null, feld = null;
const offen = new Map();               // Auftragsnummer → { ok, nein }
const LANG = { normal: 640, gruendlich: 1280 };

function start() {
  if (arbeiter) return;
  arbeiter = new Worker(new URL('./gesicht-worker.js', import.meta.url), { type: 'module' });
  arbeiter.onmessage = (ev) => {
    const d = ev.data, a = offen.get(d.nr);
    if (d.art === 'laden') { if (beiLaden) beiLaden(d.anteil); }
    else if (d.art === 'fertig') { if (a) { offen.delete(d.nr); a.ok(d); } }
    else if (d.art === 'bereit') { const l = offen.get('lade'); if (l) { offen.delete('lade'); l.ok(d); } }
    else if (d.art === 'fehler') { const k = d.bei === 'lade' ? 'lade' : d.nr, z = offen.get(k); if (z) { offen.delete(k); z.nein(new Error(d.text)); } }
  };
  arbeiter.onerror = (ev) => { for (const z of offen.values()) z.nein(new Error(ev.message || 'Der Gesichtsfinder konnte nicht starten.')); offen.clear(); ladeP = null; arbeiter = null; };
}

/** Den Gesichtsfinder laden (einmal; beim ersten Mal aus dem Netz, danach aus dem Gerät). melde(anteil 0 … 1) */
export function ladeGesichtsfinder(melde) {
  start(); beiLaden = melde || null;
  if (!ladeP) { ladeP = new Promise((ok, nein) => { offen.set('lade', { ok, nein }); arbeiter.postMessage({ art: 'lade' }); }); ladeP.catch(() => { ladeP = null; }); }
  return ladeP;
}

/**
 * Ein Bild absuchen. quelle = Bild, Zeichenfläche oder Videobild mit b × h Bildpunkten. o: { grad, spiegel } = so liegt das Bild im Film
 * (gesucht wird im aufrechten Bild), lang = lange Seite beim Suchen, grenze = Mindestsicherheit. → { funde: [{ x, y, w, h, wert }] im Quellbild, ms }
 */
export async function findeImBild(quelle, b, h, o = {}) {
  await ladeGesichtsfinder(beiLaden);
  const grad = o.grad || 0, quer = grad % 180 !== 0, E = eingang(quer ? h : b, quer ? b : h, o.lang || LANG.normal);
  if (!feld) feld = document.createElement('canvas');
  if (feld.width !== E.W || feld.height !== E.H) { feld.width = E.W; feld.height = E.H; }
  const x = feld.getContext('2d', { willReadFrequently: true }), zw = quer ? E.h : E.w, zh = quer ? E.w : E.h;
  x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'medium';
  x.fillStyle = '#000'; x.fillRect(0, 0, E.W, E.H);
  x.translate(E.w / 2, E.h / 2); x.rotate(grad * Math.PI / 180); if (o.spiegel) x.scale(-1, 1);
  x.drawImage(quelle, -zw / 2, -zh / 2, zw, zh);
  x.setTransform(1, 0, 0, 1, 0, 0);
  const punkte = x.getImageData(0, 0, E.W, E.H).data.buffer, nr = ++zaehler;
  const r = await new Promise((ok, nein) => { offen.set(nr, { ok, nein }); arbeiter.postMessage({ art: 'finde', nr, punkte, W: E.W, H: E.H, w: E.w, h: E.h, grenze: o.grenze }, [punkte]); });
  return { funde: r.funde.map((f) => zurueck(f, grad, !!o.spiegel)), ms: r.ms };
}

// Kleines Musterbild eines Gesichts (für die Auswahl im Fenster) – aus dem aufrecht gedrehten Bild geschnitten.
function muster(quelle, b, h, f, grad, spiegel) {
  const k = document.createElement('canvas'); k.width = 112; k.height = 112;
  const x = k.getContext('2d'), quer = grad % 180 !== 0, kante = Math.max(f.w * b, f.h * h) * 1.25;
  if (!(kante > 2)) return null;
  x.fillStyle = '#1A2A3C'; x.fillRect(0, 0, 112, 112);
  x.translate(56, 56); x.rotate(grad * Math.PI / 180); if (spiegel) x.scale(-1, 1);
  const m = 112 / kante; x.scale(m, m);
  x.drawImage(quelle, -f.x * b, -f.y * h, b, h);
  return k;
}

/**
 * Einen Clip absuchen. c = Clip, m = sein Medium. o: { gruendlich, schritt }. melde(i, n) nach jedem Bild, abbruch = { an }.
 * → { gesichter: [{ lauf: [[t, x, y, w, h], …], von, bis, wert, bild }], bilder, abgebrochen } – wichtigste Gesichter zuerst
 */
export async function findeImClip(c, m, o = {}, melde = null, abbruch = null) {
  if (!m || m.fehler) throw new Error('Die Datei dieses Clips kann nicht gelesen werden.');
  const grad = c.dreh || 0, spiegel = !!c.spiegel, lang = o.gruendlich ? LANG.gruendlich : LANG.normal, grenze = 0.4;
  await ladeGesichtsfinder(beiLaden);
  if (c.art !== 'video') {
    if (!m.bild) throw new Error('Dieses Bild ist nicht geladen.');
    const b = m.bild.width, h = m.bild.height, r = await findeImBild(m.bild, b, h, { grad, spiegel, lang, grenze });
    if (melde) melde(1, 1);
    const S = spuren([{ t: 0, funde: r.funde }], b / h);
    return { gesichter: S.map((s) => ({ lauf: alsLauf(s, { seite: b / h }), von: 0, bis: 0, wert: s.wert, bild: muster(m.bild, b, h, s.punkte[0], grad, spiegel) })), bilder: 1, abgebrochen: false };
  }
  if (!m.datei) throw new Error(`Die Datei „${m.name}“ ist nicht verbunden. Bitte in der Mediathek „Dateien wieder verbinden“ antippen.`);
  const { Input, ALL_FORMATS, BlobSource, CanvasSink } = await import('../lib/mediabunny.min.mjs');
  const input = new Input({ source: new BlobSource(m.datei), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v || !(await v.canDecode())) throw new Error(`Das Video „${m.name}“ kann dieser Browser nicht verarbeiten.`);
    const basis = await v.getFirstTimestamp(), mw = m.w || await v.getDisplayWidth(), mh = m.h || await v.getDisplayHeight();
    const ende = Math.max(0, (m.dauer || 0) - 0.001), von = Math.max(0, c.ein || 0), bis = Math.min(c.aus > von ? c.aus : ende, ende), dauer = Math.max(0, bis - von);
    const schritt = Math.max(o.schritt || 0.2, dauer / 1500), zeiten = [];
    for (let t = von; t < bis - 0.02; t += schritt) zeiten.push(t);
    zeiten.push(bis);
    const k = lang / Math.max(mw, mh), bw = Math.max(2, Math.round(mw * k / 2) * 2), bh = Math.max(2, Math.round(mh * k / 2) * 2);
    const senke = new CanvasSink(v, { width: bw, height: bh, fit: 'fill', poolSize: 2 }), messungen = [];
    let i = 0, abgebrochen = false;
    for await (const bild of senke.canvasesAtTimestamps(zeiten.map((t) => basis + t))) {
      if (abbruch && abbruch.an) { abgebrochen = true; break; }
      const t = zeiten[i++];
      if (bild) messungen.push({ t, funde: (await findeImBild(bild.canvas, bw, bh, { grad, spiegel, lang, grenze })).funde });
      if (melde) melde(i, zeiten.length);
    }
    const seite = mw / mh, S = spuren(messungen, seite), gesichter = [];      // die Funde liegen im Quellbild – dort zählt dessen Seitenverhältnis, auch wenn der Clip gedreht im Film liegt
    for (const s of S) {
      const bester = s.punkte.reduce((a, p) => (p.wert * p.w * p.h > a.wert * a.w * a.h ? p : a), s.punkte[0]);
      let bild = null;
      if (!abgebrochen && gesichter.length < 24) { try { const g = await senke.getCanvas(basis + bester.t); if (g) bild = muster(g.canvas, bw, bh, bester, grad, spiegel); } catch (e) { /* dann ohne Musterbild */ } }
      gesichter.push({ lauf: alsLauf(s, { seite }), von: s.von, bis: s.bis, wert: s.wert, bild });
    }
    return { gesichter, bilder: messungen.length, abgebrochen };
  } finally { input.dispose(); }
}

/**
 * Gefundene Gesichter als „Stellen im Bild“ an den Clip hängen (weichzeichnen, verpixeln, abdecken …). Frühere Gesichts-Stellen des Clips
 * werden ersetzt, andere Stellen bleiben. Gesichter, die nacheinander im Bild sind, teilen sich eine Stelle. → { stellen, uebrig }
 */
export function gesichterAnClip(c, laeufe, art = 'unscharf', staerke = null) {
  const andere = (c.stellen || []).filter((e) => !e.gesicht), frei = Math.max(0, STELLEN_HOECHSTENS - andere.length), foto = c.art !== 'video';
  const V = foto ? { stellen: laeufe.slice(0, frei), uebrig: Math.max(0, laeufe.length - frei) } : verteile(laeufe, frei);
  const neu = V.stellen.map((L) => {
    const e = neueStelle(art); e.gesicht = true; e.staerke = staerke ?? (art === 'unscharf' ? 80 : art === 'mosaik' ? 70 : 60);
    [, e.x, e.y, e.w, e.h] = L.find((p) => p[3] > 0) || L[0];
    if (!foto) e.spur = L;
    return e;
  });
  c.stellen = [...andere, ...neu];
  return { stellen: neu.length, uebrig: V.uebrig };
}

/** Malt ein Probegesicht (gezeichnet, kein echter Mensch) – für „Gerät prüfen“, die Prüfungen und die Erklärfilme. Kopfbreite b um (cx, cy). */
export function maleProbegesicht(x, cx, cy, b, haut = [225, 180, 150], haar = [70, 50, 40], jacke = '#284678') {
  const h = b * 1.32, f = (c, k = 1) => `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
  const e = (dx, dy, rx, ry, farbe) => { x.fillStyle = farbe; x.beginPath(); x.ellipse(cx + dx * b, cy + dy * h, Math.max(0.5, rx * b), Math.max(0.5, ry * h), 0, 0, 6.2832); x.fill(); };
  const dunkel = f(haut, 0.72), hell = f(haut, 1.08);
  e(0, 0.86, 1.05, 0.42, jacke);                           // Schultern
  e(0, 0.52, 0.2, 0.2, dunkel);                            // Hals
  e(0, -0.08, 0.56, 0.56, f(haar));                        // Haare hinten
  e(0, 0, 0.5, 0.5, f(haut));                              // Gesicht
  e(0, -0.36, 0.5, 0.2, f(haar));                          // Haaransatz
  e(-0.5, 0.02, 0.05, 0.08, dunkel); e(0.5, 0.02, 0.05, 0.08, dunkel);     // Ohren
  e(0, 0.1, 0.34, 0.3, hell);                              // Wangen
  x.lineCap = 'round';
  for (const s of [-1, 1]) {
    e(s * 0.2, -0.085, 0.105, 0.035, '#F5F5F5'); e(s * 0.2, -0.085, 0.045, 0.034, '#28503C'); e(s * 0.2, -0.085, 0.02, 0.016, '#0A0A0A');   // Auge
    x.strokeStyle = f(haar, 0.8); x.lineWidth = Math.max(1, b * 0.03); x.beginPath(); x.ellipse(cx + s * 0.2 * b, cy - 0.15 * h, 0.13 * b, 0.03 * h, 0, Math.PI, 2 * Math.PI); x.stroke();   // Augenbraue
    e(s * 0.2, -0.05, 0.12, 0.012, dunkel);                // Schatten unter dem Auge
  }
  x.strokeStyle = dunkel; x.lineWidth = Math.max(1, b * 0.03); x.beginPath(); x.moveTo(cx - 0.015 * b, cy - 0.03 * h); x.lineTo(cx - 0.035 * b, cy + 0.1 * h); x.stroke();   // Nase
  e(0, 0.125, 0.085, 0.022, dunkel);                       // Nasenflügel
  e(0, 0.255, 0.17, 0.028, '#964646'); e(0, 0.245, 0.15, 0.008, '#5A2828');   // Mund
  e(0, 0.37, 0.16, 0.03, dunkel);                          // Kinn
}
