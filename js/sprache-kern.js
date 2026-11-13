// TW Schnittraum – Spracherkennung im Gerät, Rechenkern (ohne Oberfläche, ohne Netz).
// Merkmale wie Kaldi („Fbank“, 80 Bänder) und Entschlüsselung für das Zipformer-Sprachmodell (Kroko-ASR Deutsch) auf onnxruntime-web.
// Geprüft gegen die Vorlage (sherpa-onnx): gleiche Wortfolge, gleiche Zeitmarken – siehe werkzeug/sprache_pruefen.py.

export const RATE = 16000;
const FENSTER = 400, SCHRITT = 160, NFFT = 512, NMEL = 80, TIEF = 20, HOCH = RATE / 2 - 400, VOR = 0.97, EPS = 1.1920928955078125e-7;
export const BILDZEIT = 0.04;            // ein Schritt des Modells = 40 ms

let _f = null;
function tafeln() {
  if (_f) return _f;
  const fenster = new Float32Array(FENSTER);
  for (let i = 0; i < FENSTER; i++) fenster[i] = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FENSTER - 1)), 0.85);   // „Povey“-Fenster
  const mel = (f) => 1127 * Math.log(1 + f / 700), halb = NFFT / 2, breite = RATE / NFFT;
  const m0 = mel(TIEF), m1 = mel(HOCH), d = (m1 - m0) / (NMEL + 1), baender = [];
  for (let b = 0; b < NMEL; b++) {
    const li = m0 + b * d, mi = li + d, re = mi + d; let von = -1; const w = [];
    for (let i = 0; i < halb; i++) {
      const m = mel(breite * i);
      if (m > li && m < re) { if (von < 0) von = i; w.push(m <= mi ? (m - li) / (mi - li) : (re - m) / (re - mi)); }
    }
    baender.push({ von: Math.max(0, von), w: Float32Array.from(w) });
  }
  const cos = new Float64Array(NFFT / 2), sin = new Float64Array(NFFT / 2), dreh = new Uint16Array(NFFT), bits = Math.log2(NFFT);
  for (let i = 0; i < NFFT / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / NFFT); sin[i] = Math.sin((2 * Math.PI * i) / NFFT); }
  for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); dreh[i] = r; }
  return (_f = { fenster, baender, cos, sin, dreh });
}

/** Tonsignal (16 kHz, −1…1) → Merkmale: n Zeilen mit je 80 Werten. */
export function fbank(x) {
  const { fenster, baender, cos, sin, dreh } = tafeln(), N = x.length, n = Math.floor((N + SCHRITT / 2) / SCHRITT);
  const daten = new Float32Array(n * NMEL), bild = new Float64Array(FENSTER), re = new Float64Array(NFFT), im = new Float64Array(NFFT), kraft = new Float64Array(NFFT / 2);
  for (let f = 0; f < n; f++) {
    const start = f * SCHRITT + SCHRITT / 2 - FENSTER / 2; let summe = 0;
    for (let i = 0; i < FENSTER; i++) {
      let s = start + i;
      while (s < 0 || s >= N) s = s < 0 ? -s - 1 : 2 * N - 1 - s;       // an den Rändern spiegeln
      bild[i] = x[s]; summe += bild[i];
    }
    const mittel = summe / FENSTER;
    for (let i = 0; i < FENSTER; i++) bild[i] -= mittel;
    for (let i = FENSTER - 1; i > 0; i--) bild[i] -= VOR * bild[i - 1];
    bild[0] -= VOR * bild[0];
    for (let i = 0; i < NFFT; i++) { const q = dreh[i]; re[q] = i < FENSTER ? bild[i] * fenster[i] : 0; im[q] = 0; }
    for (let gr = 2; gr <= NFFT; gr <<= 1) {
      const h = gr >> 1, schritt = NFFT / gr;
      for (let a = 0; a < NFFT; a += gr) for (let k = 0; k < h; k++) {
        const c = cos[k * schritt], s = -sin[k * schritt], i0 = a + k, i1 = i0 + h, tr = re[i1] * c - im[i1] * s, ti = re[i1] * s + im[i1] * c;
        re[i1] = re[i0] - tr; im[i1] = im[i0] - ti; re[i0] += tr; im[i0] += ti;
      }
    }
    for (let i = 0; i < NFFT / 2; i++) kraft[i] = re[i] * re[i] + im[i] * im[i];
    for (let b = 0; b < NMEL; b++) {
      const { von, w } = baender[b]; let e = 0;
      for (let i = 0; i < w.length; i++) e += w[i] * kraft[von + i];
      daten[f * NMEL + b] = Math.log(Math.max(e, EPS));
    }
  }
  return { daten, n };
}

