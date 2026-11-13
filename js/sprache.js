// TW Schnittraum – Spracherkennung im Gerät (für die automatischen Untertitel): holt den Ton der Stellen, die im Film zu hören sind,
// und lässt ihn vom Arbeiter im Hintergrund lesen. Es wird nichts hochgeladen.
import { zeilen as baueZeilen } from './sprache-kern.js';
import { tonLuecken, tonPuffer } from './tonlesen.js';

const RATE = 16000, STUECK = 240;      // längere Stellen werden in Stücken von 4 Minuten gelesen
let arbeiter = null, bereit = false, ladeP = null, zaehler = 0, beiLaden = null;
const offen = new Map();               // Auftragsnummer → { ok, nein, melde }

function start() {
  if (arbeiter) return;
  arbeiter = new Worker(new URL('./sprache-worker.js', import.meta.url), { type: 'module' });
  arbeiter.onmessage = (ev) => {
    const d = ev.data, a = offen.get(d.nr);
    if (d.art === 'laden') { if (beiLaden) beiLaden(d.anteil); }
    else if (d.art === 'lauf') { if (a && a.melde) a.melde(d.anteil); }
    else if (d.art === 'fertig') { if (a) { offen.delete(d.nr); a.ok(d); } }
    else if (d.art === 'bereit') { bereit = true; const l = offen.get('lade'); if (l) { offen.delete('lade'); l.ok(d); } }
    else if (d.art === 'fehler') { const z = offen.get(d.bei === 'lade' ? 'lade' : d.nr); if (z) { offen.delete(d.bei === 'lade' ? 'lade' : d.nr); z.nein(new Error(d.text)); } }
  };
  arbeiter.onerror = (ev) => { for (const z of offen.values()) z.nein(new Error(ev.message || 'Die Spracherkennung konnte nicht starten.')); offen.clear(); ladeP = null; arbeiter = null; bereit = false; };
}

// Ton einer Quelle von … bis (Sekunden, Zeitachse wie im Schnitt) als ein Kanal mit 16 kHz – oder null, wenn die Datei keinen lesbaren Ton hat.
export async function tonStueck(m, von, bis) {
  const { Input, ALL_FORMATS, BlobSource, AudioBufferSink, EncodedPacketSink } = await import('../lib/mediabunny.min.mjs');
  const input = new Input({ source: new BlobSource(m.datei), formats: ALL_FORMATS });
  try {
    const v = m.art === 'video' ? await input.getPrimaryVideoTrack() : null, a = await input.getPrimaryAudioTrack();
    if (!a || !(await a.canDecode())) return null;
    const basis = v ? await v.getFirstTimestamp() : Math.max(0, await a.getFirstTimestamp()), senke = new AudioBufferSink(a), luecken = await tonLuecken({ EncodedPacketSink }, a);
    const gesamt = Math.max(1, Math.ceil((bis - von) * RATE)), aus = new Float32Array(gesamt), FENSTER = 30, AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    for (let w0 = von; w0 < bis - 1e-6; w0 += FENSTER) {
      const w1 = Math.min(bis, w0 + FENSTER), n = Math.max(1, Math.round((w1 - w0) * RATE)), oc = new AC(1, n, RATE);
      for await (const st of tonPuffer(senke, luecken, basis + w0, basis + w1)) {
        const versatz = st.timestamp - basis - w0, k = oc.createBufferSource(); k.buffer = st.buffer; k.connect(oc.destination);
        if (versatz >= 0) k.start(versatz); else if (-versatz < st.duration) k.start(0, -versatz);
      }
      const teil = (await oc.startRendering()).getChannelData(0), ab = Math.round((w0 - von) * RATE);
      aus.set(teil.subarray(0, Math.min(teil.length, gesamt - ab)), ab);
    }
    return aus;
  } finally { input.dispose(); }
}

export const sprache = {
  istBereit: () => bereit,
  // Rechenwerk und Sprachmodell laden (einmalig rund 85 MB, danach aus dem Gerät).
  lade(melde) {
    start(); beiLaden = melde || null;
    if (bereit) return Promise.resolve();
    if (!ladeP) { ladeP = new Promise((ok, nein) => offen.set('lade', { ok, nein })).catch((e) => { ladeP = null; throw new Error('Das Sprachmodell konnte nicht geladen werden' + (navigator.onLine === false ? ' – es gibt gerade kein Internet.' : '.') + ' Beim ersten Mal braucht es eine Verbindung, danach nicht mehr. (' + e.message + ')'); }); arbeiter.postMessage({ art: 'lade' }); }
    return ladeP;
  },
  // Ein Tonstück (Float32Array, 16 kHz) lesen → Wörter mit Zeiten.
  lies(ton, melde, abbruch) {
    start(); const nr = ++zaehler;
    const takt = abbruch ? setInterval(() => { if (abbruch()) arbeiter.postMessage({ art: 'stopp', nr }); }, 200) : 0;
    return new Promise((ok, nein) => { offen.set(nr, { ok, nein, melde }); arbeiter.postMessage({ art: 'erkenne', nr, ton }, [ton.buffer]); }).finally(() => clearInterval(takt));
  },
  /**
   * Alle fehlenden Stellen eines Films lesen.
   * @param stellen   [{ medium, von, bis }] aus fehlendeStellen()
   * @param medien    Map der Mediathek
   * @param melde     (text, anteil 0…1)
   * @param abbruch   () => true, wenn abgebrochen werden soll
   * @param beiStelle (mediumId, von, bis, zeilen) – wird für jede fertige Stelle gerufen
   */
  async erkenne(stellen, medien, melde, abbruch, beiStelle) {
    const teile = [];
    for (const s of stellen) for (let a = s.von; a < s.bis - 1e-6; a += STUECK) teile.push({ medium: s.medium, von: a, bis: Math.min(s.bis, a + STUECK) });
    const gesamt = teile.reduce((n, t) => n + (t.bis - t.von), 0) || 1; let erledigt = 0, rechen = 0, tonzeit = 0, zahl = 0;
    for (const t of teile) {
      if (abbruch && abbruch()) throw new Error('abgebrochen');
      const m = medien.get(t.medium);
      if (!m || !m.datei) { erledigt += t.bis - t.von; continue; }
      melde(`Ton wird vorbereitet … (${m.name})`, erledigt / gesamt);
      const rand = 0.6, von = Math.max(0, t.von - rand), bis = Math.min(m.dauer || t.bis, t.bis + rand);
      const ton = await tonStueck(m, von, bis);
      let zl = [];
      if (ton) {
        const r = await this.lies(ton, (a) => melde(`Sprache wird erkannt … (${m.name})`, (erledigt + a * (t.bis - t.von)) / gesamt), abbruch);
        rechen += r.rechenzeit; tonzeit += r.tonzeit;
        zl = baueZeilen(r.woerter.map((w) => ({ a: w.a + von, b: w.b + von, w: w.w })));
      }
      zahl += zl.filter((z) => { const mitte = (z.a + z.b) / 2; return mitte >= t.von && mitte < t.bis; }).length;
      beiStelle(t.medium, t.von, t.bis, zl); erledigt += t.bis - t.von; melde('Sprache wird erkannt …', erledigt / gesamt);
    }
    return { zeilen: zahl, rechenzeit: rechen, tonzeit };
  },
};
