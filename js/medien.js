// TW Schnittraum – Mediathek: Videos, Fotos und Ton vom Gerät holen. Die Dateien bleiben, wo sie sind –
// gespeichert wird nur ein Verweis (plus kleine Vorschaubilder). Nichts wird hochgeladen.
// Gibt es zu einer Datei keinen dauerhaften Verweis (Galerie des Handys, geteilt, eingefügt, aus Google geholt),
// merkt sich die App eine Kopie in ihrer Ablage (ablage.js) – sonst wäre die Datei nach dem Schließen weg.
import { db } from './db.js';
import { nr } from './modell.js';
import * as ablage from './ablage.js';
import { MOBIL } from './geraeteart.js';
// Die Videobibliothek wird erst geladen, wenn die erste Datei geprüft wird – so startet die App schneller.
let bibP = null;
const bib = () => bibP || (bibP = import('../lib/mediabunny.min.mjs'));

export const medien = new Map(); // id → Medium
const hoerer = new Set();
export const beiMedien = (fn) => hoerer.add(fn);
const melde = () => hoerer.forEach(f => { try { f(); } catch (e) { console.error(e); } });

const VIDEO = /\.(mp4|mov|m4v|webm|mkv|3gp|mts|ts)$/i, BILD = /\.(jpe?g|png|webp|gif|bmp|avif)$/i, TON = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
export function artVon(datei) {
  const t = datei.type || '';
  if (t.startsWith('video/') || VIDEO.test(datei.name)) return 'video';
  if (t.startsWith('image/') || BILD.test(datei.name)) return 'bild';
  if (t.startsWith('audio/') || TON.test(datei.name)) return 'ton';
  return null;
}

const ereignis = (el, gut, ms = 15000) => new Promise((ok, nein) => {
  const zu = setTimeout(() => { weg(); nein(new Error('Zeit abgelaufen')); }, ms);
  const a = () => { weg(); ok(); }, b = () => { weg(); nein(el.error || new Error('Fehler')); };
  const weg = () => { clearTimeout(zu); el.removeEventListener(gut, a); el.removeEventListener('error', b); };
  el.addEventListener(gut, a, { once: true }); el.addEventListener('error', b, { once: true });
});

function satz(m) { // was dauerhaft gespeichert wird (ohne Laufzeit-Felder)
  const { id, name, art, dauer, w, h, hatTon, thumb, streifen, spitzen, groesse, geaendert, handle, blob, ablage: abl, typ, herkunft, fehler } = m;
  return { id, name, art, dauer, w, h, hatTon, thumb, streifen, spitzen, groesse, geaendert, handle, blob, ablage: abl, typ, herkunft, fehler };
}
// Nur sichern, was noch in der Mediathek liegt – sonst legt eine späte Vorschau-Berechnung ein gerade herausgenommenes Medium wieder an.
const sichere = (m) => medien.get(m.id) !== m ? Promise.resolve() : db.setz('medien', satz(m)).catch(e => console.warn('Medium nicht gesichert', e));

async function haenge(m, datei) {
  if (m.url) URL.revokeObjectURL(m.url);
  m.datei = datei; m.url = URL.createObjectURL(datei); m.getrennt = false;
  if (m.art === 'bild') { try { m.bild = await createImageBitmap(datei); m.w = m.bild.width; m.h = m.bild.height; } catch (e) { m.fehler = 'Dieses Bild kann nicht gelesen werden.'; } }
}