/**
 * Sprache → Zeichenfolge mit Zeitmarken.
 * @param ort      onnxruntime (Tensor)
 * @param S        { enc, dec, join } – geladene Sitzungen
 * @param K        Beschreibung des Modells (modell.json): { T, schritt, kontext, leer, unk, zustaende: [{ n, d, t }], zeichen: [...] }
 * @param ton      Float32Array, 16 kHz, ein Kanal
 * @param melde    (Anteil 0…1) => void
 * @returns        [{ id, t }] – Zeichen-Nummer und Zeit in Sekunden
 */
export async function erkenne(ort, S, K, ton, melde, abbruch) {
  const lang = new Float32Array(ton.length + Math.round(RATE * 2.5)); lang.set(ton);      // Nachlauf, damit das letzte Wort ganz gelesen wird
  const { daten, n } = fbank(lang), zust = {};
  for (const z of K.zustaende) { const menge = z.d.reduce((a, b) => a * b, 1); zust[z.n] = new ort.Tensor(z.t, z.t === 'int64' ? new BigInt64Array(menge) : new Float32Array(menge), z.d); }
  const dekodiere = async (k) => (await S.dec.run({ y: new ort.Tensor('int64', BigInt64Array.from(k.map((v) => BigInt(v))), [1, k.length]) })).decoder_out;
  let kontext = new Array(K.kontext).fill(-1); kontext[kontext.length - 1] = K.leer;
  let dek = await dekodiere(kontext), bild = 0; const marken = [];
  for (let start = 0; start + K.T <= n; start += K.schritt) {
    if (abbruch && abbruch()) throw new Error('abgebrochen');
    const aus = await S.enc.run({ x: new ort.Tensor('float32', daten.slice(start * NMEL, (start + K.T) * NMEL), [1, K.T, NMEL]), ...zust });
    for (const z of K.zustaende) zust[z.n] = aus['new_' + z.n];
    const e = aus.encoder_out, anzahl = e.dims[1], breite = e.dims[2], werte = e.data;
    let t = 0;
    while (t < anzahl) {
      // alle restlichen Bilder dieses Abschnitts auf einmal fragen; beim ersten Zeichen den Zusammenhang erneuern und von dort weiter
      const rest = anzahl - t, kopie = new Float32Array(rest * breite), d = dek.data;
      for (let i = 0; i < rest; i++) kopie.set(d, i * breite);
      const lg = (await S.join.run({ encoder_out: new ort.Tensor('float32', werte.slice(t * breite, anzahl * breite), [rest, breite]), decoder_out: new ort.Tensor('float32', kopie, [rest, breite]) })).logit;
      const V = lg.dims[1], L = lg.data; let fund = -1, zeichen = 0;
      for (let i = 0; i < rest && fund < 0; i++) {
        let y = 0, m = -Infinity; const o = i * V;
        for (let v = 0; v < V; v++) if (L[o + v] > m) { m = L[o + v]; y = v; }
        if (y !== K.leer && y !== K.unk) { fund = i; zeichen = y; }
      }
      if (fund < 0) break;
      marken.push({ id: zeichen, t: (bild + t + fund) * BILDZEIT }); kontext = kontext.slice(1).concat(zeichen); dek = await dekodiere(kontext); t += fund + 1;
    }
    bild += anzahl; if (melde) melde(Math.min(1, (start + K.schritt) / n));
  }
  return marken;
}

