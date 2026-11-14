// TW Schnittraum – Effekte: die Palette (Bildeffekte, Rahmen, Bewegung, Stellen im Bild, Farbe ändern) und alles, was davon auf die Malfläche gemalt wird.
// Die Effekte, die Bildpunkt für Bildpunkt rechnen, übernimmt effekte-gl.js. Nichts hier hängt vom Zufall oder von der Uhr ab – nur von der
// Zeit im Film. Deshalb zeigen die Vorschau und die fertige Datei dasselbe. Grundeinstellung überall: aus.
import { klemm, nr } from './modell.js';

export const EFFEKT_GRUPPEN = { film: 'Film und Kamera', licht: 'Licht und Schärfe', kunst: 'Kunst', form: 'Verzerren und Spiegeln', stoer: 'Störung', wetter: 'Wetter und Feier' };
/** Die Palette der Bildeffekte: Kennung → [Name, Gruppe, Stärke beim Einschalten, true = ohne Stärkeregler]. */
export const EFFEKTE = {
  korn: ['Filmkorn', 'film', 45], altfilm: ['Alter Film', 'film', 70], vhs: ['Videokassette', 'film', 60], zeilen: ['Bildschirmzeilen', 'film', 50], rauschen: ['Bildrauschen', 'film', 35], nacht: ['Nachtsicht', 'film', 85], waermebild: ['Wärmebild', 'film', 100],
  scharf: ['Schärfen', 'licht', 50], leuchten: ['Leuchten', 'licht', 55], traum: ['Traum', 'licht', 60], miniatur: ['Miniatur', 'licht', 70], sog: ['Zoom-Unschärfe', 'licht', 45], lichtleck: ['Lichteinfall', 'licht', 60], funkeln: ['Lichtpunkte', 'licht', 55], blitz: ['Blitz am Anfang', 'licht', 80],
  comic: ['Comic', 'kunst', 100], plakat: ['Plakat', 'kunst', 60], zeichnung: ['Bleistift', 'kunst', 100], relief: ['Relief', 'kunst', 100], raster: ['Zeitungsraster', 'kunst', 50], neon: ['Neon-Kanten', 'kunst', 100], negativ: ['Negativ', 'kunst', 100, true], duoton: ['Zweifarbig', 'kunst', 100], pixel: ['Mosaik', 'kunst', 45],
  spiegel: ['Spiegelbild', 'form', 100, true], kaleido: ['Kaleidoskop', 'form', 50], kachel: ['Kacheln', 'form', 30], fischauge: ['Fischauge', 'form', 60], wirbel: ['Wirbel', 'form', 50], welle: ['Wellen', 'form', 50],
  glitch: ['Bildstörung', 'stoer', 60], saum: ['Farbsäume', 'stoer', 50], strobo: ['Flackerlicht', 'stoer', 50],
  schnee: ['Schnee', 'wetter', 50], regen: ['Regen', 'wetter', 50], nebel: ['Nebel', 'wetter', 60], konfetti: ['Konfetti', 'wetter', 60],
};
/** Reihenfolge der Effekte in der Rechenstufe (effekte-gl.js). „weichx“ dient nur den Übergängen. */
export const GL_FX = ['korn', 'altfilm', 'vhs', 'nacht', 'waermebild', 'rauschen', 'zeilen', 'comic', 'plakat', 'zeichnung', 'relief', 'raster', 'neon', 'negativ', 'duoton', 'pixel', 'scharf', 'leuchten', 'traum', 'miniatur', 'sog',
  'spiegel', 'kaleido', 'fischauge', 'wirbel', 'welle', 'kachel', 'glitch', 'saum', 'nebel', 'weichx'];

