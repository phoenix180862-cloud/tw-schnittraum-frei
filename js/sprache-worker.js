// TW Schnittraum – Spracherkennung im Gerät, Arbeiter im Hintergrund (damit die Oberfläche flüssig bleibt).
// Lädt das Rechenwerk (onnxruntime-web) und das Sprachmodell einmal, legt beides im Gerät ab und erkennt danach ohne Netz.
import * as ort from '../lib/ort/ort.wasm.bundle.min.mjs';
import { erkenne, woerter } from './sprache-kern.js';

const MODELL = new URL('../lib/sprache/kroko-de/', import.meta.url).href, WERK = new URL('../lib/ort/ort-wasm-simd-threaded.wasm', import.meta.url).href;
let S = null, K = null, ladeP = null, gestoppt = new Set();

// Datei holen: zuerst aus der Ablage im Gerät, sonst aus dem Netz (mit Fortschritt) – und dann ablegen.
async function hol(lager, url, soll, melde) {
  let c = null; try { c = await caches.open(lager); } catch (e) { /* ohne Ablage geht es auch */ }
  if (c) {
    const r = await c.match(url);
    if (r) { const b = await r.arrayBuffer(); if (!soll || b.byteLength === soll) { melde(b.byteLength); return b; } await c.delete(url); }
  }
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
  const leser = antwort.body.getReader(), teile = []; let n = 0;
  for (;;) { const { done, value } = await leser.read(); if (done) break; teile.push(value); n += value.length; melde(n); }
  const blob = new Blob(teile);
  if (soll && blob.size !== soll) throw new Error('Datei unvollständig');
  if (c) { try { await c.put(url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) { /* Speicher knapp – dann ohne Ablage */ } }
  return blob.arrayBuffer();
}

async function lade() {
  K = await (await fetch(MODELL + 'modell.json')).json();
  const lager = 'tw-sr-sprache-' + K.fassung, namen = ['encoder.onnx', 'decoder.onnx', 'joiner.onnx'], WERK_GROESSE = 15e6;
  try { for (const n of await caches.keys()) if (n.startsWith('tw-sr-sprache-') && n !== lager) await caches.delete(n); } catch (e) { /* egal */ }
  const gesamt = namen.reduce((s, n) => s + K.dateien[n], 0) + WERK_GROESSE, stand = {};
  const melde = (n) => (b) => { stand[n] = b; postMessage({ art: 'laden', anteil: Math.min(0.99, Object.values(stand).reduce((x, y) => x + y, 0) / gesamt) }); };
  const werk = await hol(lager, WERK, 0, melde('werk')), puffer = {};
  for (const n of namen) puffer[n] = await hol(lager, MODELL + n, K.dateien[n], melde(n));
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmBinary = werk; ort.env.logLevel = 'error';
  const sitzung = (b) => ort.InferenceSession.create(new Uint8Array(b), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  S = { enc: await sitzung(puffer['encoder.onnx']), dec: await sitzung(puffer['decoder.onnx']), join: await sitzung(puffer['joiner.onnx']) };
  postMessage({ art: 'laden', anteil: 1 });
}

self.onmessage = async (ev) => {
  const d = ev.data;
  try {
    if (d.art === 'lade') { await (ladeP || (ladeP = lade())); postMessage({ art: 'bereit', modell: K.name, lizenz: K.lizenz }); }
    else if (d.art === 'stopp') gestoppt.add(d.nr);
    else if (d.art === 'erkenne') {
      await (ladeP || (ladeP = lade()));
      const t0 = performance.now(), marken = await erkenne(ort, S, K, d.ton, (a) => postMessage({ art: 'lauf', nr: d.nr, anteil: a }), () => gestoppt.has(d.nr));
      postMessage({ art: 'fertig', nr: d.nr, woerter: woerter(marken, K.zeichen, K.vorlauf), rechenzeit: (performance.now() - t0) / 1000, tonzeit: d.ton.length / 16000 });
    }
  } catch (e) {
    if (d.art === 'lade') ladeP = null;
    postMessage({ art: 'fehler', nr: d.nr, bei: d.art, text: String(e && e.message ? e.message : e) });
  }
};
