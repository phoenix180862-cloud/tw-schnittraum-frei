// TW Schnittraum – Bildaufbau. Ein und dieselbe Funktion malt die Vorschau und jedes Bild der fertigen Datei,
// damit das Ergebnis genau so aussieht wie in der Vorschau. Alle Maße hängen an W/H (Vorschau klein, Ausgabe groß).
import { aktive, quellZeit } from './modell.js';
import { gefaerbt, verwischt } from './farbe-ersatz.js';
import { rahmenInnen, rahmenGrund, rahmenKarte, rahmenOben, bewegung, zeichneAuflagen, glWerte, stelleBei } from './effekte.js';
import { glBild } from './effekte-gl.js';

// Kann die Malfläche selbst filtern (Helligkeit, Unschärfe …)? Auf iPhone und iPad teils nicht – dann rechnet farbe-ersatz.js.
let filterDa = null;
export function kannFiltern(ctx) {
  if (globalThis.TW_OHNE_FILTER) return false;                    // für die Prüfung des Ersatzwegs
  if (filterDa === null) filterDa = typeof ctx.filter === 'string';
  return filterDa;
}

const weichAus = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

export function filterText(a, H) {
  const f = [];
  if (a.hell) f.push(`brightness(${(1 + a.hell / 200).toFixed(3)})`);
  if (a.kontrast) f.push(`contrast(${(1 + a.kontrast / 200).toFixed(3)})`);
  if (a.saett) f.push(`saturate(${Math.max(0, 1 + a.saett / 100).toFixed(3)})`);
  if (a.sepia) f.push(`sepia(${(a.sepia / 100).toFixed(3)})`);
  if (a.weich) f.push(`blur(${(a.weich / 100 * H * 0.02).toFixed(2)}px)`);
  return f.length ? f.join(' ') : 'none';
}

// Übergang HINEIN (k: 0 → 1) für den neuen Clip. → { alpha, dx, dy, mass, dreh, form (Ausschnitt), zus (Zusatz für die Bildeffekte) }
function hinein(art, k, W, H) {
  const e = weichAus(k), u = { alpha: 1, dx: 0, dy: 0, mass: 1, dreh: 0, form: null, zus: null };
  switch (art) {
    case 'blende': u.alpha = k; break;
    case 'schwarz': case 'weiss': u.alpha = k < 0.5 ? 0 : (k - 0.5) * 2; break;
    case 'schieben': u.dx = (1 - e) * W; break;
    case 'schiebenR': u.dx = -(1 - e) * W; break;
    case 'schiebenO': u.dy = (1 - e) * H; break;
    case 'schiebenU': u.dy = -(1 - e) * H; break;
    case 'wischen': u.form = ['r', 0, 0, e * W, H]; break;
    case 'wischenL': u.form = ['r', W - e * W, 0, e * W, H]; break;
    case 'wischenU': u.form = ['r', 0, 0, W, e * H]; break;
    case 'wischenO': u.form = ['r', 0, H - e * H, W, e * H]; break;
    case 'tuer': u.form = ['r', W / 2 - e * W / 2, 0, e * W, H]; break;
    case 'kreis': u.form = ['k', e * Math.hypot(W, H) / 2]; break;
    case 'raute': u.form = ['d', e]; break;
    case 'uhr': u.form = ['u', k]; break;
    case 'jalousie': u.form = ['j', e]; break;
    case 'zoom': u.alpha = Math.min(1, k * 1.6); u.mass = 1.5 - 0.5 * e; break;
    case 'drehen': u.alpha = Math.min(1, k * 2); u.mass = 0.7 + 0.3 * e; u.dreh = -(1 - e) * 0.35; break;
    case 'unscharf': u.alpha = k; u.zus = { weichx: 1 - k }; break;
    case 'pixel': u.alpha = k < 0.5 ? 0 : 1; u.zus = { pixel: Math.min(1, (1 - k) * 2) * 0.8 }; break;
    case 'stoerung': u.alpha = k < 0.5 ? 0 : 1; u.zus = { glitch: Math.min(1, (1 - k) * 2.4), saum: Math.min(1, (1 - k) * 2) }; break;
    case 'wirbel': u.alpha = k < 0.5 ? 0 : 1; u.zus = { wirbel: Math.min(1, (1 - k) * 2) }; break;
  }
  return u;
}
// Übergang HINAUS (k: 0 → 1) für den alten Clip – ergänzt, was „hinein“ für ihn ergeben hat.
function hinaus(u, art, k, W, H) {
  const e = weichAus(k), halb = Math.min(1, k * 2);
  switch (art) {
    case 'schwarz': case 'weiss': u.alpha *= k < 0.5 ? 1 - k * 2 : 0; break;
    case 'schieben': u.dx = -e * W; break;
    case 'schiebenR': u.dx = e * W; break;
    case 'schiebenO': u.dy = -e * H; break;
    case 'schiebenU': u.dy = e * H; break;
    case 'zoom': u.mass = 1 + 0.6 * e; break;
    case 'unscharf': u.zus = { ...u.zus, weichx: k }; break;
    case 'pixel': u.zus = { ...u.zus, pixel: halb * 0.8 }; break;
    case 'stoerung': u.zus = { ...u.zus, glitch: Math.min(1, k * 2.4), saum: halb }; break;
    case 'wirbel': u.zus = { ...u.zus, wirbel: halb }; break;
  }
}
function schneideForm(ctx, f, W, H) {
  ctx.beginPath();
  if (f[0] === 'r') ctx.rect(f[1], f[2], f[3], f[4]);
  else if (f[0] === 'k') ctx.arc(W / 2, H / 2, f[1], 0, 6.2832);
  else if (f[0] === 'd') { const a = f[1] * W, b = f[1] * H; ctx.moveTo(W / 2 - a, H / 2); ctx.lineTo(W / 2, H / 2 - b); ctx.lineTo(W / 2 + a, H / 2); ctx.lineTo(W / 2, H / 2 + b); ctx.closePath(); }
  else if (f[0] === 'u') { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + f[1] * 2 * Math.PI); ctx.closePath(); }
  else { const n = 8, hh = H / n; for (let i = 0; i < n; i++) ctx.rect(0, i * hh, W, hh * f[1] + 0.5); }
  ctx.clip();
}

