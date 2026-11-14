// TW Schnittraum – Vorschau: spielt den Schnitt live ab. Die Videos laufen als normale Video-Elemente,
// das Bild wird mit derselben Funktion gemalt wie später die fertige Datei (render.js).
import { aktive, quellZeit, pegelSeg, pegelTon, tonDauer, klemm, FORMATE } from './modell.js';
import { zeichne } from './render.js';
import { medien } from './medien.js';

export function baueVorschau(canvas, hol, opt) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let zeit = 0, laeuft = false, basisZeit = 0, basisUhr = 0, schmutzig = true;
  let ac = null, haupt = null, originalStumm = false, boxen = [];
  const vids = new Map(); // Clip-ID → { el, url, gain, ziel }
  const tons = new Map(); // Ton-ID → { el, url, gain }

  function verdrahte(e) {
    if (e.gain || !ac) return;
    try { const k = ac.createMediaElementSource(e.el); e.gain = ac.createGain(); k.connect(e.gain); e.gain.connect(haupt); e.el.muted = false; e.el.volume = 1; }
    catch (err) { console.warn('Ton-Anschluss', err); }
  }
  function loese(e) { try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); if (e.gain) e.gain.disconnect(); } catch (err) { /* egal */ } }
  const setzPegel = (e, g) => { if (e.gain) e.gain.gain.value = g; else e.el.volume = Math.min(1, Math.max(0, g)); };

  function videoFuer(s) {
    const m = medien.get(s.c.medium);
    if (!m || !m.url || m.art !== 'video' || m.fehler) return null;
    let e = vids.get(s.c.id);
    if (e && e.url !== m.url) { loese(e); vids.delete(s.c.id); e = null; }
    if (!e) {
      const el = document.createElement('video');
      el.playsInline = true; el.preload = 'auto'; el.muted = !ac; el.src = m.url;
      e = { el, url: m.url, gain: null, ziel: null };
      const dies = e;
      el.addEventListener('seeked', () => { if (!laeuft && dies.ziel != null && Math.abs(el.currentTime - dies.ziel) > 0.04) el.currentTime = dies.ziel; schmutzig = true; });
      el.addEventListener('loadeddata', () => { schmutzig = true; });
      verdrahte(e);
      vids.set(s.c.id, e);
    }
    return e;
  }

  function tonFuer(a) {
    const m = medien.get(a.medium);
    if (!m || !m.url) return null;
    let e = tons.get(a.id);
    if (e && e.url !== m.url) { loese(e); tons.delete(a.id); e = null; }
    if (!e) {
      const el = document.createElement('audio'); el.preload = 'auto'; el.src = m.url;
      e = { el, url: m.url, gain: null };
      verdrahte(e); tons.set(a.id, e);
    }
    return e;
  }

  // Zeit, an der gemalt wird: am Filmende das letzte Bild zeigen statt Schwarz.
  const zeigZeit = (lay) => laeuft ? zeit : Math.min(zeit, Math.max(0, lay.dauer - 0.02));

  function gleiche() {
    const { p, lay } = hol();
    const tz = zeigZeit(lay), gebraucht = new Set();
    for (const s of aktive(lay, tz)) {
      if (s.c.art !== 'video') continue;
      const e = videoFuer(s); if (!e) continue;
      gebraucht.add(s.c.id);
      const m = medien.get(s.c.medium), el = e.el;
      const soll = klemm(quellZeit(s, tz), 0, Math.max(0, (m.dauer || 0) - 0.03));
      setzPegel(e, originalStumm ? 0 : pegelSeg(p, lay, s, tz));
      if (laeuft) {
        const tempo = s.c.tempo || 1;
        if (el.playbackRate !== tempo) { el.playbackRate = tempo; el.preservesPitch = tempo === 1; }
        if (el.paused) { if (Math.abs(el.currentTime - soll) > 0.05 && !el.seeking) el.currentTime = soll; el.play().catch(() => {}); }
        else if (!el.seeking && Math.abs(el.currentTime - soll) > 0.35 * Math.max(1, tempo)) el.currentTime = soll;
      } else {
        if (!el.paused) el.pause();
        e.ziel = soll;
        if (!el.seeking && Math.abs(el.currentTime - soll) > 0.02) el.currentTime = soll;
      }
    }
    if (laeuft) { // den nächsten Abschnitt schon bereitlegen, damit der Schnitt nicht ruckelt
      const n = lay.segs.find(s => s.c.art === 'video' && s.t0 > zeit && s.t0 - zeit < 2);
      if (n && !gebraucht.has(n.c.id)) {
        const e = videoFuer(n);
        if (e) { gebraucht.add(n.c.id); setzPegel(e, 0); if (e.el.paused && !e.el.seeking && Math.abs(e.el.currentTime - n.c.ein) > 0.05) e.el.currentTime = n.c.ein; }
      }
    }
    for (const [id, e] of vids) {
      if (gebraucht.has(id)) continue;
      if (!e.el.paused) e.el.pause();
      if (vids.size > 5) { loese(e); vids.delete(id); }
    }
    const da = new Set();
    for (const a of p.ton) {
      da.add(a.id);
      const drin = zeit >= a.start && zeit < a.start + tonDauer(a);
      let e = tons.get(a.id);
      if (!drin || !laeuft) { if (e && !e.el.paused) e.el.pause(); continue; }
      e = e || tonFuer(a); if (!e) continue;
      const soll = a.ein + (zeit - a.start), el = e.el;
      setzPegel(e, pegelTon(p, a, zeit));
      if (el.paused) { if (Math.abs(el.currentTime - soll) > 0.05) el.currentTime = soll; el.play().catch(() => {}); }
      else if (!el.seeking && Math.abs(el.currentTime - soll) > 0.3) el.currentTime = soll;
    }
    for (const [id, e] of tons) if (!da.has(id)) { loese(e); tons.delete(id); }
  }

  // Das Bild eines Abschnitts, so wie es gerade vorliegt: { bild, w, h } oder null.
  function quelle(s) {
    const m = medien.get(s.c.medium); if (!m) return null;
    if (s.c.art === 'bild') return m.bild ? { bild: m.bild, w: m.bild.width, h: m.bild.height } : null;
    const e = vids.get(s.c.id);
    if (!e || e.el.readyState < 2 || !e.el.videoWidth) return null;
    return { bild: e.el, w: e.el.videoWidth, h: e.el.videoHeight, zeit: e.el.currentTime };      // zeit = Stelle der Quelle, die das Bild gerade wirklich zeigt (beim Abspielen darf es dem Zeiger etwas nachlaufen) – danach richten sich mitlaufende Stellen
  }
  function male() {
    const { p, lay } = hol();
    boxen = [];
    zeichne(ctx, canvas.width, canvas.height, zeigZeit(lay), p, lay, quelle, { logo: opt.logo(), auswahl: opt.auswahlText(), spielt: laeuft, boxen, stelle: opt.stelle ? opt.stelle() : null });
  }

  function takt(jetzt) {
    try {
      if (laeuft) {
        zeit = basisZeit + (jetzt - basisUhr) / 1000;
        const { lay } = hol();
        if (zeit >= lay.dauer) { zeit = lay.dauer; halt(); if (opt.beiEnde) opt.beiEnde(); }
        opt.beiZeit(zeit);
      }
      gleiche();
      if (laeuft || schmutzig) { schmutzig = false; male(); }
    } catch (e) { console.error('Vorschau', e); }
    requestAnimationFrame(takt);
  }

  function spiel() {
    const { lay } = hol();
    if (lay.dauer <= 0) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC(); haupt = ac.createGain(); haupt.connect(ac.destination);
      vids.forEach(verdrahte); tons.forEach(verdrahte);
    }
    if (ac.state === 'suspended') ac.resume();
    if (zeit >= lay.dauer - 0.05) zeit = 0;
    basisZeit = zeit; basisUhr = performance.now(); laeuft = true;
    if (opt.beiStatus) opt.beiStatus(true);
  }
  function halt() {
    if (!laeuft) return;
    laeuft = false;
    for (const e of vids.values()) if (!e.el.paused) e.el.pause();
    for (const e of tons.values()) if (!e.el.paused) e.el.pause();
    schmutzig = true;
    if (opt.beiStatus) opt.beiStatus(false);
  }

  // Größe der Malfläche an den Platz anpassen (scharf, aber nicht größer als nötig – hält die Vorschau flüssig).
  function passe(platzB, platzH) {
    const { p } = hol(), f = FORMATE[p.format];
    const m = Math.min(platzB / f.w, platzH / f.h);
    const cssB = Math.max(80, Math.floor(f.w * m)), cssH = Math.max(80, Math.floor(f.h * m));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.min(1, 1280 / Math.max(cssB * dpr, cssH * dpr), f.w / (cssB * dpr));
    canvas.style.width = cssB + 'px'; canvas.style.height = cssH + 'px';
    const w = Math.round(cssB * dpr * k), h = Math.round(cssH * dpr * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    schmutzig = true;
  }

  requestAnimationFrame(takt);
  return {
    spiel, halt, passe,
    umschalten() { laeuft ? halt() : spiel(); },
    geh(t) { const { lay } = hol(); zeit = klemm(t, 0, lay.dauer); if (laeuft) { basisZeit = zeit; basisUhr = performance.now(); } schmutzig = true; opt.beiZeit(zeit); },
    zeit: () => zeit, laeuft: () => laeuft, boxen: () => boxen, quelle,
    zeigZeit: () => zeigZeit(hol().lay),
    neu() { schmutzig = true; },
    originalStumm(b) { originalStumm = b; },
    tonAnlage: () => ac,
  };
}
