// TW Schnittraum – Hauptprogramm: hält den Film (Projekt) zusammen, verbindet Vorschau, Zeitleiste und Tafeln,
// kümmert sich um Rückgängig, automatisches Sichern, Tastatur und die Ausgabe als Datei.
import { FORMATE, neuesProjekt, neuerClip, neuerText, neuerTon, rechne, tonDauer, zeitText, klemm, nr, pflege, quellZeit, istAktiv, fehlendeStellen, sprechStellen, merkeSprache } from './modell.js';
import { db } from './db.js';
import { medien, beiMedien, nimm, ladeAlle, verbindeAlle, getrennte, entferne as entferneMedium, waehle as waehleDateien, ausAblage, ausAufnahme } from './medien.js';
import { baueVorschau } from './vorschau.js';
import { baueZeitleiste } from './zeitleiste.js';
import { baueTafeln } from './tafeln.js';
import { baueQuellen } from './quellen-fenster.js';
import { baueMusik } from './musik-fenster.js';
import { baueEffektTafel } from './effekte-tafel.js';
import * as Q from './quellen.js';
import { starteAufnahme } from './aufnahme.js';
import { h, chips, haken, meldung, fenster, frage } from './bausteine.js';

const $ = (id) => document.getElementById(id);
const FREI = !!globalThis.TW_FREI;   // kostenlose öffentliche Fassung (frei-config.js): ohne KI, ohne Google, ohne Firmenlogo im Film
const Z = { p: neuesProjekt(), lay: null, sel: null, reiter: 'medien', logo: null };
Z.lay = rechne(Z.p);
const verlauf = []; let stelle = -1, sichernZeit = 0, vor = null, zl = null, tafeln = null;
const K = { Z };

// ───────── Ändern, Rückgängig, Sichern ─────────
function neuRechnen() {
  Z.lay = rechne(Z.p);
  if (vor) { if (vor.zeit() > Z.lay.dauer) vor.geh(Z.lay.dauer); vor.neu(); }
  if (zl) zl.male();
  zeigZeit(); zeigStart();
}
function aendere(fn, fest = true) { fn(Z.p); neuRechnen(); if (fest) halteFest(); }
function halteFest() {
  const s = JSON.stringify(Z.p);
  if (s === verlauf[stelle]) return;
  verlauf.length = stelle + 1; verlauf.push(s);
  if (verlauf.length > 150) verlauf.shift();
  stelle = verlauf.length - 1;
  sichereBald(); zeigKnoepfe();
}
function springe(schritt) {
  const neu = stelle + schritt;
  if (neu < 0 || neu >= verlauf.length) return;
  stelle = neu; Z.p = JSON.parse(verlauf[stelle]);
  if (!gewaehlt()) Z.sel = null;
  neuRechnen(); zeigAlles(); sichereBald();
}
function sichereBald() { clearTimeout(sichernZeit); $('kGespeichert').textContent = '…'; sichernZeit = setTimeout(sichere, 500); }
async function sichere() {
  clearTimeout(sichernZeit);
  try {
    Z.p.geaendert = Date.now();
    await db.setz('projekte', JSON.parse(JSON.stringify(Z.p)));
    await db.setz('kv', Z.p.id, 'letztes');
    $('kGespeichert').textContent = 'Gesichert ✓';
  } catch (e) { console.error(e); $('kGespeichert').textContent = 'Nicht gesichert!'; }
}
window.twVorAktualisieren = sichere; // vor „Neue Version – jetzt aktualisieren“ alles sichern

function gewaehlt() {
  const s = Z.sel; if (!s) return null;
  if (s.art === 'clip') return Z.p.clips.find(c => c.id === s.id) || null;
  if (s.art === 'text') return Z.p.texte.find(x => x.id === s.id) || null;
  if (s.art === 'ton') return Z.p.ton.find(a => a.id === s.id) || null;
  if (s.art === 'karte') return s.id === '__vorspann' ? (Z.p.schalter.vorspann ? Z.p.vorspann : null) : (Z.p.schalter.abspann ? Z.p.abspann : null);
  return null;
}
function waehle(sel) {
  const gleich = (Z.sel && sel && Z.sel.id === sel.id) || (!Z.sel && !sel);
  Z.sel = sel;
  if (Z.fx && !gleich) { Z.fx.wahl = null; Z.fx.pick = null; $('bild').classList.remove('zielen'); }      // eine angefasste Stelle gehört zum gewählten Clip
  zl.male(); vor.neu(); zeigKnoepfe();
  if (gleich) return;
  if (sel && tafeln.schmal()) tafeln.setzReiter('eig'); else { tafeln.zeigEig(); if (Z.reiter === 'text' || Z.reiter === 'ton') tafeln.zeigLinks(); }
}

// ───────── Anzeige ─────────
function zeigZeit() { $('tZeit').textContent = zeitText(vor ? vor.zeit() : 0) + ' / ' + zeitText(Z.lay.dauer); if (zl) zl.setzZeiger(vor && vor.laeuft()); }
function zeigStart() { $('bStart').hidden = Z.p.clips.length > 0 || Z.p.texte.length > 0 || Z.lay.dauer > 0; zeigHinweis(); zeigInfo(); }
function zeigInfo() { const n = Z.p.clips.length; $('zInfo').textContent = Z.lay.dauer ? `Länge ${zeitText(Z.lay.dauer)} · ${n} ${n === 1 ? 'Clip' : 'Clips'}` : ''; }
function zeigName() { $('kProjektName').textContent = Z.p.name; document.title = Z.p.name + ' – TW Schnittraum'; }
function zeigKnoepfe() {
  $('kZurueck').disabled = stelle <= 0; $('kVor').disabled = stelle >= verlauf.length - 1;
  const s = Z.sel, etwas = !!s && s.art !== 'karte';
  $('zDoppeln').disabled = !etwas; $('zWeg').disabled = !etwas; $('zTeilen').disabled = !Z.lay.dauer;
}
function zeigFormat() {
  $('kFormat').replaceChildren(chips(Object.entries(FORMATE).map(([k, f]) => [k, h('span', {}, f.kurz, h('small', {}, f.name.split(' ')[0])), f.name + ' – ' + f.wofuer]), Z.p.format, setzFormat));
}
function zeigHinweis() {
  const benutzt = new Set([...Z.p.clips.map(c => c.medium), ...Z.p.ton.map(a => a.medium)]);
  const fehlend = [...benutzt].filter(id => { const m = medien.get(id); return !m || !m.datei; });
  const el = $('bHinweis');
  el.hidden = !fehlend.length;
  if (fehlend.length) el.replaceChildren(h('span', {}, fehlend.length === 1 ? '1 Datei dieses Films ist noch nicht verbunden.' : fehlend.length + ' Dateien dieses Films sind noch nicht verbunden.'), h('button', { class: 'btn klein', onclick: verbinde }, 'Jetzt verbinden'));
}
function zeigAlles() { zeigName(); zeigFormat(); zeigKnoepfe(); tafeln.zeigLinks(); tafeln.zeigEig(); passeBuehne(); zeigStart(); }
function passeBuehne() { const r = $('bPlatz'); vor.passe(Math.max(120, r.clientWidth - 24), Math.max(120, r.clientHeight - 24)); }
function setzFormat(k) { aendere((p) => { p.format = k; }); zeigFormat(); passeBuehne(); tafeln.zeigEig(); }

