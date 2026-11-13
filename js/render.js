// TW Schnittraum – Bildaufbau. Ein und dieselbe Funktion malt die Vorschau und jedes Bild der fertigen Datei,
// damit das Ergebnis genau so aussieht wie in der Vorschau. Alle Maße hängen an W/H (Vorschau klein, Ausgabe groß).
import { aktive } from './modell.js';
import { gefaerbt, verwischt } from './farbe-ersatz.js';

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

// quelle(seg, t) liefert { bild, w, h } (Videobild oder Foto) oder null, wenn noch nichts da ist.
// opt: { logo: Bild, auswahl: Text-ID, spielt: läuft die Vorschau?, boxen: [] (wird mit den Text-Rahmen gefüllt, für das Anfassen in der Vorschau) }
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
    const art = k < 1 ? c.ueb.art : null, artAus = kAus > 0 ? n.c.ueb.art : null;
    let alpha = 1, dx = 0, schnitt = null;
    if (art === 'blende') alpha = k;
    else if (art === 'schwarz' || art === 'weiss') alpha = k < 0.5 ? 0 : (k - 0.5) * 2;
    else if (art === 'schieben') dx = (1 - weichAus(k)) * W;
    else if (art === 'wischen') schnitt = weichAus(k) * W;
    if (artAus === 'schwarz' || artAus === 'weiss') alpha *= kAus < 0.5 ? 1 - kAus * 2 : 0;
    else if (artAus === 'schieben') dx = -weichAus(kAus) * W;
    const rel = t - s.t0, rest = s.t1 - t;
    if (c.einbl > 0 && rel < c.einbl) alpha *= rel / c.einbl;
    if (c.ausbl > 0 && rest < c.ausbl) alpha *= rest / c.ausbl;
    if (c.art === 'karte') karte = Math.max(karte, Math.min(1, alpha));
    if (alpha <= 0.001) continue;
    ctx.save();
    if (schnitt !== null) { ctx.beginPath(); ctx.rect(0, 0, schnitt, H); ctx.clip(); }
    if (dx) ctx.translate(dx, 0);
    ctx.globalAlpha = Math.min(1, alpha);
    if (c.art === 'karte') zeichneKarte(ctx, W, H, rel, s.d, c.karte, opt);
    else zeichneClip(ctx, W, H, t, s, quelle(s, t));
    ctx.restore();
  }

  zeichneTexte(ctx, W, H, t, p, opt);
  zeichneUntertitel(ctx, W, H, t, p, lay);
  if (p.schalter.logo && opt.logo && karte < 0.99) zeichneLogo(ctx, W, H, p.logo, opt.logo, 1 - karte); // auf Vor-/Abspann steht das Logo schon groß
  ctx.restore();
}

function zeichneClip(ctx, W, H, t, s, q) {
  const c = s.c, grundAlpha = ctx.globalAlpha;
  if (!q || !q.w || !q.h) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  const a = c.farbe || {};
  const grad = c.dreh || 0, dreh = grad * Math.PI / 180, quer = grad % 180 !== 0;
  const ew = quer ? q.h : q.w, eh = quer ? q.w : q.h;
  let zoom = c.zoom || 1;
  if (c.kb) zoom *= 1 + 0.1 * Math.min(1, Math.max(0, (t - s.t0) / s.d)); // langsames Heranfahren
  const nativ = kannFiltern(ctx);
  const male = (massstab, filter, mx, my, bild = q.bild) => {
    ctx.save();
    ctx.translate(W / 2 + mx * W, H / 2 + my * H);
    ctx.rotate(dreh);
    ctx.scale((c.spiegel ? -1 : 1) * massstab, massstab);
    if (nativ) ctx.filter = filter;
    ctx.drawImage(bild, -q.w / 2, -q.h / 2, q.w, q.h);
    ctx.restore();
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const f = filterText(a, H);
  // Ohne Canvas-Filter: Farbe über WebGL, Unschärfe über Verkleinern – das Ergebnis entspricht den Filtern.
  const vorn = () => {
    if (nativ || f === 'none') return q.bild;
    let b = (a.hell || a.kontrast || a.saett || a.sepia) ? (gefaerbt(q.bild, q.w, q.h, a) || q.bild) : q.bild;
    if (a.weich) { const m = (c.passung === 'einpassen' ? Math.min(W / ew, H / eh) : Math.max(W / ew, H / eh)) * zoom; b = verwischt(b, q.w, q.h, (a.weich / 100 * H * 0.02) / Math.max(0.01, m)) || b; }
    return b;
  };
  if (c.passung === 'einpassen') {
    if (c.hg === 'unscharf') {
      const mh = Math.max(W / ew, H / eh) * 1.12;
      if (nativ) male(mh, `blur(${(H * 0.035).toFixed(1)}px) brightness(.55)`, 0, 0);
      else { male(mh, 'none', 0, 0, verwischt(q.bild, q.w, q.h, (H * 0.035) / mh) || q.bild); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); }
    } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    male(Math.min(W / ew, H / eh) * zoom, f, c.x || 0, c.y || 0, vorn());
  } else {
    male(Math.max(W / ew, H / eh) * zoom, f, c.x || 0, c.y || 0, vorn());
  }
  if (a.waerme) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = grundAlpha * Math.min(1, Math.abs(a.waerme) / 100 * 0.7);
    ctx.fillStyle = a.waerme > 0 ? '#ff8a1e' : '#1e86ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (a.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100 * 0.85).toFixed(3)})`);
    ctx.globalAlpha = grundAlpha; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
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