/**
 * Zeichen → Wörter mit Zeiten. Das Modell meldet ein Zeichen im Mittel 0,15 s nach dem Sprechen – `vorlauf` gleicht das aus.
 * Satzzeichen kommen oft erst in der Pause danach; sie hängen am Wort, verlängern es aber nicht.
 */
const SATZZEICHEN = /^[.,!?;:…]+$/;
export function woerter(marken, zeichen, vorlauf = 0.15) {
  const w = [];
  for (const m of marken) {
    const roh = zeichen[m.id] || '', neu = roh.startsWith('▁'), s = neu ? roh.slice(1) : roh, t = Math.max(0, m.t - vorlauf);
    if (neu && !SATZZEICHEN.test(s)) w.push({ a: t, b: t + 0.1, w: s });
    else if (w.length) { w[w.length - 1].w += s; if (!SATZZEICHEN.test(s)) w[w.length - 1].b = t + 0.1; }
    else if (!SATZZEICHEN.test(s)) w.push({ a: t, b: t + 0.1, w: s });
  }
  const aus = w.filter((x) => x.w.trim());
  for (let i = 0; i < aus.length; i++) {
    aus[i].b = Math.max(aus[i].b, aus[i].a + 0.12);
    if (i + 1 < aus.length && aus[i + 1].a > aus[i].a) aus[i].b = Math.min(aus[i].b, aus[i + 1].a);
  }
  return aus;
}

/**
 * Wörter → Untertitel-Zeilen. Ein Satz (oder ein Stück bis zur nächsten Sprechpause) wird in gleich lange Zeilen geteilt,
 * möglichst an einem Komma – so bleibt nie ein einzelnes Wort übrig.
 * @returns [{ a, b, text }] – Zeiten in Sekunden der Tonquelle
 */
export function zeilen(w, { breit = 42, pause = 0.7 } = {}) {
  const gruppen = []; let g = [];
  for (let i = 0; i < w.length; i++) {
    if (g.length && w[i].a - g[g.length - 1].b > pause) { gruppen.push(g); g = []; }
    g.push(w[i]);
    if (/[.!?…]$/.test(w[i].w)) { gruppen.push(g); g = []; }
  }
  if (g.length) gruppen.push(g);
  const aus = [];
  for (const gr of gruppen) {
    const laenge = gr.reduce((n, x) => n + x.w.length + 1, -1), teile = Math.max(1, Math.ceil(laenge / breit)), soll = laenge / teile;
    let z = null, rest = teile;
    for (let i = 0; i < gr.length; i++) {
      const x = gr[i];
      if (z && rest > 1) {
        const mit = z.text.length + 1 + x.w.length, komma = /,$/.test(z.text);
        if (mit > soll * 1.15 || (komma && z.text.length >= soll * 0.7) || mit > breit) { aus.push(z); z = null; rest--; }
      }
      if (!z) z = { a: x.a, b: x.b, text: x.w }; else { z.text += ' ' + x.w; z.b = x.b; }
    }
    if (z) aus.push(z);
  }
  for (let i = 0; i < aus.length; i++) {            // Zeilen etwas stehen lassen, aber nie in die nächste hinein
    const naechste = i + 1 < aus.length ? aus[i + 1].a : Infinity, lang = Math.max(aus[i].b + 0.35, aus[i].a + 1.0);
    aus[i].b = Math.max(aus[i].a + 0.2, Math.min(lang, naechste - 0.02));
    aus[i].a = Math.round(aus[i].a * 100) / 100; aus[i].b = Math.round(aus[i].b * 100) / 100;
  }
  return aus;
}