// ───────── Medien ─────────
async function nimmUndMelde(eintraege, inFilm) {
  if (!eintraege.length) return [];
  const kopien = eintraege.filter(e => e.kopie && !e.handle && !e.ablage).length;   // davon gibt es keinen Verweis – die App legt eine Kopie in ihre Ablage
  meldung(kopien ? (eintraege.length === 1 ? 'Die Datei wird in die App geholt …' : eintraege.length + ' Dateien werden in die App geholt …') : eintraege.length === 1 ? 'Datei wird gelesen …' : eintraege.length + ' Dateien werden gelesen …', false, kopien ? 3500 : 1800);
  const r = await nimm(eintraege);
  if (r.abgelehnt.length) meldung('Nicht verwendbar (kein Video, Foto oder Ton): ' + r.abgelehnt.join(', '), true);
  const kaputt = r.medien.filter(m => m.fehler);
  if (kaputt.length) meldung(kaputt[0].fehler, true, 12000);
  if (inFilm) { const gut = r.medien.filter(m => !m.fehler); for (const m of gut) legeMedium(m.id, undefined, true); if (gut.length) halteFest(); }
  return r.medien;
}
// Am Handy und Tablet fragt der große Knopf zuerst „Woher?“ (Galerie, eigene Dateien mit SD-Karte, Kamera …); am PC öffnet er gleich die Datei-Auswahl.
async function holeMedien(inFilm) { if (Q.MOBIL) return K.quellen.zeigWoher(inFilm); await nimmUndMelde(await waehleDateien(false), inFilm || !Z.lay.dauer); }
async function holeMusik(inFilm) { await nimmUndMelde(await waehleDateien(true), inFilm !== false); }      // inFilm === false: nur in die Mediathek holen, nicht gleich unter den Film legen

function legeMedium(id, zeitpunkt, still = false) {
  const m = medien.get(id); if (!m || !m.datei || m.fehler) return;
  if (m.art === 'ton') {
    const hatMusik = Z.p.ton.some(a => a.rolle === 'musik');
    const start = zeitpunkt != null ? zeitpunkt : (!hatMusik || vor.zeit() >= Z.lay.dauer - 0.2 ? 0 : vor.zeit());
    const a = neuerTon(m, start, m.herkunft === 'aufnahme' || m.herkunft === 'ki-sprecher' ? 'sprecher' : 'musik');
    aendere((p) => { p.ton.push(a); }, !still);
    waehle({ art: 'ton', id: a.id });
    return;
  }
  const c = neuerClip(m), f = FORMATE[Z.p.format], erster = Z.p.clips.length === 0;
  if (erster && m.w && m.h) { // der erste Clip gibt das Format vor (Hochkant-Video → Hochformat), oben jederzeit änderbar
    const hochkant = m.h > m.w * 1.1, jetztHoch = f.h > f.w;
    if (hochkant !== jetztHoch && Z.p.format === 'quer') { Z.p.format = hochkant ? 'hoch' : 'quer'; meldung(`Format auf „${FORMATE[Z.p.format].name}“ gestellt, weil dein erstes Video ${hochkant ? 'hochkant' : 'quer'} ist. Oben jederzeit änderbar.`); }
  } else if (m.w && m.h && (m.h > m.w) !== (f.h > f.w)) c.passung = 'einpassen'; // nichts ungefragt abschneiden
  aendere((p) => {
    let i = p.clips.length;
    if (zeitpunkt != null) { i = 0; for (const s of Z.lay.segs) if (s.c.art !== 'karte' && (s.t0 + s.t1) / 2 < zeitpunkt) i++; }
    p.clips.splice(i, 0, c);
  }, !still);
  if (erster) { zeigFormat(); passeBuehne(); }
  if (erster || !zl.passtHinein()) zl.allesZeigen();
  waehle({ art: 'clip', id: c.id });
  const s = Z.lay.segs.find(x => x.c.id === c.id); if (s && !vor.laeuft()) vor.geh(s.t0 + 0.01);
}

async function nimmMedium(id) {
  const m = medien.get(id); if (!m) return;
  const imFilm = Z.p.clips.some(c => c.medium === id) || Z.p.ton.some(a => a.medium === id);
  const woher = { 'google-fotos': 'in Google Fotos', 'google-drive': 'in Google Drive', galerie: 'in der Galerie des Handys', kamera: 'in der Galerie des Handys' }[m.herkunft];
  const bleibt = m.ablage ? `Die Kopie in der App wird entfernt${woher ? '; das Original ' + woher + ' bleibt' : ''}.` : 'Die Datei auf deinem Gerät bleibt erhalten.';
  if (imFilm && !(await frage('Aus der Mediathek nehmen?', `„${m.name}“ wird in diesem Film verwendet. Die Stellen im Film werden mit entfernt. ${bleibt}`, 'Herausnehmen'))) return;
  if (m.herkunft === 'aufnahme' && !imFilm && !(await frage('Aufnahme entfernen?', 'Diese Sprecher-Aufnahme liegt nur in der App. Wirklich entfernen?', 'Entfernen'))) return;
  if (m.ablage && !woher && !imFilm && !(await frage('Aus der App entfernen?', `Von „${m.name}“ liegt eine Kopie in der App. Sie wird entfernt. Gibt es die Datei sonst nirgends mehr, ist sie danach weg.`, 'Entfernen'))) return;
  if (imFilm) aendere((p) => { p.clips = p.clips.filter(c => c.medium !== id); p.ton = p.ton.filter(a => a.medium !== id); });
  if (!gewaehlt()) waehle(null);
  await entferneMedium(id);
}
async function verbinde() {
  const r = await verbindeAlle();
  if (r.ok) meldung(r.ok === 1 ? '1 Datei wieder verbunden.' : r.ok + ' Dateien wieder verbunden.');
  if (r.offen) meldung('Nicht alle Dateien gefunden. Bitte unter „Medien“ über „Videos, Fotos, Musik holen“ dieselben Dateien noch einmal auswählen – sie werden automatisch wieder zugeordnet.', true, 12000);
}