async function pruefeVideo(m) {
  m.fehler = '';
  try {
    const { Input, ALL_FORMATS, BlobSource } = await bib();
    const input = new Input({ source: new BlobSource(m.datei), formats: ALL_FORMATS });
    try {
      const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
      if (v) {
        m.dauer = await input.computeDuration();
        m.w = await v.getDisplayWidth(); m.h = await v.getDisplayHeight();
        m.hatTon = !!a;
        if (!(await v.canDecode())) m.fehler = `Dieses Video (Format ${String(v.codec || 'unbekannt').toUpperCase()}) kann dieser Browser auf diesem Gerät nicht lesen. Abhilfe: am PC Chrome oder Edge verwenden – oder in der Kamera des Handys die platzsparende Aufnahme (HEVC / „hohe Effizienz“) und HDR-Video ausschalten. Was dieses Gerät kann, zeigt „Gerät prüfen“ in der Hilfe.`;
      }
    } finally { input.dispose(); }
  } catch (e) { console.warn('Bibliothek konnte Datei nicht lesen', m.name, e); }
  const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = m.url;
  try {
    await ereignis(v, 'loadedmetadata');
    if (Number.isFinite(v.duration) && v.duration > 0) m.dauer = m.dauer ? Math.min(m.dauer, v.duration) : v.duration;
    if (!m.w) { m.w = v.videoWidth; m.h = v.videoHeight; }
    if (!v.videoWidth && !m.fehler) m.fehler = 'In dieser Datei ist kein Bild, nur Ton.';
  } catch (e) {
    if (!m.fehler) m.fehler = 'Dieses Video kann der Browser nicht abspielen. Bitte als MP4 (H.264) speichern und neu holen.';
  }
  v.removeAttribute('src'); v.load();
  if (!m.dauer) m.dauer = 0;
}

// Kleine Vorschaubilder entlang des Videos (für Mediathek und Zeitleiste) – läuft im Hintergrund.
async function baueStreifen(m, anzahl = 6) {
  if (m.fehler || !m.datei || !m.dauer) return;
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
  try {
    await ereignis(v, 'loadeddata');
    const h = 90, w = Math.max(40, Math.round(h * (v.videoWidth || 16) / (v.videoHeight || 9)));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const bilder = [];
    for (let i = 0; i < anzahl; i++) {
      v.currentTime = Math.min(m.dauer - 0.05, m.dauer * (i + 0.5) / anzahl);
      await ereignis(v, 'seeked', 8000);
      x.drawImage(v, 0, 0, w, h);
      bilder.push(c.toDataURL('image/jpeg', 0.62));
    }
    m.streifen = bilder; m.thumb = bilder[Math.min(1, bilder.length - 1)];
    sichere(m); melde();
  } catch (e) { console.warn('Vorschaubilder nicht möglich', m.name, e); }
  v.removeAttribute('src'); v.load();
}

async function pruefeTon(m) {
  m.fehler = '';
  const a = document.createElement('audio'); a.preload = 'metadata'; a.src = m.url;
  try { await ereignis(a, 'loadedmetadata'); if (Number.isFinite(a.duration)) m.dauer = a.duration; } catch (e) { m.fehler = 'Diese Tondatei kann der Browser nicht abspielen.'; }
  a.removeAttribute('src'); a.load();
  if (!m.dauer || !Number.isFinite(m.dauer)) {
    try { const { Input, ALL_FORMATS, BlobSource } = await bib(); const input = new Input({ source: new BlobSource(m.datei), formats: ALL_FORMATS }); m.dauer = await input.computeDuration(); input.dispose(); } catch (e) { /* bleibt 0 */ }
  }
  m.hatTon = true;
  if (m.datei.size < 120e6) spitzen(m); // Wellenform im Hintergrund
}

async function spitzen(m) {
  try {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new AC(1, 2, 22050);
    const puffer = await oc.decodeAudioData(await m.datei.arrayBuffer());
    const d = puffer.getChannelData(0), n = Math.min(600, Math.max(60, Math.round(puffer.duration * 12))), schritt = Math.floor(d.length / n) || 1;
    const sp = [];
    for (let i = 0; i < n; i++) { let mx = 0; for (let j = i * schritt, e = Math.min(d.length, j + schritt); j < e; j += 8) { const v = Math.abs(d[j]); if (v > mx) mx = v; } sp.push(Math.round(mx * 100) / 100); }
    m.spitzen = sp; if (!m.dauer) m.dauer = puffer.duration;
    sichere(m); melde();
  } catch (e) { console.warn('Wellenform nicht möglich', m.name, e); }
}

