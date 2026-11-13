// TW Schnittraum – Ablage in der App: privater Speicher des Browsers auf diesem Gerät (OPFS).
// Wozu: Dateien, zu denen es auf dem Gerät keinen dauerhaften Verweis gibt – aus Google Fotos oder Google Drive geholt, vom Handy „geteilt“,
// aus der Galerie des Handys gewählt, eingefügt –, wären nach dem Schließen der App weg. Deshalb legt die App davon eine Kopie in ihre Ablage.
// Die Ablage gehört nur dieser App auf diesem Gerät; nichts davon wird irgendwohin geschickt.

const ORDNER = 'medien';
const GRENZE = 6e9;                  // größere Dateien werden nicht kopiert (dann bleibt es beim Neu-Auswählen nach einem Neustart)
let dirP = null, dauerhaft = false;

export const gibtEs = () => !!(navigator.storage && navigator.storage.getDirectory);
const dir = () => dirP || (dirP = navigator.storage.getDirectory().then((w) => w.getDirectoryHandle(ORDNER, { create: true })));

const sauber = (name) => String(name || 'datei').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-120) || 'datei';
const neuerName = (name) => Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-' + sauber(name);

/** Wie viel Platz gibt der Browser dieser App? { belegt, frei } in Bytes (Schätzung des Browsers). */
export async function platz() {
  try { const e = await navigator.storage.estimate(); return { belegt: e.usage || 0, frei: Math.max(0, (e.quota || 0) - (e.usage || 0)) }; } catch (e) { return { belegt: 0, frei: 0 }; }
}

/** Passt eine Datei dieser Größe in die Ablage? (mit Luft, damit das Gerät nicht vollläuft) */
export async function passt(groesse) {
  if (!gibtEs() || !(groesse >= 0) || groesse > GRENZE) return false;
  const p = await platz();
  return p.frei > groesse * 1.15 + 3e8;
}

/**
 * Legt Daten in die Ablage. quelle: Blob/File oder ReadableStream. melde(bytesBisher) für den Fortschritt, signal zum Abbrechen.
 * Liefert { ablage, datei } – „ablage“ ist der Name, unter dem die Datei wiedergefunden wird.
 */
export async function lege(quelle, name, o = {}) {
  if (!gibtEs()) throw new Error('Dieser Browser hat keine Ablage für die App.');
  const d = await dir(), ablage = neuerName(name), griff = await d.getFileHandle(ablage, { create: true });
  if (!dauerhaft && navigator.storage.persist) { dauerhaft = true; navigator.storage.persist().catch(() => {}); }   // der Browser soll die Ablage nicht von sich aus räumen
  let schreiber = null, n = 0;
  try {
    if (typeof griff.createWritable !== 'function') throw new Error('Dieser Browser kann nicht in die Ablage der App schreiben.');
    schreiber = await griff.createWritable();
    const strom = quelle && typeof quelle.getReader === 'function' ? quelle : quelle.stream(), leser = strom.getReader();
    for (;;) {
      if (o.signal && o.signal.aborted) { try { await leser.cancel(); } catch (e) { /* egal */ } throw new DOMException('abgebrochen', 'AbortError'); }
      const { done, value } = await leser.read(); if (done) break;
      await schreiber.write(value); n += value.byteLength; if (o.melde) o.melde(n);
    }
    await schreiber.close(); schreiber = null;
  } catch (e) {
    try { if (schreiber) await schreiber.abort(); } catch (e2) { /* egal */ }
    try { await d.removeEntry(ablage); } catch (e2) { /* egal */ }
    throw e;
  }
  const f = await griff.getFile();
  return { ablage, datei: new File([f], name, { type: o.typ || (quelle && quelle.type) || f.type || '', lastModified: o.geaendert || (quelle && quelle.lastModified) || Date.now() }) };
}

/** Holt eine abgelegte Datei wieder (unter ihrem ursprünglichen Namen). */
export async function hole(ablage, name, typ, geaendert) {
  const d = await dir(), f = await (await d.getFileHandle(ablage)).getFile();
  return new File([f], name || ablage, { type: typ || f.type || '', lastModified: geaendert || f.lastModified });
}

/** Entfernt die Kopie aus der Ablage (das Original – etwa in Google Fotos – bleibt, wo es ist). */
export async function loesche(ablage) {
  try { await (await dir()).removeEntry(ablage); } catch (e) { /* schon weg */ }
}

/** Alle Namen in der Ablage (zum Aufräumen verwaister Kopien). */
export async function namen() {
  const aus = []; try { for await (const k of (await dir()).keys()) aus.push(k); } catch (e) { /* leer */ }
  return aus;
}