// ───────── Schneiden ─────────
function teile() {
  const t = vor.zeit(), p = Z.p, sel = gewaehlt();
  if (Z.sel && Z.sel.art === 'ton' && sel && t > sel.start + 0.1 && t < sel.start + tonDauer(sel) - 0.1) {
    aendere(() => { const b = { ...sel, id: 'a' + nr(), start: t, ein: sel.ein + (t - sel.start), einbl: 0 }; sel.aus = b.ein; sel.ausbl = 0; p.ton.push(b); });
    return;
  }
  const treffer = Z.lay.segs.filter(s => s.c.art !== 'karte' && t > s.t0 + 0.05 && t < s.t1 - 0.05);
  const s = treffer.find(x => Z.sel && x.c.id === Z.sel.id) || treffer[treffer.length - 1];
  if (!s) { meldung('Zum Teilen den Abspielzeiger mitten in einen Clip stellen.'); return; }
  const c = s.c, neu = JSON.parse(JSON.stringify(c));
  neu.id = 'c' + nr(); neu.ueb = { art: 'keiner', dauer: c.ueb.dauer }; neu.einbl = 0;
  aendere(() => {
    if (c.art === 'video') { const q = quellZeit(s, t); neu.ein = q; c.aus = q; } else { const d = t - s.t0; neu.dauer = c.dauer - d; c.dauer = d; }
    c.ausbl = 0;
    p.clips.splice(p.clips.indexOf(c) + 1, 0, neu);
  });
  waehle({ art: 'clip', id: neu.id });
}
function entferne() {
  const s = Z.sel; if (!s) return;
  if (s.art === 'karte') { meldung('Vorspann und Abspann schaltest du links unter „Schalter“ aus.'); return; }
  aendere((p) => { if (s.art === 'clip') p.clips = p.clips.filter(c => c.id !== s.id); else if (s.art === 'text') p.texte = p.texte.filter(x => x.id !== s.id); else p.ton = p.ton.filter(a => a.id !== s.id); });
  waehle(null); tafeln.zeigLinks();
}
function verdopple() {
  const s = Z.sel, d = gewaehlt(); if (!s || !d || s.art === 'karte') return;
  const k = JSON.parse(JSON.stringify(d));
  aendere((p) => {
    if (s.art === 'clip') { k.id = 'c' + nr(); p.clips.splice(p.clips.indexOf(d) + 1, 0, k); }
    else if (s.art === 'text') { k.id = 't' + nr(); const l = d.ende - d.start; k.start = d.ende; k.ende = k.start + l; p.texte.push(k); }
    else { k.id = 'a' + nr(); k.start = d.start + tonDauer(d); p.ton.push(k); }
  });
  waehle({ art: s.art, id: k.id }); tafeln.zeigLinks();
}
function neuerTextAusVorlage(vorlage) {
  const d = Z.lay.dauer, t = vor.zeit(), start = d > 0 && t >= d - 0.3 ? Math.max(0, d - 4) : t;
  const x = neuerText(vorlage, start, d > 0 ? Math.max(1, Math.min(4, d - start)) : 4);
  aendere((p) => { p.texte.push(x); });
  waehle({ art: 'text', id: x.id }); tafeln.zeigLinks();
  if (!vor.laeuft()) vor.geh(Math.min(start + 0.6, (x.start + x.ende) / 2)); // mitten in den Text stellen, damit er auch ohne Auswahl zu sehen ist
  setTimeout(() => { const f = $('textFeld'); if (f && !tafeln.schmal()) { f.focus(); f.select(); } }, 30);
}

// ───────── Nachvertonen ─────────
const aufn = { lauf: null, stumm: true, start: 0, uhr: 0, takt: 0 };
K.aufnahme = {
  laeuft: () => !!aufn.lauf, stumm: () => aufn.stumm, setzStumm: (b) => { aufn.stumm = b; },
  async start() {
    if (aufn.lauf) return;
    try { aufn.lauf = await starteAufnahme((p) => { const el = $('aufnPegel'); if (el) el.style.width = Math.min(100, p * 140) + '%'; }); }
    catch (e) { meldung(e.message, true, 12000); return; }
    aufn.start = vor.zeit() >= Z.lay.dauer - 0.1 ? 0 : vor.zeit(); aufn.uhr = performance.now();
    vor.geh(aufn.start); vor.originalStumm(aufn.stumm); if (Z.lay.dauer) vor.spiel();
    tafeln.zeigLinks();
    aufn.takt = setInterval(() => { const el = $('aufnZeit'); if (el) el.textContent = zeitText((performance.now() - aufn.uhr) / 1000); }, 100);
  },
  async stopp() {
    if (!aufn.lauf) return;
    const lauf = aufn.lauf; aufn.lauf = null; clearInterval(aufn.takt);
    vor.halt(); vor.originalStumm(false);
    const { blob, dauer } = await lauf.stopp();
    if (dauer < 0.3) { meldung('Die Aufnahme war zu kurz.', true); tafeln.zeigLinks(); return; }
    const jetzt = new Date(), name = `Sprecher ${String(jetzt.getHours()).padStart(2, '0')}-${String(jetzt.getMinutes()).padStart(2, '0')}-${String(jetzt.getSeconds()).padStart(2, '0')}.wav`;
    const m = await ausAufnahme(blob, name);
    if (m) { const a = neuerTon(m, aufn.start, 'sprecher'); aendere((p) => { p.ton.push(a); }); waehle({ art: 'ton', id: a.id }); vor.geh(aufn.start); meldung('Aufnahme liegt in der Spur „Sprecher“. Zum Anhören Abspielen drücken.'); }
    tafeln.zeigLinks();
  },
  async abbruch() { if (!aufn.lauf) return; const lauf = aufn.lauf; aufn.lauf = null; clearInterval(aufn.takt); vor.halt(); vor.originalStumm(false); await lauf.abbruch(); tafeln.zeigLinks(); },
};

// ───────── Automatische Untertitel (Schalter) ─────────
const ut = { lauf: false, stopp: false, text: '', anteil: 0 };
function zeigUtStand() { const t = $('utText'), b = $('utBalken'); if (t) t.textContent = ut.text; if (b) b.style.width = Math.round(ut.anteil * 100) + '%'; }
K.untertitel = {
  laeuft: () => ut.lauf, stand: () => ut,
  fehlend: () => fehlendeStellen(Z.p, Z.lay.segs),
  hatTon: () => sprechStellen(Z.p, Z.lay.segs).size > 0,
  // Sprache erkennen: nur die Stellen, die im Film zu hören sind und noch fehlen (alles = von vorn).
  async starte(alles = false) {
    if (ut.lauf) return;
    const projekt = Z.p.id;
    if (alles) aendere((p) => { for (const id of sprechStellen(p, Z.lay.segs).keys()) delete p.sprache[id]; }, false);
    const stellen = fehlendeStellen(Z.p, Z.lay.segs);
    if (!stellen.length) { meldung('Es gibt nichts zu erkennen – erst ein Video mit Ton oder eine Sprecher-Aufnahme in den Film legen.'); return; }
    ut.lauf = true; ut.stopp = false; ut.text = 'Sprachmodell wird geladen …'; ut.anteil = 0; tafeln.zeigLinks();
    let wach = null; try { wach = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht überall möglich */ }
    try {
      const { sprache } = await import('./sprache.js');
      const neu = !sprache.istBereit();
      await sprache.lade((a) => { ut.text = neu ? `Sprachmodell wird geladen … ${Math.round(a * 100)} %` : 'Sprachmodell wird bereitgestellt …'; ut.anteil = a * 0.3; zeigUtStand(); });
      await sprache.erkenne(stellen, medien, (text, a) => { ut.text = text; ut.anteil = 0.3 + a * 0.7; zeigUtStand(); }, () => ut.stopp || Z.p.id !== projekt,
        (mid, von, bis, zl2) => { if (Z.p.id === projekt) aendere((p) => merkeSprache(p, mid, von, bis, zl2), false); });
      halteFest();
      meldung(Z.lay.ut.length ? `Fertig: ${Z.lay.ut.length} Untertitel im Film. Unter „Schalter“ kannst du jeden Text nachbessern.` : 'Fertig – in diesem Film wurde keine deutsche Sprache erkannt.', false, 7000);
    } catch (e) {
      if (e && e.message === 'abgebrochen') { halteFest(); meldung('Spracherkennung abgebrochen. Was schon erkannt war, bleibt erhalten.'); }
      else { console.warn(e); meldung((e && e.message ? e.message : 'Die Spracherkennung hat nicht geklappt.') + ' Der Film selbst ist davon nicht betroffen.', true, 14000); }
    } finally { ut.lauf = false; if (wach) { try { await wach.release(); } catch (e) { /* egal */ } } tafeln.zeigLinks(); }
  },
  abbrechen() { ut.stopp = true; ut.text = 'Wird abgebrochen …'; zeigUtStand(); },
  setzText(u, text) { aendere((p) => { const sp = p.sprache[u.medium]; if (sp && sp.zeilen[u.i]) sp.zeilen[u.i].text = String(text).trim(); }); if (!String(text).trim()) tafeln.zeigLinks(); },
};