// Kopie in die Ablage der App, wenn es keinen Verweis gibt und der Platz reicht. Liefert { ablage, datei } oder null.
async function kopiere(datei) {
  try { if (await ablage.passt(datei.size)) return await ablage.lege(datei, datei.name, { typ: datei.type, geaendert: datei.lastModified }); }
  catch (e) { console.warn('Kopie in die Ablage nicht möglich', datei.name, e); }
  return null;
}

// eintraege: [{ datei: File, handle?: FileSystemFileHandle, ablage?: Name in der Ablage, kopie?: true, herkunft?: Text }]
// → Liste der (neuen oder wiedergefundenen) Medien. „kopie“ = ohne Verweis eine Kopie in der Ablage der App anlegen.
export async function nimm(eintraege, zusatz = {}) {
  const aus = [], abgelehnt = [];
  for (const e of eintraege) {
    let { datei } = e; const { handle } = e; let abl = e.ablage || null;
    const art = artVon(datei);
    if (!art) { abgelehnt.push(datei.name); if (abl) ablage.loesche(abl); continue; }
    // Schon bekannt? (gleicher Name und gleiche Größe) → wieder verbinden statt doppelt anlegen
    let m = [...medien.values()].find(k => k.name === datei.name && k.groesse === datei.size && k.art === art);
    if (m) {
      if (!m.datei) {
        if (!handle && !abl && e.kopie && !m.handle && !m.ablage) { const k = await kopiere(datei); if (k) { abl = k.ablage; datei = k.datei; } }
        await haenge(m, datei); if (handle) m.handle = handle; if (abl) { m.ablage = abl; m.typ = datei.type; } if (m.art === 'video' && !m.streifen) baueStreifen(m); sichere(m);
      } else if (abl) ablage.loesche(abl);   // gibt es schon – die zweite Kopie wird nicht gebraucht
      aus.push(m); continue;
    }
    if (!handle && !abl && e.kopie) { const k = await kopiere(datei); if (k) { abl = k.ablage; datei = k.datei; } }
    m = { id: 'm' + nr(), name: datei.name, art, dauer: 0, w: 0, h: 0, hatTon: false, groesse: datei.size, geaendert: datei.lastModified, handle: handle || null, ablage: abl, typ: datei.type || '', herkunft: e.herkunft || undefined, ...zusatz };
    await haenge(m, datei);
    if (art === 'video') { await pruefeVideo(m); baueStreifen(m); }
    else if (art === 'ton') await pruefeTon(m);
    else if (m.bild) { const c = document.createElement('canvas'); c.height = 90; c.width = Math.round(90 * m.w / m.h); c.getContext('2d').drawImage(m.bild, 0, 0, c.width, c.height); m.thumb = c.toDataURL('image/jpeg', 0.7); }
    medien.set(m.id, m); await sichere(m); aus.push(m);
  }
  melde();
  return { medien: aus, abgelehnt };
}

// Aufnahme vom Mikrofon als eigenes Medium (wird im Gerät gespeichert, weil es keine Datei auf der Platte gibt).
export async function ausAufnahme(blob, name) {
  const datei = new File([blob], name, { type: blob.type || 'audio/wav' });
  const r = await nimm([{ datei }], { blob, herkunft: 'aufnahme' });
  return r.medien[0];
}

export async function ladeAlle() {
  const alle = await db.alle('medien').catch(() => []);
  for (const s of alle) {
    const m = { ...s, getrennt: true };
    medien.set(m.id, m);
    try {
      if (m.blob) await haenge(m, new File([m.blob], m.name, { type: m.blob.type }));
      else if (m.ablage) await haenge(m, await ablage.hole(m.ablage, m.name, m.typ, m.geaendert));
      else if (m.handle && (await m.handle.queryPermission({ mode: 'read' })) === 'granted') await haenge(m, await m.handle.getFile());
    } catch (e) { console.warn('Medium nicht verbunden', m.name, e); }
    if (m.datei && m.art === 'video' && !m.streifen) baueStreifen(m);   // Vorschaubilder nachholen, falls die App beim letzten Mal vorher geschlossen wurde
  }
  melde();
}

