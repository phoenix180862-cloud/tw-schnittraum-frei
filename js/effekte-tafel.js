// TW Schnittraum – Effekte in der Tafel „Einstellen“: die Palette zum Antippen (mit Musterbildern aus dem eigenen Clip), Rahmen, Bewegung,
// „Farbe ändern“ (Farbe im Bild antippen) und „Stellen im Bild“ (weichzeichnen, verpixeln, abdecken, hervorheben, vergrößern).
// Grundsatz: alles aus, bis es angetippt wird. Was hier eingestellt wird, sieht in der Vorschau genauso aus wie in der fertigen Datei.
import { FORMATE, klemm } from './modell.js';
import { EFFEKTE, EFFEKT_GRUPPEN, RAHMEN, BEWEGUNGEN, STELLEN_ARTEN, UMF_ARTEN, STELLEN_HOECHSTENS, FARBEN_HOECHSTENS, neueStelle, neueFarbe } from './effekte.js';
import { zeichneEinzel, zuQuelle } from './render.js';
import { effekteBereit } from './effekte-gl.js';
import { medien } from './medien.js';
import { h, chips, regler, farbwahl, fenster, prozent } from './bausteine.js';

const FARBEN = [['#FFFFFF', 'Weiß'], ['#000000', 'Schwarz'], ['#C41E1E', 'Rot'], ['#FACC15', 'Gelb'], ['#4DA6FF', 'Blau'], ['#27AE60', 'Grün'], ['#F28C28', 'Orange'], ['#8E5BD6', 'Lila']];
const RAHMEN_FARBEN = [['#FFFFFF', 'Weiß'], ['#000000', 'Schwarz'], ['#0F1923', 'Dunkelblau'], ['#1A2A3C', 'Blaugrau'], ['#C41E1E', 'Rot'], ['#FACC15', 'Gelb'], ['#F6F3EA', 'Creme']];
const BREITE_NAME = { kino: 'Höhe', ecken: 'Länge', unscharf: 'Rand', schatten: 'Rand', polaroid: 'Rand' };
const MUSTER_ZEIT = { blitz: 0.12, strobo: 0.03 };      // diese Effekte sind nur kurz zu sehen – das Musterbild zeigt den richtigen Augenblick
const warte = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function baueEffektTafel(K) {
  const Z = K.Z; Z.fx = { wahl: null, pick: null };
  const live = (fn) => K.aendere(fn, false), fest = () => K.fest(), neu = () => { K.tafelNeu(); K.vor.neu(); };
  const teil = (titel, ...rest) => h('div', { class: 'e-teil' }, titel ? h('h4', {}, titel) : null, ...rest);
  const segVon = (c) => Z.lay.segs.find((s) => s.c === c);
  const flaeche = () => document.getElementById('bild');
  const weg = (titel, tun) => h('button', { class: 'ib fx-weg', title: titel, 'aria-label': titel, onclick: (ev) => { ev.stopPropagation(); tun(); } }, '✕');
  let glStand = null;                                   // '' = dieses Gerät kann die rechnenden Effekte nicht; sonst die Art der Rechenstufe

  // Den Abspielzeiger auf den Clip stellen, damit man in der Vorschau sieht, was man einstellt.
  function zumClip(c) { const s = segVon(c), t = K.vor.zeigZeit(); if (s && !(t >= s.t0 - 1e-6 && t < s.t1 - 1e-6) && !K.vor.laeuft()) K.vor.geh(s.t0 + Math.min(0.5, s.d / 2)); }
  // Das Bild des Clips, wie es gerade in der Vorschau liegt: { s, q, t } oder null.
  function bildVon(c) { const s = segVon(c), t = K.vor.zeigZeit(), q = s && t >= s.t0 - 1e-6 && t < s.t1 ? K.vor.quelle(s) : null; return q ? { s, q, t } : null; }
  function waehle(c, liste, id) { Z.fx.wahl = id ? { clip: c.id, liste, id } : null; Z.fx.pick = null; flaeche().classList.remove('zielen'); if (id) { K.vor.halt(); zumClip(c); } neu(); }

  // ───────── Effekte ─────────
  function teilEffekte(c) {
    const an = Object.keys(c.fx || {}).filter((k) => c.fx[k] > 0 && EFFEKTE[k]);
    const zeilen = an.map((k) => {
      const [name, , std, ohneRegler] = EFFEKTE[k];
      return h('div', { class: 'fx-zeile', 'data-fx': k }, ohneRegler ? h('div', { class: 'fx-name' }, name) : regler(name, c.fx[k], { min: 5, max: 100, schritt: 5, zeige: prozent, std }, (v) => live(() => { c.fx[k] = v; }), fest),
        weg(name + ' ausschalten', () => { K.aendere(() => { delete c.fx[k]; }); neu(); }));
    });
    return teil(h('span', { style: { display: 'contents' } }, 'Effekte', an.length ? h('button', { class: 'btn klein', id: 'fxAus', onclick: () => { K.aendere(() => { c.fx = {}; }); neu(); } }, 'Alle aus') : null),
      h('button', { class: 'btn voll', id: 'bFxPalette', title: 'Große Auswahl an Bildeffekten – mit Musterbildern aus deinem Clip', onclick: () => zeigPalette(c, 'fx') }, an.length ? `❖ Effekt-Palette (${an.length} an)` : '❖ Effekt-Palette öffnen'),
      zeilen,
      c.fx && c.fx.duoton > 0 ? [h('label', { class: 'lbl' }, 'Farbe für „Zweifarbig“'), farbwahl(FARBEN, c.fxFarbe || '#C41E1E', (f, ende) => { live(() => { c.fxFarbe = f; }); if (ende) fest(); })] : null,
      an.length && Z.p.clips.length > 1 ? h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: () => { K.aendere((p) => { for (const k of p.clips) { k.fx = { ...c.fx }; if (c.fxFarbe) k.fxFarbe = c.fxFarbe; } }); K.sag('Effekte auf alle Clips übertragen.'); } }, 'Auf alle Clips übertragen') : null,
      glStand === '' ? h('div', { class: 'notiz' }, 'Dieses Gerät kann einen Teil der Bildeffekte nicht darstellen. Rahmen, Bewegung, Licht und Wetter gehen trotzdem.') : null);
  }

  // ───────── Rahmen ─────────
  function teilRahmen(c) {
    const R = c.rahmen || { art: 'keiner' }, an = R.art !== 'keiner' && !!RAHMEN[R.art], [name, std, was] = RAHMEN[an ? R.art : 'keiner'];
    return teil('Rahmen und Einfassung',
      h('button', { class: 'btn voll', id: 'bRahmen', title: 'Das Video einfassen: unscharfer Rand, Farbrand, Sofortbild, Filmstreifen, Kinobalken …', onclick: () => zeigPalette(c, 'rahmen') }, an ? '▣ Rahmen: ' + name : '▣ Rahmen wählen'),
      an && was.includes('b') ? regler(BREITE_NAME[R.art] || 'Breite', R.staerke ?? 50, { min: 0, max: 100, schritt: 5, zeige: prozent, std: std.staerke }, (v) => live(() => { R.staerke = v; }), fest) : null,
      an && was.includes('e') ? regler('Runde Ecken', R.rund ?? 0, { min: 0, max: 100, schritt: 5, zeige: prozent, std: std.rund }, (v) => live(() => { R.rund = v; }), fest) : null,
      an && was.includes('f') ? [h('label', { class: 'lbl' }, 'Farbe'), farbwahl(RAHMEN_FARBEN, R.farbe || '#FFFFFF', (f, ende) => { live(() => { R.farbe = f; }); if (ende) fest(); })] : null,
      an && Z.p.clips.length > 1 ? h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: () => { K.aendere((p) => { for (const k of p.clips) k.rahmen = { ...R }; }); K.sag('Rahmen auf alle Clips übertragen.'); } }, 'Auf alle Clips übertragen') : null);
  }

  // ───────── Bewegung ─────────
  function teilBewegung(c) {
    const B = c.bew || { art: 'keine', staerke: 50 };
    return teil('Bewegung',
      chips(Object.entries(BEWEGUNGEN), B.art, (v) => { K.aendere(() => { c.bew = { art: v, staerke: B.staerke ?? 50 }; }); neu(); const s = segVon(c); if (s && v !== 'keine' && !K.vor.laeuft()) K.vor.geh(s.t0 + 0.01); }),
      B.art !== 'keine' ? regler('Stärke', B.staerke ?? 50, { min: 10, max: 100, schritt: 5, zeige: prozent, std: 50 }, (v) => live(() => { c.bew.staerke = v; }), fest) : null,
      h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, 'Bewegt das Bild über die Dauer des Clips – auch bei Fotos. Zum Ansehen den Film abspielen.'));
  }

  // ───────── Farbe ändern ─────────
  const bereichRegler = (d) => [
    h('label', { class: 'lbl' }, 'Form'), chips([['ellipse', 'Rund'], ['rechteck', 'Eckig']], d.form || 'ellipse', (v) => { K.aendere(() => { d.form = v; }); }),
    regler('Breite', Math.round(d.w * 100), { min: 3, max: 100, zeige: prozent, std: 30 }, (v) => live(() => { d.w = v / 100; }), fest),
    regler('Höhe', Math.round(d.h * 100), { min: 3, max: 100, zeige: prozent, std: 30 }, (v) => live(() => { d.h = v / 100; }), fest),
    h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'In der Vorschau anfassen und verschieben – oder einfach dorthin tippen.')];

  function teilFarbe(c) {
    const liste = c.umf || [], w = Z.fx.wahl, offen = w && w.clip === c.id && w.liste === 'umf' ? liste.find((e) => e.id === w.id) : null, aus = [];
    for (const e of liste) aus.push(h('div', { class: 'liste-eintrag fx-eintrag' + (e === offen ? ' an' : ''), 'data-id': e.id, onclick: () => waehle(c, 'umf', e === offen ? null : e.id) },
      h('i', { class: 'fx-fleck', style: { background: e.von } }), e.art === 'neu' ? [h('span', {}, '→'), h('i', { class: 'fx-fleck', style: { background: e.nach } })] : null, h('span', { class: 'n' }, UMF_ARTEN[e.art] || 'Umfärben'),
      weg('Diese Farbänderung entfernen', () => { K.aendere(() => { c.umf = c.umf.filter((x) => x !== e); }); if (e === offen) Z.fx.wahl = null; neu(); })));
    if (offen) {
      const e = offen;
      aus.push(h('div', { class: 'fx-unter' },
        chips(Object.entries(UMF_ARTEN), e.art, (v) => { K.aendere(() => { e.art = v; }); neu(); }),
        e.art === 'neu' ? [h('label', { class: 'lbl' }, 'Neue Farbe'), farbwahl(FARBEN, e.nach, (f, ende) => { live(() => { e.nach = f; }); if (ende) { fest(); neu(); } })] : null,
        regler('Wie ähnlich', e.tol ?? 30, { min: 5, max: 100, schritt: 1, zeige: prozent, std: 30 }, (v) => live(() => { e.tol = v; }), fest),
        regler('Weiche Kante', e.weich ?? 40, { min: 0, max: 100, schritt: 5, zeige: prozent, std: 40 }, (v) => live(() => { e.weich = v; }), fest),
        regler('Stärke', e.staerke ?? 100, { min: 10, max: 100, schritt: 5, zeige: prozent, std: 100 }, (v) => live(() => { e.staerke = v; }), fest),
        h('label', { class: 'lbl' }, 'Wo?'), chips([['alles', 'Im ganzen Bild'], ['stelle', 'Nur an einer Stelle']], e.bereich ? 'stelle' : 'alles', (v) => {
          K.aendere(() => { e.bereich = v === 'stelle' ? { form: 'ellipse', x: klemm(e.px ?? 0.5, 0, 1), y: klemm(e.py ?? 0.5, 0, 1), w: 0.4, h: 0.4 } : null; }); neu(); }),
        e.bereich ? bereichRegler(e.bereich) : h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'Wird zu viel umgefärbt: „Wie ähnlich“ kleiner stellen oder „Nur an einer Stelle“ wählen.'),
        h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => starteWahl(c, e.id) }, 'Farbe neu antippen'), h('button', { class: 'btn klein', onclick: () => waehle(c, 'umf', null) }, 'Fertig'))));
    }
    if (Z.fx.pick && Z.fx.pick.clip === c.id) aus.push(h('div', { class: 'notiz blau', id: 'fxZielen' }, h('b', {}, 'Jetzt in der Vorschau auf die Farbe tippen, '), 'die du ändern willst – zum Beispiel auf den Schiffsrumpf, eine Jacke oder eine Wand.',
      h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => { Z.fx.pick = null; flaeche().classList.remove('zielen'); neu(); } }, 'Abbrechen'))));
    else if (liste.length < FARBEN_HOECHSTENS) aus.push(h('button', { class: 'btn voll', id: 'bFarbeWahl', title: 'Eine Farbe im Bild antippen und umfärben – oder nur diese Farbe behalten', onclick: () => starteWahl(c, null) }, '◐ Farbe im Bild antippen'));
    if (!liste.length && !Z.fx.pick) aus.push(h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, 'Gibt einer Sache im Bild eine andere Farbe – Schatten und Glanz bleiben erhalten.'));
    return teil('Farbe ändern', ...aus);
  }
  function starteWahl(c, fuer) { K.vor.halt(); zumClip(c); Z.fx.pick = { clip: c.id, fuer }; flaeche().classList.add('zielen'); neu(); }

  let probe = null;
  // Farbe an einem Punkt der Vorschau – aus dem unveränderten Bild des Clips gelesen (kleiner Fleck, gemittelt).
  function farbeBei(c, x, y) {
    const b = bildVon(c), el = flaeche(); if (!b) return null;
    const { q } = b, [u, v] = zuQuelle(el.width, el.height, b.t, b.s, q, x, y); if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
    if (!probe) { probe = document.createElement('canvas'); probe.width = 4; probe.height = 4; }
    const px = probe.getContext('2d', { willReadFrequently: true }), r = Math.max(2, Math.round(Math.min(q.w, q.h) * 0.008));
    try {
      px.drawImage(q.bild, klemm(u * q.w - r, 0, Math.max(0, q.w - 2 * r)), klemm(v * q.h - r, 0, Math.max(0, q.h - 2 * r)), 2 * r, 2 * r, 0, 0, 4, 4);
      const d = px.getImageData(0, 0, 4, 4).data, sum = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      return { hex: '#' + sum.map((n) => Math.round(n / 16).toString(16).padStart(2, '0')).join(''), u, v };
    } catch (e) { console.warn('Farbe lesen', e); return null; }
  }
  /** Die Vorschau wurde angetippt, während eine Farbe gewählt wird. → true, wenn der Tipp verbraucht ist. */
  function getippt(x, y) {
    const pk = Z.fx.pick; if (!pk) return false;
    const c = Z.p.clips.find((k) => k.id === pk.clip);
    if (!c) { Z.fx.pick = null; flaeche().classList.remove('zielen'); return false; }       // der Clip ist nicht mehr da (anderer Film geöffnet)
    const f = farbeBei(c, x, y);
    if (!f) { K.sag('Bitte direkt auf das Bild des gewählten Clips tippen.', true); return true; }
    let id = pk.fuer;
    K.aendere(() => { if (!Array.isArray(c.umf)) c.umf = []; let e = c.umf.find((k) => k.id === id); if (!e) { e = neueFarbe(f.hex); c.umf.push(e); id = e.id; } e.von = f.hex; e.px = f.u; e.py = f.v; });
    Z.fx.pick = null; Z.fx.wahl = { clip: c.id, liste: 'umf', id }; flaeche().classList.remove('zielen'); neu();
    return true;
  }

  // ───────── Stellen im Bild ─────────
  function teilStellen(c) {
    const liste = c.stellen || [], w = Z.fx.wahl, offen = w && w.clip === c.id && w.liste === 'stellen' ? liste.find((e) => e.id === w.id) : null, aus = [];
    for (const e of liste) aus.push(h('div', { class: 'liste-eintrag fx-eintrag' + (e === offen ? ' an' : ''), 'data-id': e.id, onclick: () => waehle(c, 'stellen', e === offen ? null : e.id) },
      h('span', { class: 'n' }, (STELLEN_ARTEN[e.art] || 'Stelle') + (e.spur ? ' · folgt dem Bild' : '')),
      weg('Diese Stelle entfernen', () => { K.aendere(() => { c.stellen = c.stellen.filter((x) => x !== e); }); if (e === offen) Z.fx.wahl = null; neu(); })));
    if (offen) {
      const e = offen;
      aus.push(h('div', { class: 'fx-unter' },
        chips(Object.entries(STELLEN_ARTEN), e.art, (v) => { K.aendere(() => { e.art = v; }); neu(); }),
        e.art === 'balken' ? [h('label', { class: 'lbl' }, 'Farbe'), farbwahl(FARBEN, e.farbe || '#000000', (f, ende) => { live(() => { e.farbe = f; }); if (ende) fest(); })]
          : regler('Stärke', e.staerke ?? 60, { min: 10, max: 100, schritt: 5, zeige: prozent, std: 60 }, (v) => live(() => { e.staerke = v; }), fest),
        e.spur ? h('p', { class: 'hinweis' }, 'Diese Stelle folgt dem Bild von selbst.') : bereichRegler(e),
        h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => waehle(c, 'stellen', null) }, 'Fertig'))));
    }
    if (liste.length < STELLEN_HOECHSTENS) aus.push(h('button', { class: 'btn voll', id: 'bStelleNeu', title: 'Eine Stelle im Bild weichzeichnen, verpixeln, abdecken, hervorheben oder vergrößern', onclick: () => {
      const e = neueStelle(); K.aendere(() => { if (!Array.isArray(c.stellen)) c.stellen = []; c.stellen.push(e); }); waehle(c, 'stellen', e.id); } }, '◎ Stelle im Bild bearbeiten'));
    if (!liste.length) aus.push(h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, 'Zum Beispiel ein Kennzeichen oder ein Gesicht unkenntlich machen – oder eine Einzelheit hervorheben.'));
    return teil('Stellen im Bild', ...aus);
  }
  /** Die gewählte Stelle in der Vorschau anfassen. → { zieh(x, y), los() } oder null. Daneben getippt: Die Stelle springt dorthin. */
  function fasse(x, y) {
    const w = Z.fx.wahl; if (!w) return null;
    const c = Z.p.clips.find((k) => k.id === w.clip), b = c && bildVon(c), el = flaeche(); if (!b) return null;
    const e = ((w.liste === 'umf' ? c.umf : c.stellen) || []).find((k) => k.id === w.id), d = e && (w.liste === 'umf' ? e.bereich : e); if (!d || d.spur) return null;
    const ort = (px, py) => zuQuelle(el.width, el.height, b.t, b.s, b.q, px, py), [u0, v0] = ort(x, y);
    const innen = Math.abs(u0 - d.x) <= d.w / 2 + 0.03 && Math.abs(v0 - d.y) <= d.h / 2 + 0.03;
    if (!innen) K.aendere(() => { d.x = klemm(u0, 0, 1); d.y = klemm(v0, 0, 1); }, false);
    const x0 = d.x, y0 = d.y;
    return { zieh(px, py) { const [u, v] = ort(px, py); K.aendere(() => { d.x = klemm(x0 + u - u0, 0, 1); d.y = klemm(y0 + v - v0, 0, 1); }, false); }, los() { K.fest(); } };
  }

  // ───────── Palette mit Musterbildern ─────────
  // Ein kleines Standbild des Clips – daraus entstehen die Musterbilder. Liegt der Clip gerade nicht in der Vorschau, hilft das Vorschaubild der Mediathek.
  async function musterBild(c) {
    const klein = (bild, w, h) => { const k = Math.min(1, 420 / Math.max(w, h)), f = document.createElement('canvas'); f.width = Math.max(2, Math.round(w * k)); f.height = Math.max(2, Math.round(h * k)); f.getContext('2d').drawImage(bild, 0, 0, f.width, f.height); return { bild: f, w: f.width, h: f.height }; };
    const m = medien.get(c.medium);
    for (let i = 0; i < 14; i++) { const b = bildVon(c); if (b) return klein(b.q.bild, b.q.w, b.q.h); if (m && m.bild) break; await warte(70); }
    if (m && m.bild) return klein(m.bild, m.bild.width, m.bild.height);
    if (m && m.thumb) { try { const b = new Image(); b.src = m.thumb; await b.decode(); return klein(b, b.naturalWidth, b.naturalHeight); } catch (e) { /* dann das Muster unten */ } }
    const f = document.createElement('canvas'); f.width = 320; f.height = 180; const x = f.getContext('2d'), g = x.createLinearGradient(0, 0, 320, 180);
    g.addColorStop(0, '#4DA6FF'); g.addColorStop(0.55, '#E8ECF1'); g.addColorStop(1, '#C41E1E'); x.fillStyle = g; x.fillRect(0, 0, 320, 180); x.fillStyle = '#1A2A3C'; x.beginPath(); x.arc(160, 90, 46, 0, 6.2832); x.fill();
    return { bild: f, w: 320, h: 180 };
  }
  function zeigPalette(c, was) {
    K.vor.halt(); zumClip(c);
    const fx = was === 'fx', fm = FORMATE[Z.p.format], kw = fm.w >= fm.h ? 192 : Math.round(192 * fm.w / fm.h), kh = fm.w >= fm.h ? Math.round(192 * fm.h / fm.w) : 192;
    const f = fenster(fx ? 'Effekt-Palette' : 'Rahmen und Einfassung', { breite: 900, beiZu: () => neu() }), auftraege = [];
    const grund = () => { const k = JSON.parse(JSON.stringify(c)); k.fx = {}; k.rahmen = { art: 'keiner' }; k.bew = { art: 'keine' }; k.stellen = []; k.umf = []; k.kb = false; return k; };
    const kachel = (id, name, an, aendere, zeit) => {
      const cv = h('canvas', { width: kw, height: kh }), b = h('button', { type: 'button', class: 'pal-kachel' + (an ? ' an' : ''), 'data-id': id, 'aria-pressed': String(!!an), onclick: () => tipp(id, b) }, cv, h('span', {}, name));
      auftraege.push((q) => { const k = grund(); aendere(k); zeichneEinzel(cv.getContext('2d'), kw, kh, k, q, zeit ?? 1.3, 4); });
      return b;
    };
    const raster = (kacheln) => h('div', { class: 'pal-raster' + (kh > kw ? ' hoch' : '') }, kacheln);
    const tipp = (id, b) => {
      if (fx) {
        const an = !(c.fx && c.fx[id] > 0);
        K.aendere(() => { if (!c.fx) c.fx = {}; if (an) c.fx[id] = EFFEKTE[id][2]; else delete c.fx[id]; });
        b.classList.toggle('an', an); b.setAttribute('aria-pressed', String(an)); zeigZahl();
      } else { K.aendere(() => { c.rahmen = { art: id, ...RAHMEN[id][1] }; }); f.zu(); }
    };
    const zahl = h('span', { class: 'hinweis', id: 'palZahl' });
    const zeigZahl = () => { const n = Object.keys(c.fx || {}).filter((k) => c.fx[k] > 0 && EFFEKTE[k]).length; zahl.textContent = n ? (n === 1 ? '1 Effekt an' : n + ' Effekte an') : 'Kein Effekt an'; };
    if (fx) {
      f.inhalt.append(h('p', { class: 'hinweis', style: { margin: '0 0 6px' } }, 'Antippen schaltet einen Effekt ein oder aus – mehrere lassen sich mischen. Die Stärke stellst du danach rechts unter „Effekte“ ein.'));
      for (const [g, gname] of Object.entries(EFFEKT_GRUPPEN)) f.inhalt.append(h('div', { class: 'gruppe' }, gname),
        raster(Object.entries(EFFEKTE).filter(([, e]) => e[1] === g).map(([id, e]) => kachel(id, e[0], c.fx && c.fx[id] > 0, (k) => { k.fx = { [id]: e[2] }; }, MUSTER_ZEIT[id]))));
      zeigZahl();
      f.fuss.append(zahl, h('span', { class: 'platz' }), h('button', { class: 'btn', id: 'palAus', onclick: () => { K.aendere(() => { c.fx = {}; }); for (const b of f.inhalt.querySelectorAll('.pal-kachel.an')) { b.classList.remove('an'); b.setAttribute('aria-pressed', 'false'); } zeigZahl(); } }, 'Alle aus'),
        h('button', { class: 'btn primaer', id: 'palFertig', onclick: () => f.zu() }, 'Fertig'));
    } else {
      f.inhalt.append(h('p', { class: 'hinweis', style: { margin: '0 0 6px' } }, 'Antippen wählt den Rahmen. Breite, Ecken und Farbe stellst du danach rechts unter „Rahmen und Einfassung“ ein.'),
        raster(Object.entries(RAHMEN).map(([id, e]) => kachel(id, e[0], ((c.rahmen && c.rahmen.art) || 'keiner') === id, (k) => { k.rahmen = { art: id, ...e[1] }; }))));
      f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
    }
    // Musterbilder nach und nach malen – das Fenster ist sofort da.
    (async () => {
      const q = await musterBild(c);
      if (fx && glStand === null) glStand = effekteBereit();
      const schub = () => { if (!f.kasten.isConnected) return; for (let i = 0; i < 4 && auftraege.length; i++) { try { auftraege.shift()(q); } catch (e) { console.warn('Musterbild', e); } } if (auftraege.length) requestAnimationFrame(schub); else f.kasten.dataset.fertig = '1'; };
      schub();
    })();
  }

  /** Taste „Entf“: Ist eine Stelle oder eine Farbänderung angefasst, wird nur sie entfernt (nicht der ganze Clip). → true, wenn etwas entfernt wurde. */
  function entferneWahl() {
    const w = Z.fx.wahl, c = w && Z.p.clips.find((k) => k.id === w.clip); if (!c) return false;
    K.aendere(() => { if (w.liste === 'umf') c.umf = (c.umf || []).filter((e) => e.id !== w.id); else c.stellen = (c.stellen || []).filter((e) => e.id !== w.id); });
    Z.fx.wahl = null; neu(); return true;
  }
  /** Taste „Esc“: erst die Farbwahl abbrechen bzw. die angefasste Stelle loslassen. → true, wenn es etwas loszulassen gab. */
  function lassLos() {
    if (!Z.fx.wahl && !Z.fx.pick) return false;
    Z.fx.wahl = null; Z.fx.pick = null; flaeche().classList.remove('zielen'); neu(); return true;
  }

  return { teile: (c) => [teilEffekte(c), teilRahmen(c), teilBewegung(c), teilFarbe(c), teilStellen(c)], getippt, fasse, zeigPalette, entferneWahl, lassLos };
}