// quelle(seg, t) liefert { bild, w, h } (Videobild oder Foto) oder null, wenn noch nichts da ist.
// opt: { logo: Bild, auswahl: Text-ID, spielt: läuft die Vorschau?, boxen: [] (wird mit den Text-Rahmen gefüllt, für das Anfassen in der Vorschau),
//        stelle: { clip, liste, id } – diese Stelle wird in der Vorschau umrandet (zum Verschieben) }
export function zeichne(ctx, W, H, t, p, lay, quelle, opt = {}) {
  const akt = aktive(lay, t);
  let grund = p.hintergrund || '#000000', karte = 0;
  for (const s of akt) if (s.ueb > 0 && t < s.t0 + s.ueb && s.c.ueb.art === 'weiss') grund = '#ffffff';
  ctx.save();
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grund; ctx.fillRect(0, 0, W, H);

  for (const s of akt) {
    const c = s.c;
    const k = s.ueb > 0 && t < s.t0 + s.ueb ? (t - s.t0) / s.ueb : 1;           // Fortschritt des Übergangs HINEIN
    const n = lay.segs[s.i + 1];
    const kAus = n && n.ueb > 0 && t >= n.t0 ? Math.min(1, (t - n.t0) / n.ueb) : 0; // Fortschritt des Übergangs HINAUS
    const u = hinein(k < 1 ? c.ueb.art : null, k, W, H);
    if (kAus > 0) hinaus(u, n.c.ueb.art, kAus, W, H);
    let alpha = u.alpha;
    const rel = t - s.t0, rest = s.t1 - t;
    if (c.einbl > 0 && rel < c.einbl) alpha *= rel / c.einbl;
    if (c.ausbl > 0 && rest < c.ausbl) alpha *= rest / c.ausbl;
    if (c.art === 'karte') karte = Math.max(karte, Math.min(1, alpha));
    if (alpha <= 0.001) continue;
    ctx.save();
    if (u.form) schneideForm(ctx, u.form, W, H);
    if (u.dx || u.dy || u.mass !== 1 || u.dreh) { ctx.translate(W / 2 + u.dx, H / 2 + u.dy); ctx.rotate(u.dreh); ctx.scale(u.mass, u.mass); ctx.translate(-W / 2, -H / 2); }
    ctx.globalAlpha = Math.min(1, alpha);
    if (c.art === 'karte') zeichneKarte(ctx, W, H, rel, s.d, c.karte, opt);
    else zeichneClip(ctx, W, H, t, s, quelle(s, t), u.zus, opt);
    ctx.restore();
  }

  zeichneTexte(ctx, W, H, t, p, opt);
  zeichneUntertitel(ctx, W, H, t, p, lay);
  if (p.schalter.logo && opt.logo && karte < 0.99) zeichneLogo(ctx, W, H, p.logo, opt.logo, 1 - karte); // auf Vor-/Abspann steht das Logo schon groß
  ctx.restore();
}