export const getrennte = () => [...medien.values()].filter(m => !m.datei);

// Nach einem Neustart: Zugriff auf die Dateien neu erlauben (braucht einen Klick – Regel des Browsers).
export async function verbindeAlle() {
  let ok = 0, offen = 0;
  for (const m of getrennte()) {
    if (!m.handle) { offen++; continue; }
    try {
      if ((await m.handle.requestPermission({ mode: 'read' })) === 'granted') { await haenge(m, await m.handle.getFile()); ok++; if (m.art === 'video' && !m.streifen) baueStreifen(m); }
      else offen++;
    } catch (e) { offen++; }
  }
  melde();
  return { ok, offen };
}

export async function entferne(id) { // nur aus der Mediathek – die Datei auf der Platte bleibt unberührt; eine Kopie in der Ablage der App wird mit entfernt
  const m = medien.get(id); if (!m) return;
  if (m.url) URL.revokeObjectURL(m.url);
  medien.delete(id); await db.weg('medien', id).catch(() => {});
  if (m.ablage) await ablage.loesche(m.ablage);
  melde();
}

const TYPEN = [{ description: 'Videos, Fotos, Musik', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'audio/*': ['.mp3', '.m4a', '.wav', '.ogg', '.flac'] } }];

// Datei-Auswahl öffnen. Mit „Verweis“ (Chrome/Edge) findet die App die Dateien nach einem Neustart wieder.
// Am Handy und Tablet nimmt „waehle“ die Datei-Auswahl des Geräts (dort stehen interner Speicher, SD-Karte, USB und die Speicher-Apps);
// die Auswahl mit Verweis (showOpenFilePicker) kennt dort die Galerie nicht.
export async function waehle(nurTon = false) {
  if (MOBIL) return ausGeraet({ art: nurTon ? 'ton' : 'dateien' });
  if (window.showOpenFilePicker) {
    try {
      const hs = await window.showOpenFilePicker({ multiple: true, id: nurTon ? 'tw-sr-ton' : 'tw-sr-medien', startIn: nurTon ? 'music' : 'videos', types: nurTon ? [{ description: 'Musik und Ton', accept: { 'audio/*': ['.mp3', '.m4a', '.wav', '.ogg', '.flac'] } }] : TYPEN });
      const liste = []; for (const h of hs) liste.push({ datei: await h.getFile(), handle: h });
      return liste;
    } catch (e) { if (e && e.name === 'AbortError') return []; console.warn(e); }
  }
  return new Promise((ok) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = nurTon ? 'audio/*' : 'video/*,image/*,audio/*';
    i.onchange = () => ok([...i.files].map(datei => ({ datei, kopie: true })));
    i.oncancel = () => ok([]);
    i.click();
  });
}

// Auswahl über das Bedienfeld des Geräts. Davon gibt es keinen Verweis – die App legt eine Kopie in ihre Ablage.
//   ohne Angabe  Galerie: alle Fotos und Videos des Geräts (am Handy/Tablet die Foto-Auswahl von Android bzw. iOS)
//   kamera       direkt ein Video aufnehmen
//   art 'dateien' Datei-Auswahl des Geräts ohne Einschränkung – interner Speicher, SD-Karte, USB-Stick, OneDrive, Google Drive, Netzwerk
//   art 'ton'    Musik und Sprachaufnahmen
export function ausGeraet(o = {}) {
  return new Promise((ok) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = !o.kamera;
    const annahme = o.kamera ? 'video/*' : o.art === 'ton' ? 'audio/*' : o.art === 'dateien' ? '' : 'video/*,image/*';
    if (annahme) i.accept = annahme;
    if (o.kamera) i.setAttribute('capture', 'environment');
    const herkunft = o.kamera ? 'kamera' : o.art === 'ton' ? 'ton' : o.art === 'dateien' ? 'dateien' : 'galerie';
    i.onchange = () => ok([...i.files].map(datei => ({ datei, kopie: true, herkunft })));
    i.oncancel = () => ok([]);
    i.click();
  });
}