// ───────── Rohschnitt (Schalter; in der Firmen-Fassung mit KI) ─────────
const kiStand = { lauf: false, text: '', anteil: 0 };
function zeigKiStand() { const t = $('kiText'), b = $('kiBalken'); if (t) t.textContent = kiStand.text; if (b) b.style.width = Math.round(kiStand.anteil * 100) + '%'; }
K.ki = {
  laeuft: () => kiStand.lauf, stand: () => kiStand,
  // Woraus entsteht der Rohschnitt? Sind schon Clips im Film, zählen diese – sonst alle Videos und Fotos der Mediathek.
  quelle() { const q = Z.p.ki.quelle; return q === 'film' || q === 'alle' ? q : (Z.p.clips.length ? 'film' : 'alle'); },
  liste() {
    const gut = (m) => m && (m.art === 'video' || m.art === 'bild') && m.datei && !m.fehler;
    const ms = K.ki.quelle() === 'film' ? [...new Set(Z.p.clips.map(c => c.medium))].map(id => medien.get(id)).filter(gut) : [...medien.values()].filter(gut);
    return ms.map(m => ({ m, zeilen: (Z.p.sprache[m.id] && Z.p.sprache[m.id].zeilen.filter(z => z.text)) || [] }));
  },
  async vorschlag(mitKI) {
    if (kiStand.lauf) return;
    vor.halt();
    const liste = K.ki.liste();
    if (!liste.length) { meldung('Erst Videos oder Fotos holen – dann kann ein Rohschnitt entstehen.', true); return; }
    const KI = await import('./ki.js');
    let v = null;
    if (!v) { v = KI.rohschnittEinfach(liste, Z.p.ki.ziel); if (FREI) v.kurz = 'Alle Clips in der Reihenfolge der Aufnahme, jeweils der mittlere Teil.'; }
    zeigVorschlag(v);
  },
};

function zeigVorschlag(v) {
  const f = fenster('Vorschlag für den Rohschnitt', { breite: 640 }), opt = { weich: false, titel: false };
  const gesamt = v.szenen.reduce((n, z) => n + (z.bis - z.von), 0);
  let kennung = FREI ? '' : 'Ohne KI ';
  f.inhalt.append(
    h('div', { class: 'notiz ' + (v.ki ? 'blau' : '') }, h('b', {}, kennung), v.kurz || '', v.ki ? ' Bitte ansehen und selbst entscheiden – die KI kann sich irren.' : ''),
    v.titel ? h('p', { style: { margin: '6px 0' } }, 'Titel-Vorschlag: ', h('b', {}, v.titel)) : '',
    h('p', { class: 'hinweis', style: { margin: '4px 0 8px' } }, `${v.szenen.length} ${v.szenen.length === 1 ? 'Szene' : 'Szenen'} · zusammen ${zeitText(gesamt)}`),
    ...v.szenen.map((z, i) => { const m = medien.get(z.medium); return h('div', { class: 'p-eintrag' },
      h('div', { class: 'sz-bild', style: m && m.thumb ? { backgroundImage: `url(${m.thumb})` } : null }, String(i + 1)),
      h('div', { class: 'n' }, h('b', {}, m ? m.name : 'Datei fehlt'), h('small', {}, (m && m.art === 'bild' ? `Foto · ${zeitText(z.bis - z.von)}` : `${zeitText(z.von)} bis ${zeitText(z.bis)} · ${zeitText(z.bis - z.von)}`) + (z.grund ? ' · ' + z.grund : '')))); }),
    h('label', { class: 'lbl' }, 'Dazu'), haken([['weich', 'Weiche Übergänge', false], ...(v.titel ? [['titel', 'Titel an den Anfang setzen', false]] : [])], (k, b) => { opt[k] = b; }));
  const nimm = (ersetzen) => { f.zu(); setzeSchnitt(v, ersetzen, opt); };
  f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Verwerfen'),
    Z.p.clips.length ? h('button', { class: 'btn', onclick: () => nimm(false) }, 'Hinten anhängen') : '',
    h('button', { class: 'btn primaer', onclick: () => nimm(true) }, Z.p.clips.length ? 'Jetzigen Schnitt ersetzen' : 'Übernehmen'));
}

// Einen Vorschlag (Szenen mit Quelle, von, bis) in die Zeitleiste übernehmen – ein Schritt, mit „Rückgängig“ wieder weg.
function setzeSchnitt(v, ersetzen, o = {}) {
  const neu = [];
  for (const z of v.szenen) {
    const m = medien.get(z.medium); if (!m || !m.datei || m.fehler) continue;
    const c = neuerClip(m);
    if (c.art === 'video') { c.ein = klemm(z.von, 0, Math.max(0, m.dauer - 0.2)); c.aus = klemm(z.bis, c.ein + 0.2, m.dauer); } else c.dauer = klemm(z.bis - z.von, 1, 10);
    if (o.weich && neu.length) c.ueb = { art: 'blende', dauer: 0.5 };
    neu.push({ c, m });
  }
  if (!neu.length) { meldung('Keine der vorgeschlagenen Szenen lässt sich verwenden.', true); return; }
  const leer = ersetzen || !Z.p.clips.length;
  aendere((p) => {
    if (leer && p.format === 'quer' && neu[0].m.h > neu[0].m.w * 1.1) p.format = 'hoch';        // wie beim ersten Clip von Hand
    const fm = FORMATE[p.format];
    for (const { c, m } of neu) if (m.w && m.h && (m.h > m.w) !== (fm.h > fm.w)) c.passung = 'einpassen';
    if (ersetzen) p.clips = neu.map(x => x.c);
    else { if (o.weich && p.clips.length) neu[0].c.ueb = { art: 'blende', dauer: 0.5 }; p.clips.push(...neu.map(x => x.c)); }
    if (o.titel && v.titel) { const x = neuerText('titel', 0, Math.min(3.5, Math.max(1.5, rechne(p).dauer))); x.text = v.titel; p.texte.push(x); }
  });
  zeigFormat(); passeBuehne(); zl.allesZeigen(); waehle(null); vor.geh(0); tafeln.zeigLinks();
  meldung(ersetzen ? 'Rohschnitt übernommen. Jetzt verfeinern – mit „Rückgängig“ kommst du zum alten Stand.' : 'Szenen hinten angehängt.', false, 6500);
}