/** Rahmen und Einfassungen: Kennung → [Name, Grundwerte, Regler: b = Breite, e = runde Ecken, f = Farbe]. */
export const RAHMEN = {
  keiner: ['Ohne', {}, ''],
  unscharf: ['Unscharf eingefasst', { staerke: 45, rund: 35 }, 'be'],
  schatten: ['Schwebend', { staerke: 40, rund: 30, farbe: '#1A2A3C' }, 'bef'],
  rand: ['Farbrand', { staerke: 35, rund: 0, farbe: '#FFFFFF' }, 'bef'],
  seiten: ['Seitenstreifen', { staerke: 35, farbe: '#0F1923' }, 'bf'],
  polaroid: ['Sofortbild', { staerke: 50 }, 'b'],
  film: ['Filmstreifen', { staerke: 50 }, ''],
  kino: ['Kinobalken', { staerke: 45 }, 'b'],
  linie: ['Linie', { staerke: 40, rund: 0, farbe: '#FFFFFF' }, 'bef'],
  doppel: ['Doppellinie', { staerke: 40, farbe: '#FFFFFF' }, 'bf'],
  ecken: ['Ecken', { staerke: 50, farbe: '#FFFFFF' }, 'bf'],
  sucher: ['Kamera-Sucher', { staerke: 50, farbe: '#FFFFFF' }, 'f'],
  schein: ['Weicher Rand', { staerke: 35, farbe: '#FFFFFF' }, 'bf'],
};
export const BEWEGUNGEN = { keine: 'Ohne', ran: 'Langsam heran', weg: 'Langsam weg', rechts: 'Schwenk nach rechts', links: 'Schwenk nach links', hoch: 'Schwenk nach oben', runter: 'Schwenk nach unten',
  schweben: 'Schweben', wackeln: 'Handkamera', puls: 'Pulsieren', ruck: 'Ruck am Anfang', drehen: 'Langsam drehen' };
export const STELLEN_ARTEN = { unscharf: 'Weichzeichnen', mosaik: 'Verpixeln', balken: 'Abdecken', glatt: 'Glätten', hell: 'Aufhellen', licht: 'Hervorheben', lupe: 'Vergrößern' };
export const UMF_ARTEN = { neu: 'Umfärben', behalten: 'Nur diese Farbe behalten', grau: 'Entfärben' };
export const STELLEN_HOECHSTENS = 8, FARBEN_HOECHSTENS = 3;
const STELLEN_CODE = { unscharf: 0, mosaik: 1, balken: 2, licht: 3, lupe: 4, glatt: 5, hell: 6 }, UMF_CODE = { neu: 0, behalten: 1, grau: 2 };
const LEER = Object.freeze({}), KEINE = Object.freeze([]);

export const neueStelle = (art = 'unscharf') => ({ id: 's' + nr(), art, form: 'ellipse', x: 0.5, y: 0.5, w: 0.3, h: 0.3, staerke: 60, farbe: '#000000' });
export const neueFarbe = (von) => ({ id: 'u' + nr(), von, nach: '#C41E1E', art: 'neu', tol: 30, weich: 40, staerke: 100, bereich: null });
/** Hat der Clip etwas aus der Palette eingeschaltet? */
export const hatEffekte = (c) => !!((c.fx && Object.keys(c.fx).some((k) => c.fx[k] > 0)) || (c.rahmen && c.rahmen.art && c.rahmen.art !== 'keiner') || (c.bew && c.bew.art && c.bew.art !== 'keine') || (c.stellen && c.stellen.length) || (c.umf && c.umf.length));