/** Wo und wie groß liegt das Bild eines Clips zur Zeit t? Gleiche Rechnung für das Malen und für das Antippen in der Vorschau. */
export function lage(W, H, t, s, q) {
  const c = s.c, R = rahmenInnen(c, W, H), B = bewegung(c, t, s, R.w, R.h);
  const grad = c.dreh || 0, quer = grad % 180 !== 0, ew = quer ? q.h : q.w, eh = quer ? q.w : q.h;
  let zoom = (c.zoom || 1) * B.zoom;
  if (c.kb) zoom *= 1 + 0.1 * Math.min(1, Math.max(0, (t - s.t0) / s.d)); // langsames Heranfahren
  const m = (c.passung === 'einpassen' ? Math.min(R.w / ew, R.h / eh) : Math.max(R.w / ew, R.h / eh)) * zoom;
  return { R, m, ew, eh, cx: R.w / 2 + ((c.x || 0) + B.x) * R.w, cy: R.h / 2 + ((c.y || 0) + B.y) * R.h, w: grad * Math.PI / 180 + B.dreh, sx: c.spiegel ? -1 : 1 };
}
const dreheUm = (x, y, mx, my, w) => { const co = Math.cos(w), si = Math.sin(w), dx = x - mx, dy = y - my; return [mx + dx * co - dy * si, my + dx * si + dy * co]; };
/** Punkt der Malfläche → Stelle im Quellbild (0 … 1; außerhalb des Bildes kleiner 0 oder größer 1). */
export function zuQuelle(W, H, t, s, q, x, y) {
  const L = lage(W, H, t, s, q), R = L.R;
  if (R.kipp) [x, y] = dreheUm(x, y, W / 2, H / 2, -R.kipp);
  const [px, py] = dreheUm(x - R.x - L.cx, y - R.y - L.cy, 0, 0, -L.w);
  return [px / (L.sx * L.m) / q.w + 0.5, py / L.m / q.h + 0.5];
}
/** Stelle im Quellbild (0 … 1) → Punkt der Malfläche. */
export function vonQuelle(W, H, t, s, q, u, v) {
  const L = lage(W, H, t, s, q), R = L.R;
  let [x, y] = dreheUm((u - 0.5) * q.w * L.sx * L.m, (v - 0.5) * q.h * L.m, 0, 0, L.w);
  x += R.x + L.cx; y += R.y + L.cy;
  return R.kipp ? dreheUm(x, y, W / 2, H / 2, R.kipp) : [x, y];
}

let ebeneF = null;
// Zweite Malfläche für Clips, die halb durchsichtig sind und aus mehreren Lagen bestehen (Rahmen, unscharfer Rand) – sonst schiene der Hintergrund durch.
function ebene(W, H) {
  if (!ebeneF) ebeneF = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  if (ebeneF.width !== W || ebeneF.height !== H) { ebeneF.width = W; ebeneF.height = H; }
  return ebeneF;
}

function zeichneClip(ctx, W, H, t, s, q, zus, opt) {
  const c = s.c;
  if (!q || !q.w || !q.h) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  const rahmen = c.rahmen && c.rahmen.art && c.rahmen.art !== 'keiner' ? c.rahmen : null;
  if (ctx.globalAlpha < 0.999 && (rahmen || c.passung === 'einpassen')) {
    // Erst deckend auf eine eigene Fläche malen, dann als Ganzes halb durchsichtig auflegen.
    const f = ebene(W, H), x = f.getContext('2d');
    x.save(); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H); maleClip(x, W, H, t, s, q, zus, opt, rahmen); x.restore();
    ctx.drawImage(f, 0, 0);
    return;
  }
  maleClip(ctx, W, H, t, s, q, zus, opt, rahmen);
}

