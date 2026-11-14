// TW Schnittraum – Ausgabe: rechnet den Schnitt Bild für Bild zu einer fertigen MP4-Datei (H.264 + AAC),
// komplett im Gerät. Das Bild kommt aus derselben Malfunktion wie die Vorschau, der Ton wird in Abschnitten gemischt.
import { Input, Output, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, AudioBufferSource,
  CanvasSink, AudioBufferSink, EncodedPacketSink, Quality, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec, canEncodeAudio } from '../lib/mediabunny.min.mjs';
import { tonLuecken, tonPuffer } from './tonlesen.js';
import { istAktiv, quellZeit, pegelSeg, pegelTon, tonDauer, klemm } from './modell.js';
import { zeichne } from './render.js';
import { bewZoomMax, rahmenInnen } from './effekte.js';

const RATE = 48000, FENSTER = 8; // Ton-Abtastrate, Länge eines Misch-Abschnitts in Sekunden

// Kurze Pause ohne Zeitgeber – läuft auch dann zügig weiter, wenn das Fenster im Hintergrund ist.
const luft = () => new Promise((ok) => { const k = new MessageChannel(); k.port1.onmessage = () => { k.port1.close(); ok(); }; k.port2.postMessage(0); });

export class Abbruch extends Error { constructor() { super('abgebrochen'); this.name = 'Abbruch'; } }

let aacGeprueft = false;

export const GUETEN = {
  hoch: { name: 'Hoch (empfohlen)', mbit: 12 },
  sehrhoch: { name: 'Sehr hoch (große Datei)', mbit: 20 },
  mittel: { name: 'Mittel (kleine Datei)', mbit: 6 },
};

// Geschätzte Dateigröße in MB für die Anzeige vor dem Start.
export const schaetzeMB = (dauer, breite, hoehe, guete, fps = 30) => dauer * (GUETEN[guete].mbit * (breite * hoehe) / (1920 * 1080) * (fps > 40 ? 1.4 : 1) + 0.19) / 8;