// ───────── Projekte ─────────
async function oeffne(p) {
  ut.stopp = true;
  await sichere();
  Z.p = pflege(p); Z.sel = null; verlauf.length = 0; stelle = -1;
  neuRechnen(); halteFest(); vor.geh(0); zeigAlles(); zl.allesZeigen();
}
async function zeigProjekte() {
  vor.halt(); await sichere();
  const f = fenster('Meine Filme', { breite: 620 });
  const male = async () => {
    const alle = (await db.alle('projekte')).sort((a, b) => (b.geaendert || 0) - (a.geaendert || 0));
    f.inhalt.replaceChildren(
      h('div', { class: 'zeile' }, h('button', { class: 'btn primaer', onclick: async () => { await oeffne(neuesProjekt('Neues Video')); f.zu(); meldung('Neuer Film angelegt. Links Videos holen.'); } }, '＋ Neuer Film')),
      ...alle.map(p => { const l = rechne(pflege(p)); return h('div', { class: 'p-eintrag' + (p.id === Z.p.id ? ' an' : '') },
        h('div', { class: 'n' }, h('b', {}, p.name), h('small', {}, `${FORMATE[p.format].name} · ${zeitText(l.dauer, false)} · zuletzt ${new Date(p.geaendert || p.erstellt).toLocaleDateString('de-DE')}`)),
        p.id === Z.p.id ? h('small', {}, 'geöffnet') : h('button', { class: 'btn klein', onclick: async () => { await oeffne(p); f.zu(); } }, 'Öffnen'),
        h('button', { class: 'btn klein', title: 'Kopie anlegen', onclick: async () => { const k = JSON.parse(JSON.stringify(p)); k.id = 'p' + nr(); k.name = p.name + ' (Kopie)'; k.geaendert = Date.now(); await db.setz('projekte', k); male(); } }, '⧉'),
        p.id === Z.p.id ? null : h('button', { class: 'btn klein gefahr', title: 'Film entfernen', onclick: async () => { if (await frage('Film entfernen?', `„${p.name}“ wird aus der Liste entfernt. Deine Videodateien bleiben unberührt.`, 'Entfernen')) { await db.weg('projekte', p.id); male(); } } }, '✕')); }),
      h('p', { class: 'hinweis' }, 'Filme werden beim Arbeiten automatisch im Gerät gesichert. Die Videodateien selbst bleiben auf deiner Festplatte.'));
  };
  f.fuss.append(
    h('button', { class: 'btn', title: 'Schnitt als kleine Datei sichern (ohne die Videos)', onclick: () => { const b = new Blob([JSON.stringify({ art: 'tw-schnittraum-projekt', fassung: 1, projekt: Z.p }, null, 1)], { type: 'application/json' }); ladeHerunter(URL.createObjectURL(b), dateiName(Z.p.name) + '.schnitt.json'); } }, 'Schnitt als Datei sichern'),
    h('button', { class: 'btn', onclick: () => { const i = h('input', { type: 'file', accept: '.json,application/json' }); i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); if (d.art !== 'tw-schnittraum-projekt' || !d.projekt) throw new Error(); d.projekt.id = 'p' + nr(); await oeffne(d.projekt); f.zu(); meldung('Schnitt geladen. Fehlende Videos unter „Medien“ neu holen – sie werden automatisch zugeordnet.'); } catch (e) { meldung('Das ist keine Schnitt-Datei aus dem TW Schnittraum.', true); } }; i.click(); } }, 'Schnitt aus Datei holen'),
    h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
  male();
}
// Ohne Speichern-Dialog (Handy, Tablet) wird ein großer Film nicht im Arbeitsspeicher, sondern in der Ablage des Browsers gebaut.
async function ausgabeLager() {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    const w = await navigator.storage.getDirectory();
    for await (const [n] of w.entries()) if (n.startsWith('tw-ausgabe-')) { try { await w.removeEntry(n); } catch (e) { /* wird noch benutzt */ } }
    const hnd = await w.getFileHandle('tw-ausgabe-' + Date.now() + '.mp4', { create: true });
    return hnd.createWritable ? hnd : null;
  } catch (e) { return null; }
}
const dateiName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Video';
function ladeHerunter(url, name) { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }

// ───────── Ausgabe ─────────
async function zeigAusgabe() {
  vor.halt();
  if (!Z.lay.dauer) { meldung('Die Zeitleiste ist noch leer – erst ein Video in den Film legen.', true); return; }
  const benutzt = new Set([...Z.p.clips.map(c => c.medium), ...Z.p.ton.map(a => a.medium)]);
  const fehlend = [...benutzt].map(id => medien.get(id)).filter(m => !m || !m.datei || m.fehler);
  if (fehlend.length) { meldung('Vor der Ausgabe müssen alle Dateien verbunden sein: ' + fehlend.map(m => m ? m.name : 'unbekannt').join(', '), true, 12000); return; }
  const { ausgeben, Abbruch, GUETEN, schaetzeMB } = await import('./ausgabe.js');
  const fm = FORMATE[Z.p.format], heute = new Date(), tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
  let kurz = 1080, guete = 'hoch', fps = 30;
  const masse = () => { const k = kurz / Math.min(fm.w, fm.h); return [Math.round(fm.w * k / 2) * 2, Math.round(fm.h * k / 2) * 2]; };
  const f = fenster('Video ausgeben', { breite: 560 });
  const name = h('input', { class: 'inp', type: 'text', value: `${tag}_${dateiName(Z.p.name)}_${fm.kurz.replace(':', 'x')}`, maxlength: 100 });
  const info = h('p', { class: 'hinweis' });
  const zeigInfo2 = () => { const [W, H] = masse(); info.textContent = `${W} × ${H} Bildpunkte · ${fps} Bilder je Sekunde · MP4 · etwa ${Math.max(1, Math.round(schaetzeMB(Z.lay.dauer, W, H, guete, fps)))} MB`; };
  f.inhalt.append(
    h('p', { style: { margin: '2px 0 8px' } }, h('b', {}, Z.p.name), ` · ${fm.name} (${fm.wofuer}) · Länge ${zeitText(Z.lay.dauer)}`),
    h('label', { class: 'lbl' }, 'Auflösung'), chips([[1080, 'Full HD (empfohlen)'], [720, 'HD · kleine Datei'], [2160, '4K · sehr groß']], kurz, (v) => { kurz = v; zeigInfo2(); }),
    h('label', { class: 'lbl' }, 'Qualität'), chips(Object.entries(GUETEN).map(([k, g]) => [k, g.name]), guete, (v) => { guete = v; zeigInfo2(); }),
    h('label', { class: 'lbl' }, 'Bewegung'), chips([[30, '30 Bilder je Sekunde (empfohlen)'], [60, '60 · besonders flüssig']], fps, (v) => { fps = v; zeigInfo2(); }),
    h('label', { class: 'lbl' }, 'Dateiname'), name, info,
    h('div', { class: 'notiz blau' }, 'Die Datei entsteht komplett auf deinem Gerät. Im nächsten Schritt wählst du, wohin sie gespeichert wird – am besten in deinen Videoordner' + (FREI ? '.' : ' in Google Drive.')));
  zeigInfo2();
  f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Abbrechen'), h('button', { class: 'btn primaer', onclick: starte }, '⇪ Jetzt ausgeben'));

  async function starte() {
    const datei = dateiName(name.value) + '.mp4', [W, H] = masse();
    let ziel = null, lager = null;
    if (window.showSaveFilePicker) {
      try { ziel = await window.showSaveFilePicker({ suggestedName: datei, id: 'tw-sr-ausgabe', types: [{ description: 'Video (MP4)', accept: { 'video/mp4': ['.mp4'] } }] }); }
      catch (e) { if (e && e.name === 'AbortError') return; ziel = null; }
    }
    if (!ziel && (window.TW_AUSGABE_LAGER || schaetzeMB(Z.lay.dauer, W, H, guete, fps) > 120)) lager = await ausgabeLager();
    await sichere();
    const abbruch = { an: false }, balken = h('i'), zahl = h('div', { class: 'gross-zahl' }, '0 %'), rest = h('p', { class: 'hinweis', style: { textAlign: 'center' } }, 'Wird vorbereitet …');
    f.sperre(true);
    f.inhalt.replaceChildren(h('p', { style: { textAlign: 'center', margin: '6px 0' } }, 'Dein Film wird gerechnet: ', h('b', {}, ziel ? ziel.name : datei)), zahl, h('div', { class: 'balken' }, balken), rest,
      h('p', { class: 'hinweis', style: { textAlign: 'center' } }, 'Bitte dieses Fenster offen lassen. Du kannst solange in anderen Programmen weiterarbeiten.'));
    f.fuss.replaceChildren(h('button', { class: 'btn', onclick: () => { abbruch.an = true; rest.textContent = 'Wird abgebrochen …'; } }, 'Abbrechen'));
    let wach = null; try { wach = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht überall möglich */ }
    try {
      const r = await ausgeben({ p: Z.p, lay: Z.lay, medien, logo: Z.logo, breite: W, hoehe: H, fps, guete, ziel: ziel || lager, abbruch,
        fortschritt: (n, N, sek) => { const pz = Math.floor(n / N * 100); zahl.textContent = pz + ' %'; balken.style.width = pz + '%'; rest.textContent = n >= N ? 'Datei wird abgeschlossen …' : `Noch etwa ${sek > 90 ? Math.round(sek / 60) + ' Minuten' : Math.max(1, Math.round(sek)) + ' Sekunden'}`; } });
      let fertig = null;
      if (r.blob) fertig = new File([r.blob], datei, { type: 'video/mp4' });
      else { try { const d = await (ziel || lager).getFile(); fertig = ziel ? d : new File([d], datei, { type: 'video/mp4' }); } catch (e) { /* egal */ } }
      const mb = fertig ? fertig.size / 1e6 : 0;
      if (!ziel && fertig) ladeHerunter(URL.createObjectURL(fertig), datei);
      let teilbar = false; try { teilbar = !!fertig && !!navigator.canShare && navigator.canShare({ files: [fertig] }); } catch (e) { /* kein Teilen */ }
      const teile2 = async () => { try { await navigator.share({ files: [fertig], title: Z.p.name }); } catch (e) { if (!e || e.name !== 'AbortError') meldung('Teilen hat hier nicht geklappt – die Datei ist aber gespeichert.', true); } };
      f.sperre(false);
      f.inhalt.replaceChildren(h('div', { class: 'gross-zahl', style: { color: 'var(--gruen2)' } }, 'Fertig ✓'),
        h('p', { style: { textAlign: 'center' } }, h('b', {}, ziel ? ziel.name : datei), mb ? ` · ${mb.toFixed(1).replace('.', ',')} MB` : '', ` · gerechnet in ${r.sekunden < 90 ? Math.max(1, Math.round(r.sekunden)) + ' Sekunden' : Math.round(r.sekunden / 60) + ' Minuten'}`),
        !ziel ? h('div', { class: 'notiz' }, 'Die Datei liegt in deinem Ordner „Downloads“.') : '',
        teilbar ? h('div', { class: 'notiz blau' }, 'Mit „Teilen“ gibst du das Video direkt an YouTube, Instagram, Facebook, WhatsApp oder Google Drive weiter – so, wie du es von Fotos kennst.') : '',
        r.tonformat && r.tonformat !== 'aac' ? h('div', { class: 'notiz' }, 'Hinweis: Dieser Browser konnte den Ton nicht im üblichen AAC-Format speichern. Für Instagram und Facebook bitte am PC in Chrome oder Edge ausgeben.') : '',
        h('p', { class: 'hinweis', style: { textAlign: 'center' } }, 'Jetzt kannst du das Video ansehen und für YouTube, Instagram oder Facebook verwenden.'));
      f.fuss.replaceChildren(teilbar ? h('button', { class: 'btn', id: 'aTeilen', onclick: teile2 }, '⤴ Teilen …') : '', h('button', { class: 'btn primaer', onclick: () => f.zu() }, 'Schließen'));
    } catch (e) {
      f.sperre(false);
      if (e instanceof Abbruch) { f.zu(); meldung('Ausgabe abgebrochen – es wurde keine Datei gespeichert.'); }
      else { console.error(e); f.inhalt.replaceChildren(h('div', { class: 'notiz rot' }, h('b', {}, 'Die Ausgabe hat nicht geklappt. '), e && e.message ? e.message : 'Unbekannter Fehler.')); f.fuss.replaceChildren(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen')); }
    } finally { if (wach) { try { await wach.release(); } catch (e) { /* egal */ } } }
  }
}

// ───────── Start ─────────
async function start() {
  try { const t = localStorage.getItem('twsr.thema'); if (t) document.documentElement.dataset.thema = t; } catch (e) { /* egal */ }
  Z.logo = FREI ? null : await new Promise((ok) => { const b = new Image(); b.onload = () => ok(b); b.onerror = () => ok(null); b.src = 'img/tw-logo-original.png'; });
  try { await Promise.all(['700 20px "Oswald"', '600 20px "Oswald"', '400 20px "Source Sans 3"', '700 20px "Source Sans 3"', '700 20px "Montserrat"', '400 20px "Bebas Neue"', '700 20px "Playfair Display"', '700 20px "Dancing Script"', '400 20px "Montserrat"', '400 20px "Playfair Display"', '400 20px "Dancing Script"', '400 20px "Oswald"'].map(s => document.fonts.load(s))); } catch (e) { /* Schrift lädt nach */ }

  vor = baueVorschau($('bild'), () => ({ p: Z.p, lay: Z.lay }), {
    logo: () => Z.logo, auswahlText: () => (Z.sel && Z.sel.art === 'text' ? Z.sel.id : null), stelle: () => (Z.fx ? Z.fx.wahl : null),
    beiZeit: () => zeigZeit(), beiStatus: (l) => { $('tSpiel').textContent = l ? '⏸' : '▶'; },
    beiEnde: () => { if (aufn.lauf) K.aufnahme.stopp(); },
  });
  Object.assign(K, { zeigAusgabe, vor, aendere, fest: halteFest, waehle, gewaehlt, legeMedium, holeMedien, holeMusik, nimmMedium, nimmUndMelde, verbinde, teile, entferne, verdopple, neuerText: neuerTextAusVorlage, zeigName, setzFormat, sag: meldung, setzeSchnitt, oeffne, sichere });
  K.quellen = baueQuellen(K);
  K.musik = baueMusik(K);              // Musik von der App: im Gerät erzeugt, gehört niemandem
  K.fx = baueEffektTafel(K);           // Effekte: Palette, Rahmen, Bewegung, Farbe ändern, Stellen im Bild
  K.tafelNeu = () => { if (tafeln) tafeln.zeigEig(); };
  $('bStart').append(K.quellen.leiste(true));   // die direkten Wege (Ordner, Handy, Google Fotos, Google Drive) gleich auf dem leeren Startbild
  if (Q.MOBIL) $('bStart').querySelector('p').textContent = 'Aus der Galerie, den eigenen Dateien, von der SD-Karte oder frisch aufgenommen. Alles bleibt auf deinem Gerät.';
  zl = baueZeitleiste($('zl'), { hol: () => ({ p: Z.p, lay: Z.lay }), zeit: () => vor.zeit(), geh: (t) => vor.geh(t), auswahl: () => Z.sel, waehle, aendere, fest: halteFest, legeMedium });
  tafeln = baueTafeln(K);
  beiMedien(() => { tafeln.zeigLinks(); zl.male(); vor.neu(); zeigHinweis(); if (Z.sel) tafeln.zeigEig(); });

  await ladeAlle();
  let p = null;
  try { const id = await db.hol('kv', 'letztes'); if (id) p = await db.hol('projekte', id); } catch (e) { console.warn(e); }
  Z.p = pflege(p || neuesProjekt('Neues Video'));
  neuRechnen(); halteFest(); zeigAlles(); zl.allesZeigen(); $('kGespeichert').textContent = '';

  // Kopf
  $('kProjekt').onclick = zeigProjekte;
  $('kZurueck').onclick = () => springe(-1); $('kVor').onclick = () => springe(1);
  $('kAusgabe').onclick = zeigAusgabe;
  $('kHilfe').onclick = hilfe;
  $('kThema').onclick = () => { const neu = document.documentElement.dataset.thema === 'hell' ? 'dunkel' : 'hell'; document.documentElement.dataset.thema = neu; try { localStorage.setItem('twsr.thema', neu); } catch (e) { /* egal */ } zl.male(); };
  // Bühne
  $('bHolen').onclick = () => holeMedien(true);
  $('tSpiel').onclick = () => vor.umschalten();
  $('tAnfang').onclick = () => vor.geh(0); $('tEnde').onclick = () => vor.geh(Z.lay.dauer);
  $('tBildZ').onclick = () => { vor.halt(); vor.geh(vor.zeit() - 1 / 30); }; $('tBildV').onclick = () => { vor.halt(); vor.geh(vor.zeit() + 1 / 30); };
  $('tVoll').onclick = () => { document.body.classList.toggle('vollbild'); passeBuehne(); };
  new ResizeObserver(passeBuehne).observe($('bPlatz'));
  // Zeitleiste
  $('zTeilen').onclick = teile; $('zDoppeln').onclick = verdopple; $('zWeg').onclick = entferne;
  $('zKleiner').onclick = () => zl.zoom(1 / 1.4); $('zGroesser').onclick = () => zl.zoom(1.4); $('zAlles').onclick = () => zl.allesZeigen();
  matchMedia('(max-width: 1000px)').addEventListener('change', () => { if (!tafeln.schmal() && Z.reiter === 'eig') tafeln.setzReiter('medien'); tafeln.zeigLinks(); tafeln.zeigEig(); passeBuehne(); });

  buehneAnfassen(); tastatur(); ablage(); weitereWege();
  window.addEventListener('beforeunload', () => { sichere(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sichere(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.TWSchnittraum = { Z, medien, vor, zl, K, Q, nimm, legeMedium, zeigAusgabe }; // für Prüfungen und Hilfe-Aufnahmen
  document.documentElement.dataset.bereit = '1';
  holeGeteiltes();
}

// Weitere Wege in die App: „Öffnen mit“ (eingerichtete App am PC), Einfügen (Strg+V), „Teilen“ vom Handy.
function weitereWege() {
  Q.beiStartDateien((l) => nimmUndMelde(l, !Z.lay.dauer));
  document.addEventListener('paste', async (ev) => { const l = Q.ausEinfuegen(ev); if (!l.length) return; ev.preventDefault(); await nimmUndMelde(l, !Z.lay.dauer); });
}
async function holeGeteiltes() {
  const l = await Q.geteiltes();
  if (l.length) { const neu = await nimmUndMelde(l, !Z.lay.dauer); await Q.geteiltesWeg(); if (neu.length && Z.reiter !== 'medien') tafeln.setzReiter('medien'); }
  if (/[?&]geteilt=/.test(location.search)) {
    // Geteilt, aber nichts angekommen (sehr große Datei oder kein Video/Foto): klar sagen und den Weg nennen, der immer geht.
    if (!l.length) meldung('Die geteilte Datei ist nicht angekommen – sie ist vielleicht zu groß für diesen Weg. Bitte unter „Medien“ über „Galerie“ holen.', true, 12000);
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
  }
  document.documentElement.dataset.geteilt = String(l.length);
}

function hilfe() {
  const w = window.open('hilfe.html', 'tw-sr-hilfe', 'width=600,height=860');
  if (!w) location.href = 'hilfe.html';
}

// Text oder Bildausschnitt direkt in der Vorschau anfassen und verschieben.
function buehneAnfassen() {
  const c = $('bild'); let zieh = null;
  c.addEventListener('pointerdown', (ev) => {
    const r = c.getBoundingClientRect(), fx = c.width / r.width, x = (ev.clientX - r.left) * fx, y = (ev.clientY - r.top) * fx;
    if (Z.fx.pick) { K.fx.getippt(x, y); ev.preventDefault(); return; }                      // eine Farbe wird gewählt: Dieser Tipp gehört der Farbe
    const box = [...vor.boxen()].reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h), griff = box ? null : K.fx.fasse(x, y);
    if (griff) zieh = { art: 'stelle', griff, fx, bewegt: true };
    else if (box) { waehle({ art: 'text', id: box.id }); const t = gewaehlt(); zieh = { art: 'text', d: t, x0: ev.clientX, y0: ev.clientY, vx: t.x, vy: t.y, fx, bewegt: false }; }
    else if (Z.sel && Z.sel.art === 'clip') { const k = gewaehlt(), s = Z.lay.segs.find(q => q.c === k); if (k && s && istAktiv(s, Math.min(vor.zeit(), Z.lay.dauer - 0.02))) zieh = { art: 'clip', d: k, x0: ev.clientX, y0: ev.clientY, vx: k.x, vy: k.y, fx, bewegt: false }; }
    if (zieh) { vor.halt(); try { c.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } ev.preventDefault(); }
  });
  c.addEventListener('pointermove', (ev) => {
    if (!zieh) return;
    if (zieh.art === 'stelle') { const r = c.getBoundingClientRect(); zieh.griff.zieh((ev.clientX - r.left) * zieh.fx, (ev.clientY - r.top) * zieh.fx); return; }
    const dx = (ev.clientX - zieh.x0) * zieh.fx / c.width, dy = (ev.clientY - zieh.y0) * zieh.fx / c.height;
    if (!zieh.bewegt && Math.abs(dx) + Math.abs(dy) < 0.004) return;
    zieh.bewegt = true;
    const raste = (v, m) => (Math.abs(v - m) < 0.012 ? m : v);
    aendere(() => {
      if (zieh.art === 'text') { zieh.d.x = klemm(zieh.d.ausr === 'mitte' ? raste(zieh.vx + dx, 0.5) : zieh.vx + dx, 0, 1); zieh.d.y = klemm(raste(zieh.vy + dy, 0.5), 0, 1); }
      else { zieh.d.x = klemm(raste(zieh.vx + dx, 0), -1, 1); zieh.d.y = klemm(raste(zieh.vy + dy, 0), -1, 1); }
    }, false);
  });
  const los = () => { if (!zieh) return; const z = zieh; zieh = null; if (z.art === 'stelle') { z.griff.los(); tafeln.zeigEig(); } else if (z.bewegt) { halteFest(); tafeln.zeigEig(); } };
  c.addEventListener('pointerup', los); c.addEventListener('pointercancel', los);
}

function tastatur() {
  // Nach einem Mausklick den Knopf wieder loslassen, damit die Leertaste danach abspielt statt den Knopf erneut zu drücken.
  document.addEventListener('click', (ev) => { const b = ev.target.closest && ev.target.closest('button'); if (b && ev.detail > 0) b.blur(); });
  document.addEventListener('keydown', (ev) => {
    const z = ev.target, tippt = z && (z.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'color'].includes(z.type) || z.tagName === 'TEXTAREA' || z.isContentEditable);
    if (document.querySelector('.dlg-hinter')) return;
    const strg = ev.ctrlKey || ev.metaKey, k = ev.key;
    if (strg && k.toLowerCase() === 'z') { if (tippt) return; ev.preventDefault(); springe(ev.shiftKey ? 1 : -1); return; }
    if (strg && k.toLowerCase() === 'y') { if (tippt) return; ev.preventDefault(); springe(1); return; }
    if (strg && k.toLowerCase() === 's') { ev.preventDefault(); sichere(); meldung('Gesichert.'); return; }
    if (k === 'F1') { ev.preventDefault(); hilfe(); return; }
    if (tippt) { if (k === 'Escape') z.blur(); return; }
    if (z && z.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return; // Knopf per Tastatur bedienen
    if (strg && k.toLowerCase() === 'd') { ev.preventDefault(); verdopple(); return; }
    if (strg || ev.altKey) return;
    if (k === ' ') { ev.preventDefault(); if (aufn.lauf) K.aufnahme.stopp(); else vor.umschalten(); }
    else if (k === 's' || k === 'S') { ev.preventDefault(); teile(); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); if (!K.fx.entferneWahl()) entferne(); }      // eine angefasste Stelle geht allein – nicht der ganze Clip
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { if (z && z.type === 'range') return; ev.preventDefault(); vor.halt(); vor.geh(vor.zeit() + (k === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : 1 / 30)); }
    else if (k === 'Home') { ev.preventDefault(); vor.geh(0); }
    else if (k === 'End') { ev.preventDefault(); vor.geh(Z.lay.dauer); }
    else if (k === '+' ) zl.zoom(1.4); else if (k === '-') zl.zoom(1 / 1.4);
    else if (k === 'Escape') { if (document.body.classList.contains('vollbild')) { document.body.classList.remove('vollbild'); passeBuehne(); } else if (!K.fx.lassLos()) waehle(null); }
  });
}

// Dateien oder ganze Ordner ins Fenster ziehen – überall hin; das Feld „Hierher ziehen“ unter „Medien“ zeigt nur, dass es geht.
function ablage() {
  const zone = $('dropZone'); let tiefe = 0;
  const arten = (ev) => (ev.dataTransfer ? [...ev.dataTransfer.types] : []);
  const istDatei = (ev) => arten(ev).includes('Files');
  // Ein Bild oder ein Verweis aus einer Internetseite: Ohne Eingreifen würde der Browser die Seite öffnen und den Schnittraum verlassen.
  const istVerweis = (ev) => !istDatei(ev) && !arten(ev).includes('text/tw-medium') && arten(ev).includes('text/uri-list');
  window.addEventListener('dragenter', (ev) => { if (!istDatei(ev)) return; tiefe++; zone.classList.add('an'); });
  window.addEventListener('dragleave', (ev) => { if (!istDatei(ev)) return; tiefe = Math.max(0, tiefe - 1); if (!tiefe) zone.classList.remove('an'); });
  window.addEventListener('dragover', (ev) => { if (istDatei(ev) || istVerweis(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('drop', async (ev) => {
    if (istVerweis(ev)) {
      ev.preventDefault();
      const adresse = (ev.dataTransfer.getData('text/uri-list') || '').split('\n')[0].trim();
      if (/^https?:/i.test(adresse) && !adresse.startsWith(location.origin)) meldung(FREI
        ? 'Aus einer Internetseite lässt sich nichts hineinziehen. Bitte die Datei erst herunterladen und dann hereinziehen.'
        : 'Aus einer Internetseite lässt sich nichts hineinziehen. Hol die Datei unter „Medien“ über „Google Drive“ oder „Google Fotos“ – oder lade sie herunter und zieh sie dann herein.', true, 10000);
      return;
    }
    if (!istDatei(ev)) return;
    ev.preventDefault(); tiefe = 0; zone.classList.remove('an');
    const aufZeitleiste = !!(ev.target && ev.target.closest && ev.target.closest('#unten')); // auf die Zeitleiste gezogen → gleich in den Film
    const liste = await ausAblage(ev.dataTransfer);
    if (!liste.length) { meldung('Darin war kein Video, Foto oder Ton.', true); return; }
    const ausOrdner = liste.filter(e => e.ausOrdner).length;
    if (ausOrdner >= 300) meldung('Der Ordner ist sehr groß – die ersten 300 Dateien sind übernommen. Für den Rest den Ordner unter „Ordner“ verbinden.', false, 9000);
    const neu = await nimmUndMelde(liste, aufZeitleiste || !Z.lay.dauer);
    if (neu.length && Z.lay.dauer && Z.reiter !== 'medien') tafeln.setzReiter('medien');
  });
}

start().catch((e) => { console.error(e); meldung('Die App konnte nicht starten: ' + (e && e.message ? e.message : e), true, 20000); });