function maleClip(ctx, W, H, t, s, q, zus, opt, rahmen) {
  const c = s.c, grundAlpha = ctx.globalAlpha, a = c.farbe || {}, rel = t - s.t0;
  const L = lage(W, H, t, s, q), R = L.R, nativ = kannFiltern(ctx);
  // Bildeffekte: Die Rechenstufe liefert das veränderte Bild in der Form des Quellbilds – höchstens so groß, wie es gezeigt wird.
  const P = glWerte(c, zus, t, c.art === 'video' ? quellZeit(s, t) : rel);
  const kl = Math.min(1, L.m), bild = (P && glBild(q.bild, q.w, q.h, q.w * kl, q.h * kl, P)) || q.bild;
  const male = (massstab, filter, mitte, b = bild) => {
    ctx.save();
    if (mitte) ctx.translate(R.w / 2, R.h / 2); else ctx.translate(L.cx, L.cy);
    ctx.rotate(L.w);
    ctx.scale(L.sx * massstab, massstab);
    if (nativ) ctx.filter = filter;
    ctx.drawImage(b, -q.w / 2, -q.h / 2, q.w, q.h);
    ctx.restore();
  };
  // Das Bild bildfüllend, unscharf und dunkel – als Hintergrund hinter einem eingepassten oder eingefassten Bild.
  const maleUnscharf = (B, Hh) => {
    const mh = Math.max(B / L.ew, Hh / L.eh) * 1.12;
    ctx.save(); ctx.translate(B / 2, Hh / 2); ctx.rotate((c.dreh || 0) * Math.PI / 180); ctx.scale(L.sx * mh, mh);
    if (nativ) { ctx.filter = `blur(${(Hh * 0.035).toFixed(1)}px) brightness(.55)`; ctx.drawImage(bild, -q.w / 2, -q.h / 2, q.w, q.h); }
    else ctx.drawImage(verwischt(bild, q.w, q.h, (Hh * 0.035) / mh) || bild, -q.w / 2, -q.h / 2, q.w, q.h);
    ctx.restore();
    if (!nativ) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, B, Hh); }
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (rahmen) {
    rahmenGrund(ctx, W, H, rahmen, R, () => maleUnscharf(W, H));
    if (R.kipp) { ctx.translate(W / 2, H / 2); ctx.rotate(R.kipp); ctx.translate(-W / 2, -H / 2); }
    rahmenKarte(ctx, W, H, rahmen, R);
  }
  ctx.save();
  if (rahmen && (R.x || R.y || R.r)) { ctx.beginPath(); ctx.roundRect(R.x, R.y, R.w, R.h, R.r); ctx.clip(); }
  ctx.translate(R.x, R.y);
  const f = filterText(a, R.h);
  // Ohne Canvas-Filter: Farbe über WebGL, Unschärfe über Verkleinern – das Ergebnis entspricht den Filtern.
  const vorn = () => {
    if (nativ || f === 'none') return bild;
    let b = (a.hell || a.kontrast || a.saett || a.sepia) ? (gefaerbt(bild, q.w, q.h, a) || bild) : bild;
    if (a.weich) b = verwischt(b, q.w, q.h, (a.weich / 100 * R.h * 0.02) / Math.max(0.01, L.m)) || b;
    return b;
  };
  if (c.passung === 'einpassen') {
    if (c.hg === 'unscharf') maleUnscharf(R.w, R.h);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, R.w, R.h); }
  }
  male(L.m, f, false, vorn());
  if (a.waerme) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = grundAlpha * Math.min(1, Math.abs(a.waerme) / 100 * 0.7);
    ctx.fillStyle = a.waerme > 0 ? '#ff8a1e' : '#1e86ff';
    ctx.fillRect(0, 0, R.w, R.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (a.vignette) {
    const g = ctx.createRadialGradient(R.w / 2, R.h / 2, Math.min(R.w, R.h) * 0.3, R.w / 2, R.h / 2, Math.hypot(R.w, R.h) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100 * 0.85).toFixed(3)})`);
    ctx.globalAlpha = grundAlpha; ctx.fillStyle = g; ctx.fillRect(0, 0, R.w, R.h);
  }
  ctx.globalAlpha = grundAlpha;
  if (c.fx) zeichneAuflagen(ctx, R.w, R.h, c.fx, t, rel);
  ctx.restore();
  ctx.restore();
  if (rahmen) rahmenOben(ctx, W, H, rahmen, t);
  if (opt && opt.stelle && opt.stelle.clip === c.id) zeichneStelle(ctx, W, H, t, s, q, opt.stelle);
}

// Die gewählte Stelle (oder der Bereich einer Farbänderung) wird in der Vorschau gestrichelt umrandet – so lässt sie sich anfassen und verschieben.
function zeichneStelle(ctx, W, H, t, s, q, wahl) {
  const c = s.c, e = ((wahl.liste === 'umf' ? c.umf : c.stellen) || []).find((x) => x.id === wahl.id), d = e && (wahl.liste === 'umf' ? e.bereich : stelleBei(e, c.art === 'video' ? quellZeit(s, t) : 0));
  if (!d || !(d.w > 0)) return;
  const L = lage(W, H, t, s, q), R = L.R;
  ctx.save();
  if (R.kipp) { ctx.translate(W / 2, H / 2); ctx.rotate(R.kipp); ctx.translate(-W / 2, -H / 2); }
  ctx.translate(R.x + L.cx, R.y + L.cy); ctx.rotate(L.w); ctx.scale(L.sx * L.m, L.m);
  const x = (d.x - 0.5) * q.w, y = (d.y - 0.5) * q.h, b = d.w * q.w, h = d.h * q.h, strich = Math.max(1.5, W * 0.0026) / L.m;
  ctx.beginPath(); if (d.form === 'rechteck') ctx.rect(x - b / 2, y - h / 2, b, h); else ctx.ellipse(x, y, b / 2, h / 2, 0, 0, 6.2832);
  ctx.globalAlpha = 1; ctx.lineWidth = strich * 2.2; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
  ctx.setLineDash([strich * 5, strich * 4]); ctx.lineWidth = strich; ctx.strokeStyle = '#facc15'; ctx.stroke();
  ctx.restore();
}

/** Einen Clip allein malen – für die Musterbilder der Palette. */
export function zeichneEinzel(ctx, W, H, c, q, t = 1, d = 4) {
  ctx.save(); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  maleClip(ctx, W, H, t, { c, i: 0, t0: 0, t1: d, d, ueb: 0 }, q, null, null, c.rahmen && c.rahmen.art && c.rahmen.art !== 'keiner' ? c.rahmen : null);
  ctx.restore();
}

function zeichneKarte(ctx, W, H, rel, d, k, opt) {
  const al = ctx.globalAlpha, kurz = Math.min(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a3c'); g.addColorStop(1, '#0f1923');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const ein = weichAus(rel / 0.7), ein2 = weichAus((rel - 0.35) / 0.7);
  const zeilen = [k.zeile1, k.zeile2].map(z => (z || '').trim()).filter(Boolean);
  const logo = k.logo ? opt.logo : null;
  const lw = kurz * 0.6, lh = logo ? lw * logo.height / logo.width : 0;
  const px1 = kurz * 0.052, px2 = kurz * 0.032, luft = kurz * 0.045;
  const textH = zeilen.length ? luft + px1 * 1.25 + (zeilen.length > 1 ? px2 * 1.5 : 0) : 0;
  let y = (H - lh - textH) / 2;
  if (logo) {
    const m = 0.94 + 0.06 * ein;
    ctx.globalAlpha = al * ein;
    ctx.drawImage(logo, (W - lw * m) / 2, y + (lh - lh * m) / 2, lw * m, lh * m);
    y += lh;
  }
  if (zeilen.length) {
    ctx.globalAlpha = al * ein2;
    y += luft * 0.55;
    ctx.fillStyle = '#C41E1E'; ctx.fillRect(W / 2 - kurz * 0.06 * ein2, y, kurz * 0.12 * ein2, Math.max(2, kurz * 0.006));
    y += luft * 0.45;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#E8ECF1';
    ctx.font = `600 ${px1}px "Oswald", sans-serif`;
    einpassen(ctx, zeilen[0], W / 2, y, W * 0.9, px1, '600', 'Oswald');
    if (zeilen[1]) { ctx.fillStyle = '#B0C0D4'; einpassen(ctx, zeilen[1], W / 2, y + px1 * 1.4, W * 0.9, px2, '400', 'Source Sans 3'); }
  }
  ctx.globalAlpha = al;
}

// Eine Zeile so verkleinern, dass sie in die Breite passt (für Vorspann/Abspann).
function einpassen(ctx, text, x, y, maxB, px, gewicht, schrift) {
  ctx.font = `${gewicht} ${px}px "${schrift}", sans-serif`;
  const b = ctx.measureText(text).width;
  if (b > maxB) ctx.font = `${gewicht} ${(px * maxB / b).toFixed(1)}px "${schrift}", sans-serif`;
  ctx.fillText(text, x, y);
}

function umbrechen(ctx, text, maxB) {
  const aus = [];
  for (const absatz of String(text).split('\n')) {
    const worte = absatz.split(/\s+/).filter(Boolean);
    if (!worte.length) { aus.push(''); continue; }
    let zeile = worte[0];
    for (let i = 1; i < worte.length; i++) {
      const probe = zeile + ' ' + worte[i];
      if (ctx.measureText(probe).width <= maxB) zeile = probe; else { aus.push(zeile); zeile = worte[i]; }
    }
    aus.push(zeile);
  }
  return aus;
}

function hexRgba(hex, deck) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || [0, '00', '00', '00'];
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${deck})`;
}

