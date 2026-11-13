// TW Schnittraum – kleiner Speicher im Gerät (IndexedDB): Projekte, Medien-Verweise, Einstellungen.
const NAME = 'tw-schnittraum', FASSUNG = 1;
let offenP = null;

function offen() {
  if (!offenP) offenP = new Promise((ok, nein) => {
    const r = indexedDB.open(NAME, FASSUNG);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projekte')) d.createObjectStore('projekte', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('medien')) d.createObjectStore('medien', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nein(r.error);
  });
  return offenP;
}

function tx(lager, modus, fn) {
  return offen().then(d => new Promise((ok, nein) => {
    const t = d.transaction(lager, modus);
    const anfrage = fn(t.objectStore(lager));
    t.oncomplete = () => ok(anfrage ? anfrage.result : undefined);
    t.onerror = () => nein(t.error);
    t.onabort = () => nein(t.error);
  }));
}

export const db = {
  hol: (lager, id) => tx(lager, 'readonly', s => s.get(id)),
  alle: (lager) => tx(lager, 'readonly', s => s.getAll()),
  setz: (lager, wert, schluessel) => tx(lager, 'readwrite', s => schluessel === undefined ? s.put(wert) : s.put(wert, schluessel)),
  weg: (lager, id) => tx(lager, 'readwrite', s => s.delete(id)),
};
