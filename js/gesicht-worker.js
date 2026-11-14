// TW Schnittraum – Gesichter finden, Arbeiter im Hintergrund (damit die Oberfläche flüssig bleibt).
// Lädt das Rechenwerk (onnxruntime-web) und den Gesichtsfinder einmal, legt beides im Gerät ab und sucht danach ohne Netz.
// Die Bilder kommen als fertige Bildpunkte von der App und verlassen das Gerät nicht.
import * as ort from '../lib/ort/ort.wasm.bundle.min.mjs';
import { vorbereiten, auswerten, auslese } from './gesicht-kern.js';

const MODELL = new URL('../lib/gesicht/yunet_n_dynamic.onnx', import.meta.url).href, WERK = new URL('../lib/ort/ort-wasm-simd-threaded.wasm', import.meta.url).href;
const LAGER = 'tw-sr-gesicht-1', MODELL_GROESSE = 322906, WERK_GROESSE = 15e6;
let S = null, ladeP = null;

// Datei holen: zuerst aus einer Ablage im Gerät (das Rechenwerk liegt dort oft schon von der Spracherkennung), sonst aus dem Netz – und dann ablegen.
async function hol(url, soll, melde) {
  try { const r = await caches.match(url); if (r) { const b = await r.arrayBuffer(); if (!soll || b.byteLength === soll) { melde(b.byteLength); return b; } } } catch (e) { /* ohne Ablage geht es auch */ }
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
  const leser = antwort.body.getReader(), teile = []; let n = 0;
  for (;;) { const { done, value } = await leser.read(); if (done) break; teile.push(value); n += value.length; melde(n); }
  const blob = new Blob(teile);
  if (soll && blob.size !== soll) throw new Error('Datei unvollständig');
  try { const c = await caches.open(LAGER); await c.put(url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) { /* Speicher knapp – dann ohne Ablage */ }
  return blob.arrayBuffer();
}

async function lade() {
  const stand = {}, gesamt = MODELL_GROESSE + WERK_GROESSE;
  const melde = (n) => (b) => { stand[n] = b; postMessage({ art: 'laden', anteil: Math.min(0.99, Object.values(stand).reduce((x, y) => x + y, 0) / gesamt) }); };
  const werk = await hol(WERK, 0, melde('werk')), modell = await hol(MODELL, MODELL_GROESSE, melde('modell'));
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmBinary = werk; ort.env.logLevel = 'error';
  S = await ort.InferenceSession.create(new Uint8Array(modell), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  postMessage({ art: 'laden', anteil: 1 });
}

self.onmessage = async (ev) => {
  const d = ev.data;
  try {
    if (d.art === 'lade') { await (ladeP || (ladeP = lade())); postMessage({ art: 'bereit' }); }
    else if (d.art === 'finde') {
      await (ladeP || (ladeP = lade()));
      const t0 = performance.now(), x = new ort.Tensor('float32', vorbereiten(new Uint8ClampedArray(d.punkte), d.W, d.H), [1, 3, d.H, d.W]);
      const r = await S.run({ input: x }), aus = {};
      for (const n of Object.keys(r)) aus[n] = r[n].data;
      postMessage({ art: 'fertig', nr: d.nr, funde: auslese(auswerten(aus, d.W, d.H, d.w, d.h, d.grenze ?? 0.35)), ms: performance.now() - t0 });
    }
  } catch (e) {
    if (d.art === 'lade') ladeP = null;
    postMessage({ art: 'fehler', nr: d.nr, bei: d.art, text: String(e && e.message ? e.message : e) });
  }
};