function zeichneTexte(ctx, W, H, t, p, opt) {
  for (const x of p.texte) {
    const sichtbar = t >= x.start - 1e-6 && t < x.ende - 1e-6;
    if (!sichtbar && opt.auswahl !== x.id) continue;
    const px = Math.max(4, x.groesse / 100 * H);
    ctx.save();
    ctx.font = `${x.kursiv ? 'italic ' : ''}${x.fett ? 700 : 400} ${px}px "${x.schrift}", sans-serif`;
    ctx.textBaseline = 'middle';
    const voll = umbrechen(ctx, x.text, W * 0.92);
    let zeilen = voll;
    const rel = t - x.start, rest = x.ende - t;
    let alpha = 1, dy = 0;
    // Wird der Text gerade bearbeitet (gewählt, Film steht), ist er immer voll zu sehen – sonst wäre er am Anfang seiner Einblendung unsichtbar.
    const bearbeitet = opt.auswahl === x.id && !opt.spielt;
    if (sichtbar && !bearbeitet && x.anim && x.anim !== 'keine') {
      alpha = Math.min(1, rel / 0.35, rest / 0.35);
      if (x.anim === 'hoch') dy = (1 - weichAus(rel / 0.5)) * H * 0.045;
      if (x.anim === 'tippen') {
        const alle = zeilen.join('\n').length, zeig = Math.floor(alle * Math.min(1, rel / Math.min(1.8, (x.ende - x.start) * 0.5)));
        let rest2 = zeig; zeilen = voll.map(z => { const s = z.slice(0, Math.max(0, rest2)); rest2 -= z.length + 1; return s; });
        alpha = Math.min(1, rest / 0.35);
      }
    }
    if (!sichtbar) alpha = 0.35; // gewählter Text außerhalb seiner Zeit: blass zeigen, damit man ihn setzen kann
    const breiten = voll.map(z => ctx.measureText(z).width);
    const bw = Math.max(1, ...breiten), zh = px * 1.24, bh = zh * breiten.length;
    const ax = x.x * W, links = x.ausr === 'links' ? ax : x.ausr === 'rechts' ? ax - bw : ax - bw / 2;
    const oben = x.y * H - bh / 2 + dy;
    const padX = px * 0.42, padY = px * 0.2;
    ctx.globalAlpha = Math.max(0, alpha);
    if (x.kasten) {
      ctx.fillStyle = hexRgba(x.kastenFarbe, (x.kastenDeck ?? 60) / 100);
      ctx.beginPath(); ctx.roundRect(links - padX, oben - padY, bw + 2 * padX, bh + 2 * padY, px * 0.16); ctx.fill();
    }
    if (x.schatten) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.06; }
    ctx.fillStyle = x.farbe || '#fff';
    zeilen.forEach((z, i) => {
      const zb = breiten[i] ?? ctx.measureText(z).width;
      const zx = x.ausr === 'links' ? links : x.ausr === 'rechts' ? links + bw - zb : links + (bw - zb) / 2;
      const zy = oben + zh * i + zh / 2;
      if (x.kontur) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.lineWidth = px * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(z, zx, zy); ctx.restore(); }
      ctx.fillText(z, zx, zy);
    });
    ctx.restore();
    const box = { id: x.id, x: links - padX, y: oben - padY, w: bw + 2 * padX, h: bh + 2 * padY };
    if (opt.boxen) opt.boxen.push(box);
    if (opt.auswahl === x.id) {
      ctx.save(); ctx.setLineDash([Math.max(4, W * 0.008), Math.max(3, W * 0.006)]); ctx.lineWidth = Math.max(1.5, W * 0.0022);
      ctx.strokeStyle = '#facc15'; ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.restore();
    }
  }
}

