// TW Schnittraum – Nachvertonung: Sprecher über das Mikrofon aufnehmen, während das Video läuft.
// Aufgenommen wird als WAV (verlustfrei, lässt sich überall sauber schneiden).

export function wav(stuecke, rate) {
  let n = 0; for (const s of stuecke) n += s.length;
  const puffer = new ArrayBuffer(44 + n * 2), v = new DataView(puffer);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const s of stuecke) for (let i = 0; i < s.length; i++, o += 2) { const x = Math.max(-1, Math.min(1, s[i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([puffer], { type: 'audio/wav' });
}

// Startet die Aufnahme. beiPegel(0..1) für die Aussteuerungsanzeige. Rückgabe: { stopp(): Promise<{blob, dauer}> , abbruch() }
export async function starteAufnahme(beiPegel) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Dieser Browser erlaubt hier keine Mikrofon-Aufnahme.');
  let strom;
  try { strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
  catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Das Mikrofon ist für diese Seite gesperrt. Bitte oben in der Adresszeile auf das Schloss klicken und „Mikrofon“ erlauben.' : 'Es wurde kein Mikrofon gefunden. Bitte Mikrofon anschließen und noch einmal versuchen.'); }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  await ac.audioWorklet.addModule(new URL('./aufnahme-worklet.js', import.meta.url));
  const quelle = ac.createMediaStreamSource(strom), knoten = new AudioWorkletNode(ac, 'tw-aufnahme'), still = ac.createGain();
  still.gain.value = 0; quelle.connect(knoten); knoten.connect(still); still.connect(ac.destination);
  const stuecke = []; let laenge = 0;
  knoten.port.onmessage = (ev) => {
    const d = ev.data; stuecke.push(d); laenge += d.length;
    if (beiPegel) { let mx = 0; for (let i = 0; i < d.length; i += 4) { const a = Math.abs(d[i]); if (a > mx) mx = a; } beiPegel(mx); }
  };
  const zu = async () => { try { quelle.disconnect(); knoten.disconnect(); strom.getTracks().forEach(t => t.stop()); await ac.close(); } catch (e) { /* egal */ } };
  return {
    async stopp() { const rate = ac.sampleRate; await zu(); return { blob: wav(stuecke, rate), dauer: laenge / rate }; },
    abbruch: zu,
  };
}