export const hexRgb = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0]; };
const rgba = (hex, deck) => { const [r, g, b] = hexRgb(hex); return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${deck})`; };
const dunkler = (hex, k) => { const [r, g, b] = hexRgb(hex); return `rgb(${Math.round(r * 255 * k)},${Math.round(g * 255 * k)},${Math.round(b * 255 * k)})`; };
/** Helligkeit und zwei Farbanteile – in diesem Raum vergleicht und ändert die Rechenstufe Farben. */
const ycc = ([r, g, b]) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, (b - y) * 0.564, (r - y) * 0.713]; };
const zufall = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ───────────────────────── Bewegung ─────────────────────────
/** Bewegung des Bildes zur Zeit t: zusätzlicher Zoom, Verschiebung (Anteil der Bildbreite/-höhe), Drehung (Bogenmaß). */
export function bewegung(c, t, s, W, H) {
  const b = c.bew, aus = { zoom: 1, x: 0, y: 0, dreh: 0 };
  if (!b || !b.art || b.art === 'keine') return aus;
  const st = klemm((b.staerke ?? 50) / 100, 0, 1), rel = Math.max(0, t - s.t0), k = klemm(rel / Math.max(0.05, s.d), 0, 1), a = 0.16 * st;
  switch (b.art) {
    case 'ran': aus.zoom = 1 + 0.2 * st * k; break;
    case 'weg': aus.zoom = 1 + 0.2 * st * (1 - k); break;
    case 'rechts': aus.zoom = 1 + a; aus.x = (0.5 - k) * a; break;
    case 'links': aus.zoom = 1 + a; aus.x = (k - 0.5) * a; break;
    case 'hoch': aus.zoom = 1 + a; aus.y = (k - 0.5) * a; break;
    case 'runter': aus.zoom = 1 + a; aus.y = (0.5 - k) * a; break;
    case 'schweben': aus.zoom = 1 + 0.05 * st + 0.012 * st * Math.sin(rel * 0.9); aus.x = 0.016 * st * Math.sin(rel * 0.7 + 1); aus.y = 0.016 * st * Math.sin(rel * 0.53 + 2.2); break;
    case 'wackeln': { const m = 0.014 * st; aus.zoom = 1 + 2 * m + 0.04 * st; aus.x = m * (0.6 * Math.sin(rel * 7.3 + 1.1) + 0.4 * Math.sin(rel * 13.7 + 2.3)); aus.y = m * (0.6 * Math.sin(rel * 6.1 + 0.7) + 0.4 * Math.sin(rel * 11.9 + 4.1)); aus.dreh = 0.012 * st * Math.sin(rel * 5.3 + 0.4); break; }
    case 'puls': aus.zoom = 1 + 0.07 * st * Math.exp(-5 * ((rel * 2) % 1)); break;                    // zwei Schläge je Sekunde
    case 'ruck': aus.zoom = 1 + 0.3 * st * Math.exp(-rel * 6); break;
    case 'drehen': { const wMax = 0.07 * st; aus.dreh = (k - 0.5) * 2 * wMax; aus.zoom = Math.cos(wMax) + Math.max(W / H, H / W) * Math.sin(wMax); break; }   // so weit vergrößert, dass keine Ecke frei wird
  }
  return aus;
}
/** Größter Zoom der Bewegung über den ganzen Clip – die Ausgabe holt die Bilder dann groß genug. */
export function bewZoomMax(c, s, W, H) {
  if (!c.bew || !c.bew.art || c.bew.art === 'keine') return 1;
  let z = 1; for (let i = 0; i <= 4; i++) z = Math.max(z, bewegung(c, s.t0 + s.d * i / 4, s, W, H).zoom);
  return z * 1.08;
}

// ───────────────────────── Rahmen ─────────────────────────
/** Innenfläche des Rahmens: Dorthin wird das Bild gemalt. { x, y, w, h, r: Eckenradius, kipp: Neigung in Bogenmaß } */
export function rahmenInnen(c, W, H) {
  const R = c.rahmen, voll = { x: 0, y: 0, w: W, h: H, r: 0, kipp: 0 };
  if (!R || !R.art || R.art === 'keiner') return voll;
  const kurz = Math.min(W, H), st = klemm((R.staerke ?? 50) / 100, 0, 1), rund = klemm((R.rund ?? 0) / 100, 0, 1) * kurz * 0.09;
  switch (R.art) {
    case 'rand': { const b = kurz * (0.012 + 0.07 * st); return { x: b, y: b, w: W - 2 * b, h: H - 2 * b, r: rund, kipp: 0 }; }
    case 'seiten': { const b = W * (0.04 + 0.16 * st); return { x: b, y: 0, w: W - 2 * b, h: H, r: 0, kipp: 0 }; }
    case 'unscharf': case 'schatten': { const f = 0.94 - 0.24 * st; return { x: W * (1 - f) / 2, y: H * (1 - f) / 2, w: W * f, h: H * f, r: rund, kipp: 0 }; }
    case 'polaroid': { const f = 0.56 + 0.22 * st; return { x: W * (1 - f) / 2, y: H * (1 - f) / 2 - kurz * 0.035, w: W * f, h: H * f, r: 0, kipp: -0.035 }; }
    case 'film': { const b = W * 0.085; return { x: b, y: 0, w: W - 2 * b, h: H, r: 0, kipp: 0 }; }
    default: return voll;      // Linie, Ecken, Kinobalken, Sucher und weicher Rand liegen über dem Bild
  }
}
/** Hintergrund des Rahmens über das ganze Bild (unter dem Bild, ungeneigt). maleUnscharf() malt das Bild der Szene bildfüllend, unscharf und dunkel. */
export function rahmenGrund(ctx, W, H, R0, R, maleUnscharf) {
  const art = R0.art;
  if (art === 'rand' || art === 'seiten') { ctx.fillStyle = R0.farbe || '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
  else if (art === 'schatten') { const f = R0.farbe || '#1A2A3C', g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, f); g.addColorStop(1, dunkler(f, 0.5)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (art === 'unscharf' || art === 'polaroid') maleUnscharf();
  else if (art === 'film') {
    const b = R.x, n = Math.max(6, Math.round(H / (b * 0.62))), lh = H / n, lw = b * 0.42, hh = lh * 0.5;
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#e9e6dc';
    for (let i = 0; i < n; i++) for (const x of [b * 0.29, W - b * 0.29 - lw]) { ctx.beginPath(); ctx.roundRect(x, i * lh + (lh - hh) / 2, lw, hh, hh * 0.22); ctx.fill(); }
  }
}
/** Schatten und Karte direkt unter dem Bild (geneigt wie das Bild). */
export function rahmenKarte(ctx, W, H, R0, R) {
  const art = R0.art, kurz = Math.min(W, H);
  if (art !== 'schatten' && art !== 'unscharf' && art !== 'polaroid') return;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = kurz * 0.045; ctx.shadowOffsetY = kurz * 0.014;
  if (art === 'polaroid') { const m = kurz * 0.028; ctx.fillStyle = '#F6F3EA'; ctx.fillRect(R.x - m, R.y - m, R.w + 2 * m, R.h + m + kurz * 0.11); }
  else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(R.x, R.y, R.w, R.h, R.r); ctx.fill(); }
  ctx.restore();
}
/** Was vom Rahmen über dem Bild liegt: Linien, Ecken, Kinobalken, Sucher, weicher Rand. */
export function rahmenOben(ctx, W, H, R0, t) {
  const art = R0.art, kurz = Math.min(W, H), st = klemm((R0.staerke ?? 50) / 100, 0, 1), farbe = R0.farbe || '#FFFFFF';
  ctx.save(); ctx.strokeStyle = farbe; ctx.fillStyle = farbe; ctx.lineJoin = 'miter';
  if (art === 'linie') { const lw = kurz * (0.003 + 0.014 * st), m = kurz * 0.03 + lw / 2; ctx.lineWidth = lw; ctx.beginPath(); ctx.roundRect(m, m, W - 2 * m, H - 2 * m, klemm((R0.rund ?? 0) / 100, 0, 1) * kurz * 0.08); ctx.stroke(); }
  else if (art === 'doppel') { const lw = kurz * (0.004 + 0.01 * st), m = kurz * 0.028 + lw / 2, m2 = m + lw * 2.1; ctx.lineWidth = lw; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m); ctx.lineWidth = Math.max(1, lw * 0.35); ctx.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2); }
  else if (art === 'ecken' || art === 'sucher') {
    const such = art === 'sucher', lw = kurz * (such ? 0.005 : 0.004 + 0.008 * st), m = kurz * (such ? 0.05 : 0.035), l = kurz * (such ? 0.08 : 0.05 + 0.12 * st);
    ctx.lineWidth = lw; ctx.lineCap = 'square'; ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { ctx.moveTo(x + sx * l, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * l); }
    ctx.stroke();
    if (such) {
      const k = kurz * 0.025; ctx.lineWidth = Math.max(1, lw * 0.6); ctx.beginPath(); ctx.moveTo(W / 2 - k, H / 2); ctx.lineTo(W / 2 + k, H / 2); ctx.moveTo(W / 2, H / 2 - k); ctx.lineTo(W / 2, H / 2 + k); ctx.stroke();
      if ((t % 1.2) < 0.75) { ctx.fillStyle = '#E02020'; ctx.beginPath(); ctx.arc(m + kurz * 0.04, m + kurz * 0.04, kurz * 0.013, 0, 6.2832); ctx.fill(); }      // rotes Aufnahmelicht blinkt
    }
  } else if (art === 'kino') { const b = H * (0.05 + 0.13 * st); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
  else if (art === 'schein') { const d = Math.hypot(W, H) / 2, g = ctx.createRadialGradient(W / 2, H / 2, d * (0.72 - 0.4 * st), W / 2, H / 2, d); g.addColorStop(0, rgba(farbe, 0)); g.addColorStop(1, rgba(farbe, 0.95)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ───────────────────────── Auflagen: Licht, Wetter, Feier ─────────────────────────
/** Malt die Effekte, die über dem Bild liegen. rel = Sekunden seit Beginn des Clips. */
export function zeichneAuflagen(ctx, W, H, fx, t, rel) {
  if (!fx) return;
  const al = ctx.globalAlpha, kurz = Math.min(W, H), st = (k) => klemm((fx[k] || 0) / 100, 0, 1);
  let v;
  if ((v = st('lichtleck')) > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 2; i++) {
      const w = t * (0.22 + 0.09 * i) + i * 2.4, x = W * (0.5 + 0.62 * Math.cos(w)), y = H * (0.5 + 0.55 * Math.sin(w * 1.3 + i)), r = Math.hypot(W, H) * (0.45 + 0.1 * Math.sin(t * 0.5 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i ? 'rgba(255,120,60,.85)' : 'rgba(255,190,90,.9)'); g.addColorStop(0.5, i ? 'rgba(255,60,90,.28)' : 'rgba(255,120,40,.3)'); g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.globalAlpha = al * Math.min(1, v * 1.1); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  if ((v = st('funkeln')) > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0, n = Math.round(10 + 34 * v); i < n; i++) {
      const a = zufall(i + 1), b = zufall(i + 51), g = zufall(i + 101), r = kurz * (0.012 + 0.05 * g * g), x = W * ((a + t * 0.012 * (0.4 + b)) % 1), y = H * ((b + 0.02 * Math.sin(t * 0.3 + i) - t * 0.008 * (0.3 + a) + 8) % 1);
      const hell = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.2 + 2.5 * g) + i * 1.7)), f = i % 3 === 0 ? '255,236,190' : i % 3 === 1 ? '255,255,255' : '255,210,150', gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${f},.95)`); gr.addColorStop(0.6, `rgba(${f},.45)`); gr.addColorStop(1, `rgba(${f},0)`);
      ctx.globalAlpha = al * hell * (0.35 + 0.5 * v); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  if ((v = st('schnee')) > 0) {
    ctx.save(); ctx.fillStyle = '#fff';
    for (let i = 0, n = Math.round(40 + 160 * v); i < n; i++) {
      const a = zufall(i + 7), b = zufall(i + 77), g = zufall(i + 177), r = kurz * (0.0025 + 0.007 * g * g), x = W * ((a + 0.03 * Math.sin(t * (0.6 + b) + i) + t * 0.01 + 1) % 1), y = H * ((b + t * (0.05 + 0.12 * g)) % 1);
      ctx.globalAlpha = al * (0.45 + 0.5 * g); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  if ((v = st('regen')) > 0) {
    ctx.save(); ctx.fillStyle = 'rgb(30,45,60)'; ctx.globalAlpha = al * 0.16 * v; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgb(210,225,240)'; ctx.lineCap = 'round';
    for (let i = 0, n = Math.round(60 + 220 * v); i < n; i++) {
      const a = zufall(i + 13), b = zufall(i + 113), g = zufall(i + 213), l = H * (0.035 + 0.05 * g), y = H * (((b + t * (1.3 + 0.9 * g)) % 1) * 1.15 - 0.1), x = W * (a * 1.2 - 0.15) + 0.2 * y;
      ctx.globalAlpha = al * (0.18 + 0.3 * g); ctx.lineWidth = Math.max(1, kurz * (0.0012 + 0.0012 * g)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l * 0.2, y + l); ctx.stroke();
    }
    ctx.restore();
  }
  if ((v = st('konfetti')) > 0) {
    const farben = ['#C41E1E', '#FACC15', '#4DA6FF', '#27AE60', '#FF7AB6', '#FFFFFF'];
    for (let i = 0, n = Math.round(40 + 130 * v); i < n; i++) {
      const a = zufall(i + 19), b = zufall(i + 119), g = zufall(i + 219), gr = kurz * (0.012 + 0.016 * g), y = H * (((b + t * (0.12 + 0.2 * g)) % 1) * 1.1 - 0.05), x = W * (a + 0.04 * Math.sin(t * (1 + b) + i));
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1 + 3 * a) + i); ctx.scale(Math.cos(t * (2 + 4 * b) + i), 1); ctx.globalAlpha = al * 0.92; ctx.fillStyle = farben[i % farben.length]; ctx.fillRect(-gr / 2, -gr * 0.3, gr, gr * 0.6); ctx.restore();
    }
  }
  if ((v = st('blitz')) > 0 && rel < 0.5) { const k = 1 - rel / 0.5; ctx.save(); ctx.globalAlpha = al * v * k * k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if ((v = st('strobo')) > 0) { const ph = (rel * 2.5) % 1; if (ph < 0.12) { ctx.save(); ctx.globalAlpha = al * (0.25 + 0.55 * v) * (1 - ph / 0.12); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); } }   // höchstens 2,5 Lichtblitze je Sekunde
  ctx.globalAlpha = al;
}

