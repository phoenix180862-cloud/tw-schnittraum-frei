// TW Schnittraum – Zeitleiste: Clips in Reihenfolge, Texte und Ton frei verschiebbar.
// Bedienung mit Maus und Finger: antippen = wählen, ziehen = verschieben, an den Rändern ziehen = kürzen.
import { dauerVon, tonDauer, klemm, zeitText, UEBERGAENGE } from './modell.js';
import { medien } from './medien.js';

const RAND = 14; // Platz links vor Sekunde 0
const H_TEXT = 26, H_VIDEO = 64, H_TON = 32;

export function baueZeitleiste(wurzel, api) {
  wurzel.innerHTML = `
    <div class="zl-namen"><div class="zl-n lineal"></div><div class="zl-n" data-n="text">Text</div><div class="zl-n" data-n="ut" hidden>Untertitel</div><div class="zl-n" data-n="video">Video</div><div class="zl-n" data-n="musik">Musik</div><div class="zl-n" data-n="sprecher">Sprecher</div></div>
    <div class="zl-rollen"><div class="zl-inhalt">
      <canvas class="zl-lineal"></canvas>
      <div class="zl-spur" data-spur="text"></div>
      <div class="zl-spur" data-spur="ut" hidden></div>
      <div class="zl-spur" data-spur="video"><div class="zl-leer">Hier entsteht dein Film – Videos aus der Mediathek mit „+“ anhängen oder hierher ziehen.</div></div>
      <div class="zl-spur" data-spur="musik"></div>
      <div class="zl-spur" data-spur="sprecher"></div>
      <div class="zl-einfueg"></div>
      <div class="zl-zeiger"><i></i></div>
    </div></div>`;
  const rollen = wurzel.querySelector('.zl-rollen'), inhalt = wurzel.querySelector('.zl-inhalt'), lineal = wurzel.querySelector('.zl-lineal');
  const spur = (n) => wurzel.querySelector(`.zl-spur[data-spur=${n}]`), name = (n) => wurzel.querySelector(`.zl-n[data-n=${n}]`);
  const zeiger = wurzel.querySelector('.zl-zeiger'), einfueg = wurzel.querySelector('.zl-einfueg'), leer = wurzel.querySelector('.zl-leer');
  let pxS = 60, zieh = null;

  const X = (t) => RAND + t * pxS;
  const T = (x) => (x - RAND) / pxS;
  const zeitBei = (ev) => T(ev.clientX - rollen.getBoundingClientRect().left + rollen.scrollLeft);

  function abgleich(eltern, liste, schluessel, bau, setze) {
    const alt = new Map();
    for (const k of [...eltern.children]) if (k.dataset.id) alt.set(k.dataset.id, k);
    for (const x of liste) {
      const id = schluessel(x); let el = alt.get(id);
      if (!el) { el = bau(x); el.dataset.id = id; eltern.appendChild(el); } else alt.delete(id);
      setze(el, x);
    }
    for (const el of alt.values()) el.remove();
  }

  const el = (klasse, html = '') => { const d = document.createElement('div'); d.className = klasse; d.innerHTML = html; return d; };

  function male() {
    const { p, lay } = api.hol(), sel = api.auswahl();
    const breite = Math.max(rollen.clientWidth, X(lay.dauer) + 260);
    inhalt.style.width = breite + 'px';
    leer.style.display = lay.segs.length ? 'none' : '';

    // ── Video-Spur ──
    abgleich(spur('video'), lay.segs, s => s.c.id, () => el('zl-clip', '<div class="zl-bilder"></div><span class="zl-titel"></span><span class="zl-zeichen"></span><div class="zl-griff l"></div><div class="zl-griff r"></div>'), (d, s) => {
      const c = s.c, m = medien.get(c.medium), w = Math.max(6, s.d * pxS);
      d.style.left = X(s.t0) + 'px'; d.style.width = w + 'px'; d.style.zIndex = 2 + s.i;
      d.classList.toggle('gewaehlt', !!sel && sel.id === c.id);
      d.classList.toggle('karte', c.art === 'karte');
      d.classList.toggle('fehlt', c.art !== 'karte' && (!m || !m.datei || !!m.fehler));
      d.classList.toggle('ueb', s.ueb > 0);
      d.style.setProperty('--ueb', (s.ueb * pxS) + 'px');
      const titel = c.art === 'karte' ? (c.id === '__vorspann' ? 'Vorspann' : 'Abspann') : (m ? m.name : 'Datei fehlt');
      d.querySelector('.zl-titel').textContent = `${titel} · ${zeitText(s.d)}`;
      const z = [];
      if (s.ueb > 0) z.push('⇄ ' + UEBERGAENGE[c.ueb.art]);
      if (c.art === 'video' && c.tempo !== 1) z.push(String(c.tempo).replace('.', ',') + '×');
      if (c.art === 'video' && (c.stumm || c.laut === 0)) z.push('stumm');
      if (c.stil && c.stil !== 'natur') z.push('Farbe');
      d.querySelector('.zl-zeichen').textContent = z.join(' · ');
      d.title = c.art === 'karte' ? 'Ein- und ausschalten unter „Schalter“' : titel;
      // Vorschaubilder passend zum gewählten Ausschnitt
      const kasten = d.querySelector('.zl-bilder');
      if (c.art === 'karte' || !m) { if (kasten.dataset.sig !== 'x') { kasten.innerHTML = ''; kasten.dataset.sig = 'x'; } return; }
      const bb = Math.max(40, (H_VIDEO - 4) * ((m.w || 16) / (m.h || 9))), anzahl = Math.max(1, Math.min(40, Math.ceil(w / bb)));
      const quellen = [];
      for (let i = 0; i < anzahl; i++) {
        if (c.art === 'bild' || !m.streifen || !m.streifen.length) { quellen.push(m.thumb || ''); continue; }
        const qt = c.ein + (c.aus - c.ein) * (i + 0.5) / anzahl;
        quellen.push(m.streifen[klemm(Math.floor(qt / Math.max(0.01, m.dauer) * m.streifen.length), 0, m.streifen.length - 1)]);
      }
      const sig = anzahl + '|' + Math.round(bb) + '|' + quellen.map(q => q.length + q.slice(-12)).join(',');
      if (kasten.dataset.sig !== sig) {
        kasten.dataset.sig = sig;
        kasten.innerHTML = quellen.map(q => q ? `<img src="${q}" style="width:${bb.toFixed(0)}px" draggable="false" alt="">` : `<i style="width:${bb.toFixed(0)}px"></i>`).join('');
      }
    });

    // ── Text-Spur (mehrere Zeilen, damit sich nichts überdeckt) ──
    const zeilen = [], lage = new Map();
    for (const x of [...p.texte].sort((a, b) => a.start - b.start)) {
      let z = zeilen.findIndex(e => e <= x.start + 1e-6);
      if (z < 0) { z = zeilen.length; zeilen.push(0); }
      zeilen[z] = x.ende; lage.set(x.id, z);
    }
    const hText = Math.max(1, zeilen.length) * H_TEXT + 6;
    spur('text').style.height = hText + 'px'; name('text').style.height = hText + 'px';
    abgleich(spur('text'), p.texte, x => x.id, () => el('zl-stueck text', '<span class="zl-titel"></span><div class="zl-griff l"></div><div class="zl-griff r"></div>'), (d, x) => {
      d.style.left = X(x.start) + 'px'; d.style.width = Math.max(10, (x.ende - x.start) * pxS) + 'px'; d.style.top = (3 + (lage.get(x.id) || 0) * H_TEXT) + 'px';
      d.classList.toggle('gewaehlt', !!sel && sel.id === x.id);
      d.querySelector('.zl-titel').textContent = 'T  ' + x.text.replace(/\n/g, ' ');
    });

    // ── Untertitel (Schalter): nur zur Übersicht – geändert wird der Text unter „Schalter“ ──
    const mitUt = !!p.schalter.untertitel;
    spur('ut').hidden = !mitUt; name('ut').hidden = !mitUt;
    abgleich(spur('ut'), mitUt ? lay.ut.map((u, i) => ({ u, i })) : [], x => 'u' + x.i, () => el('zl-stueck ut', '<span class="zl-titel"></span>'), (d, x) => {
      d.style.left = X(x.u.start) + 'px'; d.style.width = Math.max(4, (x.u.ende - x.u.start) * pxS - 1) + 'px';
      d.querySelector('.zl-titel').textContent = x.u.text; d.title = x.u.text;
    });

    // ── Ton-Spuren ──
    for (const rolle of ['musik', 'sprecher']) {
      abgleich(spur(rolle), p.ton.filter(a => a.rolle === rolle), a => a.id, () => el('zl-stueck ton ' + rolle, '<canvas class="zl-welle"></canvas><span class="zl-titel"></span><div class="zl-griff l"></div><div class="zl-griff r"></div>'), (d, a) => {
        const m = medien.get(a.medium), w = Math.max(10, tonDauer(a) * pxS);
        d.style.left = X(a.start) + 'px'; d.style.width = w + 'px';
        d.classList.toggle('gewaehlt', !!sel && sel.id === a.id);
        d.classList.toggle('fehlt', !m || !m.datei);
        d.querySelector('.zl-titel').textContent = (rolle === 'musik' ? '♪ ' : '● ') + (m ? m.name : 'Datei fehlt');
        const cv = d.querySelector('.zl-welle'), sp = m && m.spitzen;
        const sig = Math.round(w) + '|' + a.ein.toFixed(2) + '|' + a.aus.toFixed(2) + '|' + (sp ? sp.length : 0);
        if (cv.dataset.sig !== sig) {
          cv.dataset.sig = sig; cv.width = Math.min(4000, Math.round(w)); cv.height = H_TON - 6;
          const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
          if (sp && m.dauer) {
            g.fillStyle = 'rgba(255,255,255,.42)';
            for (let px = 0; px < cv.width; px += 2) {
              const qt = a.ein + (a.aus - a.ein) * px / cv.width, v = sp[klemm(Math.floor(qt / m.dauer * sp.length), 0, sp.length - 1)] || 0;
              const hh = Math.max(1, v * cv.height); g.fillRect(px, (cv.height - hh) / 2, 1.4, hh);
            }
          }
        }
      });
    }
    maleLineal(); setzZeiger();
  }

  function maleLineal() {
    const { lay } = api.hol();
    const dpr = window.devicePixelRatio || 1, b = rollen.clientWidth, hh = 24;
    if (lineal.width !== Math.round(b * dpr)) { lineal.width = Math.round(b * dpr); lineal.height = hh * dpr; lineal.style.width = b + 'px'; lineal.style.height = hh + 'px'; }
    const g = lineal.getContext('2d'), stil = getComputedStyle(wurzel);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, b, hh);
    g.fillStyle = stil.getPropertyValue('--tx3') || '#8a9ab4'; g.strokeStyle = stil.getPropertyValue('--line2') || '#3d5878';
    g.font = '11px "Source Sans 3", sans-serif'; g.textBaseline = 'top';
    const schritte = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const schritt = schritte.find(s => s * pxS >= 64) || 600, klein = schritt / (schritt === 1 || schritt === 2 || schritt === 10 || schritt === 60 ? 2 : 5);
    const von = Math.max(0, T(rollen.scrollLeft)), bis = T(rollen.scrollLeft + b);
    g.beginPath();
    for (let t = Math.floor(von / klein) * klein; t <= bis; t += klein) { const x = Math.round(X(t) - rollen.scrollLeft) + 0.5; g.moveTo(x, hh - 5); g.lineTo(x, hh); }
    for (let t = Math.floor(von / schritt) * schritt; t <= bis; t += schritt) {
      const x = Math.round(X(t) - rollen.scrollLeft) + 0.5; g.moveTo(x, hh - 11); g.lineTo(x, hh);
      g.fillText(zeitText(t, schritt < 1), x + 4, 3);
    }
    g.stroke();
    if (lay.dauer > 0) { g.fillStyle = 'rgba(196,30,30,.9)'; const x = X(lay.dauer) - rollen.scrollLeft; g.fillRect(x, hh - 4, 2, 4); }
  }

  function setzZeiger(folge = false) {
    const x = X(api.zeit());
    zeiger.style.transform = `translateX(${x}px)`;
    if (folge) {
      const l = rollen.scrollLeft, b = rollen.clientWidth;
      if (x > l + b - 60) rollen.scrollLeft = x - b * 0.25; else if (x < l + RAND) rollen.scrollLeft = Math.max(0, x - b * 0.5);
    }
  }

  // An Kanten einrasten (Abspielzeiger, Clip-Grenzen, Anfang, Ende), wenn man nah dran ist.
  function raste(t, ausser) {
    const { p, lay } = api.hol(), k = [0, api.zeit(), lay.dauer];
    for (const s of lay.segs) k.push(s.t0, s.t1);
    for (const x of p.texte) if (x.id !== ausser) k.push(x.start, x.ende);
    for (const a of p.ton) if (a.id !== ausser) k.push(a.start, a.start + tonDauer(a));
    let best = t, abstand = 7 / pxS;
    for (const v of k) if (Math.abs(v - t) < abstand) { abstand = Math.abs(v - t); best = v; }
    return best;
  }

  function runter(ev) {
    if (ev.button > 0) return;
    const ziel = ev.target, griff = ziel.closest('.zl-griff'), stueck = ziel.closest('.zl-clip, .zl-stueck');
    const { p, lay } = api.hol();
    const x0 = ev.clientX, t0 = zeitBei(ev);
    if (!stueck) { // Lineal oder freie Fläche: Zeiger setzen und mitziehen
      if (!ziel.closest('.zl-lineal')) api.waehle(null);
      api.geh(Math.max(0, t0));
      zieh = { art: 'zeiger' };
    } else {
      const id = stueck.dataset.id;
      const istClip = stueck.classList.contains('zl-clip'), istText = stueck.classList.contains('text');
      if (istClip && id.startsWith('__')) { api.waehle({ art: 'karte', id }); return; }
      const war = !!api.auswahl() && api.auswahl().id === id;
      api.waehle({ art: istClip ? 'clip' : istText ? 'text' : 'ton', id });
      // Mit dem Finger: erst antippen (wählen), dann ziehen. So lässt sich die Zeitleiste auch über die Clips hinweg wischen.
      if (ev.pointerType === 'touch' && !war) return;
      const ding = istClip ? p.clips.find(c => c.id === id) : istText ? p.texte.find(x => x.id === id) : p.ton.find(a => a.id === id);
      if (!ding) return;
      const seite = griff ? (griff.classList.contains('l') ? 'l' : 'r') : null;
      zieh = { art: istClip ? 'clip' : istText ? 'text' : 'ton', id, seite, x0, t0, vorher: JSON.parse(JSON.stringify(ding)), el: stueck, bewegt: false, seg: istClip ? lay.segs.find(s => s.c.id === id) : null };
    }
    try { inhalt.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
    ev.preventDefault();
  }

  function bewegt(ev) {
    if (!zieh) return;
    if (zieh.art === 'zeiger') { api.geh(Math.max(0, zeitBei(ev))); return; }
    const dx = ev.clientX - zieh.x0;
    if (!zieh.bewegt && Math.abs(dx) < 4) return;
    zieh.bewegt = true;
    const dt = dx / pxS, v = zieh.vorher, { p, lay } = api.hol();
    if (zieh.art === 'clip') {
      const c = p.clips.find(k => k.id === zieh.id), m = medien.get(c.medium);
      if (zieh.seite) { // kürzen / verlängern
        api.aendere(() => {
          if (c.art === 'bild') c.dauer = klemm(v.dauer + (zieh.seite === 'r' ? dt : -dt), 0.3, 120);
          else if (zieh.seite === 'l') c.ein = klemm(v.ein + dt * v.tempo, 0, v.aus - 0.1 * v.tempo);
          else c.aus = klemm(v.aus + dt * v.tempo, v.ein + 0.1 * v.tempo, m ? m.dauer : v.aus);
        }, false);
        const s = api.hol().lay.segs.find(k => k.c.id === zieh.id);
        if (s) api.geh(zieh.seite === 'l' ? s.t0 + 0.001 : Math.max(s.t0, s.t1 - 0.04)); // das neue erste / letzte Bild zeigen
      } else { // umsortieren
        zieh.el.classList.add('zieht'); zieh.el.style.transform = `translateX(${dx}px)`;
        const tp = zeitBei(ev);
        let ziel = 0, kante = 0;
        const echte = lay.segs.filter(s => s.c.art !== 'karte');
        for (const s of echte) if (s.c.id !== zieh.id && (s.t0 + s.t1) / 2 < tp) { ziel++; kante = s.t1; }
        if (ziel === 0 && echte.length) kante = echte[0].c.id === zieh.id && echte[1] ? echte[0].t0 : echte[0].t0;
        zieh.ziel = ziel;
        einfueg.style.display = 'block'; einfueg.style.transform = `translateX(${X(kante) - 1}px)`;
      }
    } else if (zieh.art === 'text') {
      const x = p.texte.find(k => k.id === zieh.id);
      api.aendere(() => {
        if (zieh.seite === 'l') x.start = klemm(raste(v.start + dt, x.id), 0, v.ende - 0.2);
        else if (zieh.seite === 'r') x.ende = Math.max(v.start + 0.2, raste(v.ende + dt, x.id));
        else { const d = v.ende - v.start; let s = raste(v.start + dt, x.id); const e = raste(v.start + dt + d, x.id); if (s === v.start + dt && e !== v.start + dt + d) s = e - d; x.start = Math.max(0, s); x.ende = x.start + d; }
      }, false);
    } else {
      const a = p.ton.find(k => k.id === zieh.id), m = medien.get(a.medium), max = m && m.dauer ? m.dauer : v.aus;
      api.aendere(() => {
        if (zieh.seite === 'l') { const neu = klemm(v.ein + dt, Math.max(0, v.ein - v.start), v.aus - 0.2); a.start = v.start + (neu - v.ein); a.ein = neu; }
        else if (zieh.seite === 'r') a.aus = klemm(v.aus + dt, v.ein + 0.2, max);
        else a.start = Math.max(0, raste(v.start + dt, a.id));
      }, false);
    }
  }

  function hoch() {
    if (!zieh) return;
    const z = zieh; zieh = null;
    einfueg.style.display = 'none';
    if (z.art === 'zeiger' || !z.bewegt) return;
    if (z.art === 'clip' && !z.seite) {
      z.el.classList.remove('zieht'); z.el.style.transform = '';
      api.aendere((p) => {
        const von = p.clips.findIndex(c => c.id === z.id); if (von < 0 || z.ziel == null) return;
        const [c] = p.clips.splice(von, 1); p.clips.splice(klemm(z.ziel, 0, p.clips.length), 0, c);
      }, true);
    } else api.fest();
  }

  inhalt.addEventListener('pointerdown', runter);
  inhalt.addEventListener('pointermove', bewegt);
  inhalt.addEventListener('pointerup', hoch);
  inhalt.addEventListener('pointercancel', hoch);
  rollen.addEventListener('scroll', maleLineal, { passive: true });
  rollen.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); zoom(ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.clientX - rollen.getBoundingClientRect().left); }
    else if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && !ev.shiftKey && rollen.scrollWidth > rollen.clientWidth) { rollen.scrollLeft += ev.deltaY; ev.preventDefault(); }
  }, { passive: false });

  // Medien aus der Mediathek auf die Zeitleiste ziehen
  rollen.addEventListener('dragover', (ev) => { if ([...ev.dataTransfer.types].includes('text/tw-medium')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
  rollen.addEventListener('drop', (ev) => { const id = ev.dataTransfer.getData('text/tw-medium'); if (!id) return; ev.preventDefault(); api.legeMedium(id, Math.max(0, zeitBei(ev))); });

  function zoom(faktor, ankerX) {
    const ax = ankerX == null ? rollen.clientWidth / 2 : ankerX, t = T(rollen.scrollLeft + ax);
    pxS = klemm(pxS * faktor, 4, 600);
    male(); rollen.scrollLeft = Math.max(0, X(t) - ax);
    maleLineal();
  }
  function allesZeigen() {
    const { lay } = api.hol();
    pxS = klemm((rollen.clientWidth - RAND - 40) / Math.max(4, lay.dauer), 4, 600);
    male(); rollen.scrollLeft = 0; maleLineal();
  }

  new ResizeObserver(() => male()).observe(rollen);
  // Passt der ganze Film gerade ins Fenster? (Nach dem Anhängen neuer Clips wird sonst automatisch herausgezoomt.)
  const passtHinein = () => X(api.hol().lay.dauer) <= rollen.clientWidth - 20;
  return { male, setzZeiger, zoom, allesZeigen, passtHinein };
}