// Zwei möglichst gleich lange Zeilen statt „lange Zeile + ein Wort“.
function ausgewogen(ctx, text, maxB) {
  if (ctx.measureText(text).width <= maxB) return [text];
  const w = text.split(/\s+/).filter(Boolean); let beste = null;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), ba = ctx.measureText(a).width, bb = ctx.measureText(b).width;
    if (ba <= maxB && bb <= maxB && (!beste || Math.max(ba, bb) < beste[2])) beste = [a, b, Math.max(ba, bb)];
  }
  return beste ? [beste[0], beste[1]] : umbrechen(ctx, text, maxB);
}

// Automatische Untertitel (Schalter): die Zeile, die zur Zeit t gesprochen wird. Liste kommt aus rechne() – gleich für Vorschau und Ausgabe.
function zeichneUntertitel(ctx, W, H, t, p, lay) {
  if (!p.schalter.untertitel || !lay.ut || !lay.ut.length) return;
  let z = null;
  for (const u of lay.ut) { if (u.start > t + 1e-6) break; if (t < u.ende - 1e-6) { z = u; break; } }
  if (!z) return;
  const U = p.untertitel || {}, hoch = H > W * 1.2, text = U.gross ? z.text.toLocaleUpperCase('de-DE') : z.text;
  let px = Math.max(8, (U.groesse || 4.6) / 100 * Math.min(W, H));
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let zl;
  for (let versuch = 0; versuch < 4; versuch++) {            // passt die Zeile nicht in drei Reihen, wird die Schrift kleiner
    ctx.font = `700 ${px}px "Source Sans 3", sans-serif`;
    zl = ausgewogen(ctx, text, W * 0.86);
    if (zl.length <= 3) break; px *= 0.85;
  }
  const zh = px * 1.24, bh = zh * zl.length, bw = Math.max(1, ...zl.map((q) => ctx.measureText(q).width));
  const mitte = U.lage === 'oben' ? H * (hoch ? 0.16 : 0.12) : U.lage === 'mitte' ? H * 0.5 : H * (hoch ? 0.76 : 0.88), oben = mitte - bh / 2;
  if (U.kasten !== false) {
    const padX = px * 0.5, padY = px * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2 - padX, oben - padY, bw + 2 * padX, bh + 2 * padY, px * 0.2); ctx.fill();
  }
  zl.forEach((q, i) => {
    const y = oben + zh * i + zh / 2;
    if (U.kasten === false) { ctx.lineJoin = 'round'; ctx.lineWidth = px * 0.2; ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.strokeText(q, W / 2, y); }
    ctx.fillStyle = '#fff'; ctx.fillText(q, W / 2, y);
  });
  ctx.restore();
}

function zeichneLogo(ctx, W, H, L, logo, staerke = 1) {
  const kurz = Math.min(W, H), lw = kurz * L.groesse / 100, lh = lw * logo.height / logo.width;
  const pad = lw * 0.07, rand = kurz * 0.035, bw = lw + 2 * pad, bh = lh + 2 * pad;
  const x = L.ecke[1] === 'l' ? rand : W - rand - bw, y = L.ecke[0] === 'o' ? rand : H - rand - bh;
  ctx.save();
  ctx.globalAlpha = (L.deck ?? 90) / 100 * staerke;
  // Original-Logo (weiß/rot) immer auf dunklem Schild – so wie auf der Firmen-Webseite.
  ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, bh * 0.14); ctx.fill();
  ctx.drawImage(logo, x + pad, y + pad, lw, lh);
  ctx.restore();
}
