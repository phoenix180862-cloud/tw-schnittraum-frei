// TW Schnittraum – Quellen: alle Wege, auf denen Videos, Fotos und Ton in die App kommen (ohne Oberfläche – die baut quellen-fenster.js).
//   • Ordner verbinden (PC und Android in Chrome/Edge): ein Ordner bleibt als Quelle gemerkt – auch das Handy über „Smartphone-Link“,
//     ein Laufwerk von Google Drive, eine Kamera-Karte, ein USB-Stick. Die Dateien bleiben, wo sie sind.
//   • Google Drive und Google Fotos: Anmeldung wie in den anderen TW-Apps (gemeinsamer Zugang), gewählte Dateien werden auf das Gerät geholt.
//   • „Teilen“ vom Handy, „Öffnen mit“ am PC, Einfügen (Strg+V).
// Grundsatz: Die App holt nur, was du auswählst. Sie schickt nichts von dir irgendwohin.
import { db } from './db.js';
import * as ablage from './ablage.js';
import { artVon } from './medien.js';

export { MOBIL, ANDROID, WINDOWS } from './geraeteart.js';   // Handy/Tablet oder PC – Tablets melden sich oft als PC, siehe geraeteart.js
export const kann = { ordner: typeof window.showDirectoryPicker === 'function', ablage: ablage.gibtEs() };