// ───────────────────────── Angaben für die Rechenstufe ─────────────────────────
/** Lage einer Stelle zur Quellzeit qt. Mit „spur“ ([[t, x, y, w, h], …], w = 0 = nicht zu sehen) folgt die Stelle dem Bild. */
export function stelleBei(e, qt) {
  const sp = e.spur; if (!sp || !sp.length) return e;
  // Eine mitlaufende Stelle lässt sich als Ganzes größer oder kleiner machen (gr) und verschieben (dx, dy) – die Spur selbst bleibt, wie sie gefunden wurde.
  const gr = e.gr > 0 ? e.gr : 1, dx = e.dx || 0, dy = e.dy || 0;
  let i = 0; while (i < sp.length - 1 && sp[i + 1][0] <= qt) i++;
  const a = sp[i], b = sp[i + 1], halt = (p) => ({ x: p[1] + dx, y: p[2] + dy, w: p[3] * gr, h: p[4] * gr }), weg = { x: 0.5, y: 0.5, w: 0, h: 0 };
  if (qt < a[0]) return a[0] - qt < 0.5 && a[3] > 0 ? halt(a) : weg;
  if (!b) return qt - a[0] < 0.5 && a[3] > 0 ? halt(a) : weg;
  if (!(a[3] > 0)) return b[3] > 0 && b[0] - qt < 0.25 ? halt(b) : weg;
  if (!(b[3] > 0)) return qt - a[0] < 0.5 ? halt(a) : weg;
  const k = (qt - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * k + dx, y: a[2] + (b[2] - a[2]) * k + dy, w: (a[3] + (b[3] - a[3]) * k) * gr, h: (a[4] + (b[4] - a[4]) * k) * gr };
}
const P = { E: new Float32Array(32), sA: new Float32Array(32), sB: new Float32Array(32), sC: new Float32Array(32), uA: new Float32Array(12), uB: new Float32Array(12), uC: new Float32Array(12), uD: new Float32Array(12), duo: [0.77, 0.12, 0.12], weich: false, glatt: false, zeit: 0, stufe: 0 };
/**
 * Angaben für die Rechenstufe – oder null, wenn für diesen Clip nichts zu rechnen ist.
 * @param zus  Zusatz aus einem Übergang, z. B. { pixel: 0.6 }
 * @param qt   Zeit in der Quelle (für Stellen, die dem Bild folgen)
 */