// a: { p, lay, medien (Map), logo, breite, hoehe, fps, guete, ziel (Dateiverweis oder null), fortschritt(n, N, text), abbruch: { an } }
export async function ausgeben(a) {
  const { p, lay, medien, breite: W, hoehe: H, fps } = a;
  if (!lay.dauer) throw new Error('Die Zeitleiste ist leer – erst ein Video hineinlegen.');
  const N = Math.max(1, Math.floor(lay.dauer * fps + 1e-6));
  const flaeche = new OffscreenCanvas(W, H), ctx = flaeche.getContext('2d', { alpha: false });
  const format = new Mp4OutputFormat({ fastStart: a.ziel ? false : 'in-memory' });
  let strom = null, ziel;
  if (a.ziel) { strom = await a.ziel.createWritable(); ziel = new StreamTarget(strom, { chunked: true }); } else ziel = new BufferTarget();
  const out = new Output({ format, target: ziel });
  const eingaben = new Map(); // Medium-ID → geöffnete Datei
  const laufend = new Map();  // Abschnitt → { it, bild }
  let fertig = false;

  const raeumAuf = async () => {
    for (const z of laufend.values()) { try { await z.it.return(); } catch (e) { /* egal */ } }
    for (const e of eingaben.values()) { try { e.input.dispose(); } catch (e2) { /* egal */ } }
  };

  try {
    const vCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs().filter(c => ['avc', 'hevc', 'vp9', 'av1'].includes(c)).sort((x, y) => (x === 'avc' ? -1 : 0) - (y === 'avc' ? -1 : 0)), { width: W, height: H });
    if (!vCodec) throw new Error('Dieser Browser kann hier kein Video speichern. Bitte Chrome oder Edge am PC verwenden.');
    const mbit = GUETEN[a.guete].mbit * (W * H) / (1920 * 1080) * (fps > 40 ? 1.4 : 1);
    const vQuelle = new CanvasSource(flaeche, { codec: vCodec, quality: new Quality({ bitrate: Math.round(mbit * 1e6) }), keyFrameInterval: 2 });
    out.addVideoTrack(vQuelle, { frameRate: fps });
    // Kann der Browser selbst keinen AAC-Ton speichern (z. B. Firefox, Linux), springt der mitgelieferte AAC-Baustein ein –
    // so hat jede Datei den Ton, den YouTube, Instagram und Facebook erwarten.
    if (!aacGeprueft) {
      aacGeprueft = true;
      try { if (!(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: RATE }))) { const m = await import('../lib/mediabunny-aac-encoder.min.mjs'); m.registerAacEncoder(); } }
      catch (e) { console.warn('AAC-Baustein nicht verfügbar', e); }
    }
    const aCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs().filter(c => ['aac', 'opus'].includes(c)).sort((x) => (x === 'aac' ? -1 : 1)), { numberOfChannels: 2, sampleRate: RATE });
    const aQuelle = aCodec ? new AudioBufferSource({ codec: aCodec, quality: new Quality({ bitrate: 192000 }) }) : null;
    if (aQuelle) out.addAudioTrack(aQuelle);
    await out.start();

    const oeffne = async (m) => {
      let e = eingaben.get(m.id);
      if (!e) {
        if (!m.datei) throw new Error(`Die Datei „${m.name}“ ist nicht verbunden. Bitte in der Mediathek „Dateien wieder verbinden“ antippen.`);
        const input = new Input({ source: new BlobSource(m.datei), formats: ALL_FORMATS });
        e = { input, v: null, a: null, basis: 0, aSenke: null, luecken: [] };
        eingaben.set(m.id, e);
        if (m.art === 'video') {
          e.v = await input.getPrimaryVideoTrack();
          if (!e.v || !(await e.v.canDecode())) throw new Error(`Das Video „${m.name}“ kann dieser Browser nicht verarbeiten (Format ${String(e.v && e.v.codec || 'unbekannt').toUpperCase()}).`);
          e.basis = await e.v.getFirstTimestamp();
        }
        e.a = await input.getPrimaryAudioTrack();
        if (e.a && (await e.a.canDecode())) {
          // Bild und Ton einer Datei teilen sich EINE Zeitachse (Nullpunkt = erstes Bild). Der Ton beginnt oft einen Hauch früher
          // (Vorlauf des Ton-Formats) – das darf nicht herausgerechnet werden, sonst hinkt der Ton dem Bild hinterher.
          if (!e.v) e.basis = Math.max(0, await e.a.getFirstTimestamp());
          e.aSenke = new AudioBufferSink(e.a);
          e.luecken = await tonLuecken({ EncodedPacketSink }, e.a);      // Sprünge in den Zeitstempeln der Tonspur – sonst läge der Ton danach zu früh
        } else e.a = null;
      }
      return e;
    };

    // Für jeden Video-Abschnitt: die Bilder genau zu den Zeiten holen, an denen die Ausgabe ein Bild braucht.
    const starte = async (s) => {
      const m = medien.get(s.c.medium), e = await oeffne(m);
      const c = s.c, quer = (c.dreh || 0) % 180 !== 0;
      const mw = m.w || await e.v.getDisplayWidth(), mh = m.h || await e.v.getDisplayHeight();
      const ew = quer ? mh : mw, eh = quer ? mw : mh;
      const R = rahmenInnen(c, W, H);       // mit Rahmen ist das Bild kleiner, mit Bewegung zeitweise größer
      const noetig = (c.passung === 'einpassen' ? Math.min(R.w / ew, R.h / eh) : Math.max(R.w / ew, R.h / eh)) * (c.zoom || 1) * (c.kb ? 1.1 : 1) * bewZoomMax(c, s, R.w, R.h);
      const k = Math.min(1, Math.max(0.1, noetig)); // nie größer dekodieren als gebraucht (spart Zeit bei 4K-Material)
      const bw = Math.max(2, Math.round(mw * k / 2) * 2), bh = Math.max(2, Math.round(mh * k / 2) * 2);
      const senke = new CanvasSink(e.v, { width: bw, height: bh, fit: 'fill', poolSize: 2 });
      const zeiten = [];
      for (let n = Math.max(0, Math.floor(s.t0 * fps) - 1), ende = Math.min(N, Math.ceil(s.t1 * fps) + 1); n < ende; n++) {
        if (istAktiv(s, n / fps)) zeiten.push(e.basis + klemm(quellZeit(s, n / fps), 0, Math.max(0, m.dauer - 0.001)));
      }
      const z = { it: senke.canvasesAtTimestamps(zeiten), bild: null, w: bw, h: bh };
      laufend.set(s, z);
      return z;
    };

    // Ton eines Abschnitts [w0, w1) mischen: Originalton der Clips + Musik + Sprecher, mit denselben Pegeln wie in der Vorschau.
    const mischeTon = async (w0, w1) => {
      const laenge = Math.max(1, Math.round((w1 - w0) * RATE));
      const oc = new OfflineAudioContext(2, laenge, RATE);
      const kurve = (fn) => { const n = Math.max(2, Math.ceil((w1 - w0) * 60)); const k = new Float32Array(n); for (let i = 0; i < n; i++) k[i] = Math.max(0, fn(w0 + (w1 - w0) * i / (n - 1))); return k; };
      // Ein Tonstück liegt auf der Zeitleiste von A bis B, beginnt in der Quelle bei qA und läuft mit „tempo“.
      const lege = async (e, A, B, qA, tempo, pegelFn) => {
        const von = Math.max(A, w0), bis = Math.min(B, w1);
        if (!e.aSenke || bis - von < 1e-4) return;
        const g = oc.createGain(); g.gain.setValueCurveAtTime(kurve(pegelFn), 0, laenge / RATE); g.connect(oc.destination);
        const qVon = qA + (von - A) * tempo, qBis = qA + (bis - A) * tempo;
        for await (const st of tonPuffer(e.aSenke, e.luecken, e.basis + qVon, e.basis + qBis)) {
          const sA = st.timestamp - e.basis, sB = sA + st.duration;
          const tA = Math.max(sA, qVon), tB = Math.min(sB, qBis);
          if (tB - tA < 1e-5) continue;
          const k = oc.createBufferSource(); k.buffer = st.buffer; k.playbackRate.value = tempo; k.connect(g);
          k.start(Math.max(0, (von - w0) + (tA - qVon) / tempo), tA - sA, tB - tA);
        }
      };
      for (const s of lay.segs) {
        if (s.c.art !== 'video' || s.c.stumm || s.t1 <= w0 || s.t0 >= w1) continue;
        const m = medien.get(s.c.medium); if (!m || !m.hatTon) continue;
        await lege(await oeffne(m), s.t0, s.t1, s.c.ein, s.c.tempo || 1, (t) => pegelSeg(p, lay, s, t));
      }
      for (const x of p.ton) {
        const B = x.start + tonDauer(x);
        if (B <= w0 || x.start >= w1) continue;
        const m = medien.get(x.medium); if (!m) continue;
        await lege(await oeffne(m), x.start, Math.min(B, lay.dauer), x.ein, 1, (t) => pegelTon(p, x, t));
      }
      return oc.startRendering();
    };

    const quelle = (s) => {
      if (s.c.art === 'bild') { const m = medien.get(s.c.medium); return m && m.bild ? { bild: m.bild, w: m.bild.width, h: m.bild.height } : null; }
      const z = laufend.get(s);
      return z && z.bild ? { bild: z.bild, w: z.w, h: z.h } : null;
    };

    const proFenster = Math.max(1, Math.round(FENSTER * fps));
    const beginn = performance.now();
    for (let n0 = 0; n0 < N; n0 += proFenster) {
      const n1 = Math.min(N, n0 + proFenster);
      if (aQuelle) await aQuelle.add(await mischeTon(n0 / fps, n1 / fps));
      for (let n = n0; n < n1; n++) {
        if (a.abbruch.an) throw new Abbruch();
        const t = n / fps;
        for (const s of lay.segs) {
          const an = istAktiv(s, t);
          if (s.c.art === 'video' && an) {
            const z = laufend.get(s) || await starte(s);
            const r = await z.it.next();
            if (!r.done && r.value) z.bild = r.value.canvas;
          } else if (!an && laufend.has(s)) { const z = laufend.get(s); laufend.delete(s); try { await z.it.return(); } catch (e) { /* egal */ } }
        }
        zeichne(ctx, W, H, t, p, lay, quelle, { logo: a.logo });
        await vQuelle.add(t, 1 / fps);
        if (a.fortschritt && (n % 3 === 0 || n === N - 1)) {
          const vergangen = (performance.now() - beginn) / 1000, rest = vergangen / (n + 1) * (N - n - 1);
          a.fortschritt(n + 1, N, rest);
          if (n % 15 === 0) await luft(); // dem Browser Luft lassen (Abbrechen-Knopf bleibt bedienbar)
        }
      }
    }
    await raeumAuf();
    await out.finalize();
    fertig = true;
    return { blob: a.ziel ? null : new Blob([ziel.buffer], { type: 'video/mp4' }), bildformat: vCodec, tonformat: aCodec, bilder: N, sekunden: (performance.now() - beginn) / 1000 };
  } catch (e) {
    if (!fertig) { await raeumAuf(); try { await out.cancel(); } catch (e2) { /* egal */ } if (strom) { try { await strom.abort(); } catch (e3) { /* egal */ } } }
    throw e;
  }
}