export function groesseText(b) {
  if (!(b > 0)) return '';
  if (b >= 1e9) return (b / 1e9).toFixed(b >= 1e10 ? 0 : 1).replace('.', ',') + ' GB';
  if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' kB';
}
/** „Heute“, „Gestern“, „Diese Woche“, sonst Monat und Jahr – zum Gruppieren nach Aufnahmetag. */
export function tagGruppe(ms, jetzt = Date.now()) {
  if (!ms) return 'Ohne Datum';
  const d = new Date(ms), h = new Date(jetzt), tag = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((tag(h) - tag(d)) / 864e5);
  if (diff <= 0) return 'Heute'; if (diff === 1) return 'Gestern'; if (diff < 7) return 'Diese Woche';
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}
export const zeitpunktText = (ms) => (ms ? new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// ───────────────────────── Ordner ─────────────────────────
const KV_ORDNER = 'quellen.ordner';
export async function ordnerListe() { try { return (await db.hol('kv', KV_ORDNER)) || []; } catch (e) { return []; } }
const merkeOrdner = (l) => db.setz('kv', l, KV_ORDNER);

/** Ordner-Auswahl des Geräts öffnen und den Ordner als Quelle merken. art: 'ordner' | 'handy'. Wirft AbortError, wenn abgebrochen. */
export async function ordnerVerbinden(art = 'ordner') {
  const h = await window.showDirectoryPicker({ id: art === 'handy' ? 'tw-sr-handy' : 'tw-sr-quelle', mode: 'read' });
  const l = await ordnerListe();
  for (const e of l) { try { if (await e.handle.isSameEntry(h)) return e; } catch (e2) { /* weiter */ } }
  const e = { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: h.name, art, handle: h, gesehen: 0 };
  l.push(e); await merkeOrdner(l); return e;
}
export async function ordnerTrennen(id) { await merkeOrdner((await ordnerListe()).filter((e) => e.id !== id)); }   // nur die Verbindung – der Ordner selbst bleibt unberührt
export async function ordnerMerke(id, felder) { const l = await ordnerListe(), e = l.find((x) => x.id === id); if (e) { Object.assign(e, felder); await merkeOrdner(l); } }

/** Darf die App den Ordner lesen? Mit fragen = true bittet der Browser um Erlaubnis (braucht einen Klick). */
export async function erlaubt(handle, fragen = false) {
  try {
    let s = await handle.queryPermission({ mode: 'read' });
    if (s !== 'granted' && fragen) s = await handle.requestPermission({ mode: 'read' });
    return s === 'granted';
  } catch (e) { return false; }
}

/** Inhalt eines Ordners: Unterordner und verwendbare Dateien (neueste zuerst). melde(gelesen, gesamt), abbruch() → true beendet. */
export async function ordnerInhalt(handle, melde, abbruch) {
  const ordner = [], roh = [];
  for await (const [name, h] of handle.entries()) {
    if (name.startsWith('.') || name.startsWith('$')) continue;
    if (h.kind === 'directory') { ordner.push({ name, handle: h }); continue; }
    const art = artVon({ name, type: '' }); if (art) roh.push({ name, art, groesse: 0, geaendert: 0, handle: h });
    if (abbruch && abbruch()) return null;
  }
  // Größe und Datum je Datei – mehrere gleichzeitig, damit auch große Ordner zügig erscheinen
  let i = 0, fertig = 0;
  const lauf = async () => { while (i < roh.length) { const d = roh[i++]; try { const f = await d.handle.getFile(); d.groesse = f.size; d.geaendert = f.lastModified; } catch (e) { /* nicht lesbar */ } fertig++; if (melde && fertig % 25 === 0) melde(fertig, roh.length); if (abbruch && abbruch()) return; } };
  await Promise.all(Array.from({ length: Math.min(10, roh.length) }, lauf));
  if (abbruch && abbruch()) return null;
  ordner.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  roh.sort((a, b) => (b.geaendert - a.geaendert) || b.name.localeCompare(a.name, 'de', { numeric: true }));
  return { ordner, dateien: roh };
}
/** Aus gewählten Ordner-Einträgen werden Einträge für die Mediathek (mit Verweis – die Dateien bleiben, wo sie sind). */
export async function ausOrdner(dateien) {
  const aus = [];
  for (const d of dateien) { try { aus.push({ datei: await d.handle.getFile(), handle: d.handle, herkunft: 'ordner' }); } catch (e) { console.warn('Datei nicht lesbar', d.name, e); } }
  return aus;
}

// ───────────────────────── Vom Handy „geteilt“ (Teilen-Ziel der eingerichteten App) ─────────────────────────
// Der Service Worker (sw.js) legt geteilte Dateien in einem Zwischenspeicher ab; die App holt sie beim Start ab.
export const GETEILT = 'tw-sr-geteilt';
export async function geteiltes() {
  const aus = [];
  try {
    if (!('caches' in window) || !(await caches.has(GETEILT))) return aus;
    const c = await caches.open(GETEILT);
    for (const anfrage of await c.keys()) {
      const a = await c.match(anfrage); if (!a) continue;
      const b = await a.blob(), name = decodeURIComponent(a.headers.get('x-name') || '') || 'Geteilt';
      aus.push({ datei: new File([b], name, { type: a.headers.get('content-type') || b.type, lastModified: Number(a.headers.get('x-zeit')) || Date.now() }), kopie: true, herkunft: 'geteilt' });
    }
  } catch (e) { console.warn('Geteiltes nicht lesbar', e); }
  return aus;
}
export const geteiltesWeg = () => caches.delete(GETEILT).catch(() => {});

// ───────────────────────── „Öffnen mit“ (eingerichtete App am PC) und Einfügen ─────────────────────────
/** Meldet Dateien, mit denen die App gestartet wurde („Öffnen mit › TW Schnittraum“). */
export function beiStartDateien(fn) {
  if (!('launchQueue' in window) || !window.launchQueue.setConsumer) return;
  window.launchQueue.setConsumer(async (start) => {
    const aus = [];
    for (const h of (start && start.files) || []) { try { if (h.kind === 'file') aus.push({ datei: await h.getFile(), handle: h, herkunft: 'geoeffnet' }); } catch (e) { console.warn(e); } }
    if (aus.length) fn(aus);
  });
}
/** Dateien aus der Zwischenablage (Strg+V). */
export function ausEinfuegen(ev) {
  const d = ev.clipboardData; if (!d || !d.files || !d.files.length) return [];
  return [...d.files].filter((f) => artVon(f)).map((datei) => ({ datei, kopie: true, herkunft: 'eingefuegt' }));
}