export function glWerte(c, zus, t, qt) {
  const fx = c.fx || LEER, st = c.stellen || KEINE, um = c.umf || KEINE;
  if (!zus && !st.length && !um.length && fx === LEER) return null;
  let etwas = false; P.weich = false; P.glatt = false; P.E.fill(0);
  for (let i = 0; i < GL_FX.length; i++) { const k = GL_FX[i]; let v = fx[k] > 0 ? fx[k] / 100 : 0; if (zus && zus[k] > v) v = zus[k]; if (v > 0) { P.E[i] = Math.min(1, v); etwas = true; } }
  if (P.E[GL_FX.indexOf('leuchten')] || P.E[GL_FX.indexOf('traum')] || P.E[GL_FX.indexOf('miniatur')] || P.E[GL_FX.indexOf('weichx')]) P.weich = true;
  P.sA.fill(0); P.sB.fill(0); P.sC.fill(0); for (let i = 0; i < STELLEN_HOECHSTENS; i++) P.sB[i * 4] = 9;
  for (let i = 0, n = 0; i < st.length && n < STELLEN_HOECHSTENS; i++) {      // lückenlos von vorn füllen – die Rechenstufe hört bei der ersten leeren Stelle auf
    const e = st[i], L = stelleBei(e, qt), code = STELLEN_CODE[e.art];
    if (code == null || !(L.w > 0.002 && L.h > 0.002)) continue;
    const f = hexRgb(e.farbe), k = n * 4; n++;
    P.sA.set([L.x, L.y, L.w / 2, L.h / 2], k); P.sB.set([code, e.form === 'rechteck' ? 1 : 0, klemm((e.staerke ?? 60) / 100, 0, 1), code === 0 ? 0.3 : code === 3 ? 0.25 : code === 4 ? 0.12 : code === 5 ? 0.35 : code === 6 ? 0.45 : 0.03], k); P.sC.set([f[0], f[1], f[2], 0], k);
    etwas = true; if (code === 0) P.weich = true; if (code === 5) P.glatt = true;
  }
  P.uA.fill(0); P.uB.fill(0); P.uC.fill(0); P.uD.fill(0);
  for (let i = 0; i < Math.min(3, um.length); i++) {
    const e = um[i], code = UMF_CODE[e.art]; if (code == null || !e.von) continue;
    const a = ycc(hexRgb(e.von)), b = ycc(hexRgb(e.nach || '#C41E1E')), B = e.bereich;
    P.uA.set([a[0], a[1], a[2], 0.08 + klemm((e.tol ?? 30) / 100, 0, 1) * 0.92], i * 4); P.uB.set([b[0], b[1], b[2], klemm((e.staerke ?? 100) / 100, 0, 1)], i * 4);
    P.uC.set([code, klemm((e.weich ?? 40) / 100, 0, 1) * 0.6, B && B.form === 'rechteck' ? 1 : 0, 0], i * 4);
    if (B && B.w > 0.002 && B.h > 0.002) P.uD.set([B.x, B.y, B.w / 2, B.h / 2], i * 4);
    etwas = true;
  }
  if (!etwas) return null;
  P.duo = hexRgb(c.fxFarbe || '#C41E1E'); P.zeit = t; P.stufe = Math.floor(t * 24 + 1e-6) % 1021;
  return P;
}