// Hineingezogen: einzelne Dateien oder ganze Ordner (aus dem Explorer, von Stick, Speicherkarte, Netzlaufwerk, vom verbundenen Handy;
// am Tablet im geteilten Bildschirm auch aus der Galerie oder aus „Eigene Dateien“).
const ORDNER_GRENZE = 300, ORDNER_TIEFE = 4, UEBERGEHEN = /^(\.|\$|_to_delete$|System Volume Information$)/i;
const zaehlt = (name) => !!artVon({ name, type: '' });
// Ordner mit Verweis (Chrome/Edge): Die Dateien bleiben, wo sie sind.
async function ausOrdnerGriff(ordner, liste, tiefe = 0) {
  if (tiefe > ORDNER_TIEFE) return;
  for await (const g of ordner.values()) {
    if (liste.length >= ORDNER_GRENZE) return;
    if (g.kind === 'file') { if (zaehlt(g.name)) { try { liste.push({ datei: await g.getFile(), handle: g, herkunft: 'gezogen', ausOrdner: true }); } catch (e) { /* nicht lesbar – auslassen */ } } }
    else if (!UEBERGEHEN.test(g.name)) await ausOrdnerGriff(g, liste, tiefe + 1);
  }
}
// Ordner ohne Verweis (andere Browser): Die App legt Kopien in ihre Ablage.
async function ausOrdnerEintrag(eintrag, liste, tiefe = 0) {
  if (tiefe > ORDNER_TIEFE) return;
  const leser = eintrag.createReader(); let teil;
  do {
    teil = await new Promise((ok) => leser.readEntries(ok, () => ok([])));
    for (const e of teil) {
      if (liste.length >= ORDNER_GRENZE) return;
      if (e.isFile) { if (zaehlt(e.name)) { const d = await new Promise((ok) => e.file(ok, () => ok(null))); if (d) liste.push({ datei: d, kopie: true, herkunft: 'gezogen', ausOrdner: true }); } }
      else if (e.isDirectory && !UEBERGEHEN.test(e.name)) await ausOrdnerEintrag(e, liste, tiefe + 1);
    }
  } while (teil.length);
}
export async function ausAblage(dataTransfer) {
  const liste = [], ordner = [], warten = [];
  for (const it of [...dataTransfer.items]) {
    if (it.kind !== 'file') continue;
    // sofort sichern – die Ablage-Daten verfallen nach dem Ereignis
    const f = it.getAsFile(), eintrag = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null, istOrdner = !!(eintrag && eintrag.isDirectory);
    const ohneGriff = async () => { if (istOrdner) await ausOrdnerEintrag(eintrag, ordner); else if (f) liste.push({ datei: f, kopie: true, herkunft: 'gezogen' }); };
    if (it.getAsFileSystemHandle) warten.push(it.getAsFileSystemHandle().then(async (g) => {
      if (g && g.kind === 'file') liste.push({ datei: await g.getFile(), handle: g, herkunft: 'gezogen' });
      else if (g && g.kind === 'directory') await ausOrdnerGriff(g, ordner);
      else await ohneGriff();
    }).catch(ohneGriff));
    else warten.push(ohneGriff());
  }
  await Promise.all(warten);
  ordner.sort((a, b) => (a.datei.lastModified || 0) - (b.datei.lastModified || 0));   // aus Ordnern in der Reihenfolge der Aufnahme
  return liste.concat(ordner);
}
