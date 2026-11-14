// TW Schnittraum – „Gerät prüfen“: zeigt in klaren Sätzen, was dieses Gerät kann (Ausgabe, Handyvideos in hoher Effizienz, Speichern,
// Spracherkennung – in der Firmen-Fassung auch die KI). Alles läuft im Gerät mit kleinen, selbst erzeugten Probedateien – keine Daten von Thomas.
import { Input, Output, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget, CanvasSource, CanvasSink, Quality, getFirstEncodableVideoCodec, canEncodeAudio } from '../lib/mediabunny.min.mjs';
import { h } from './bausteine.js';
const FREI = !!globalThis.TW_FREI;   // kostenlose öffentliche Fassung (frei-config.js): ohne KI, ohne Google, ohne Firmenlogo im Film

const $ = (id) => document.getElementById(id), E = {};           // E = Ergebnisse (auch für Prüfungen von außen)
const zeit = (ms, was) => new Promise((ok, nein) => { const z = setTimeout(() => nein(new Error('Zeit abgelaufen')), ms); was.then((v) => { clearTimeout(z); ok(v); }, (e) => { clearTimeout(z); nein(e); }); });

function zeile(id, titel) {
  let li = document.querySelector(`#gListe li[data-id="${id}"]`);
  if (!li) { li = h('li', { 'data-id': id }, h('span', { class: 'z' }, '…'), h('div', {}, h('b', {}, titel), h('small', {}, 'wird geprüft …'))); $('gListe').append(li); }
  return li;
}
function setz(id, titel, stand, text, wert, zusatz) {
  const li = zeile(id, titel);
  li.className = stand; li.querySelector('.z').textContent = stand === 'gut' ? '✓' : stand === 'nein' ? '✕' : stand === 'halb' ? '!' : '…';
  li.querySelector('b').textContent = titel; li.querySelector('small').textContent = text;
  for (const alt of li.querySelectorAll('.zusatz')) alt.remove();
  if (zusatz) { zusatz.classList.add('zusatz'); li.querySelector('div').append(zusatz); }
  E[id] = { stand, text, ...(wert || {}) };
}

// Durchschnittsfarbe eines Feldes der Malfläche
function farbe(ctx, x, y, w, hh) { const d = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(hh))).data; let r = 0, g = 0, b = 0; const n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [r / n, g / n, b / n]; }

/** Wozu gehört die Farbe eines Probefelds? Bewusst weit gefasst: Rechnet ein Gerät HDR richtig auf normales Video um, wird die helle Fläche mittelgrau
 *  und die Farben werden dunkler (gemessen auf Thomas’ PC am 13.11.2026 und mit ffmpeg nachgerechnet). Auffallen soll nur ein wirklich falsches Bild. */
function farbArt(f) {
  const [r, g, b] = f, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (r === mx && r - Math.max(g, b) > 30) return 'rot';
  if (g === mx && g - Math.max(r, b) > 15) return 'gruen';
  if (b === mx && b - r > 30) return 'blau';
  if (mx - mn < 40 && mx > 95) return 'hell';
  return '?';
}

async function pruefeAusgabe() {
  const T1 = 'Video ausgeben (H.264)';
  zeile('ausgabe', T1);
  try {
    const hd = await getFirstEncodableVideoCodec(['avc'], { width: 1920, height: 1080 }), uhd = await getFirstEncodableVideoCodec(['avc'], { width: 3840, height: 2160 }).catch(() => null);
    if (!hd) { setz('ausgabe', T1, 'nein', 'Dieser Browser kann hier kein Video speichern. Bitte Chrome oder Edge verwenden.'); return; }
    // Tempo: 45 Bilder Full HD hochkant rechnen
    const W = 1080, H = 1920, n = 45, c = new OffscreenCanvas(W, H), x = c.getContext('2d', { alpha: false }), ziel = new BufferTarget();
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: ziel }), q = new CanvasSource(c, { codec: 'avc', quality: new Quality({ bitrate: 12e6 }), keyFrameInterval: 2 });
    out.addVideoTrack(q, { frameRate: 30 }); await out.start();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, `hsl(${i * 8},60%,45%)`); g.addColorStop(1, '#0f1923'); x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.fillRect((i * 37) % W, (i * 53) % H, 220, 220); await q.add(i / 30, 1 / 30); }
    await out.finalize();
    const fps = n / ((performance.now() - t0) / 1000), jeMinute = 60 * 30 / fps;
    setz('ausgabe', T1, fps >= 12 ? 'gut' : 'halb', `Ja${uhd ? ', bis 4K' : ', bis Full HD'}. Rechentempo etwa ${Math.round(fps)} Bilder je Sekunde – ein Film von einer Minute (Full HD) braucht rund ${jeMinute < 90 ? Math.max(5, Math.round(jeMinute / 5) * 5) + ' Sekunden' : Math.round(jeMinute / 60) + ' Minuten'}.`, { fps: Math.round(fps * 10) / 10, vierK: !!uhd, bytes: ziel.buffer.byteLength });
  } catch (e) { setz('ausgabe', T1, 'nein', 'Die Probe-Ausgabe hat nicht geklappt: ' + (e && e.message ? e.message : e)); }
  const T2 = 'Ton speichern (AAC)';
  try { const nativ = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 }); setz('ton', T2, 'gut', nativ ? 'Ja, der Browser kann es selbst.' : 'Ja – über den mitgelieferten Baustein (etwas langsamer, gleiches Ergebnis).', { nativ }); }
  catch (e) { setz('ton', T2, 'halb', 'Nicht eindeutig feststellbar – der mitgelieferte Baustein springt ein.'); }
}

async function pruefeHevc() {
  const T = 'Handyvideos „hohe Effizienz“ (HEVC, 10 Bit, HDR)';
  zeile('hevc', T);
  const rat = 'Abhilfe: am PC Chrome oder Edge mit aktuellem Grafiktreiber nehmen – oder in der Kamera des Handys die platzsparende Aufnahme („hohe Effizienz“ / HEVC) und HDR-Video ausschalten. Dann nimmt das Handy im Format H.264 auf, das überall läuft.';
  try {
    const blob = await (await fetch('hilfe/probe/hevc10-hlg.mp4')).blob(), input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    let lesbar = false, bild = null, w = 0, hh = 0, codec = '';
    try {
      const v = await input.getPrimaryVideoTrack(); codec = v.codec; w = await v.getDisplayWidth(); hh = await v.getDisplayHeight(); lesbar = await v.canDecode();
      if (lesbar) { const senke = new CanvasSink(v, { width: 270, height: 480, fit: 'fill' }); const r = await zeit(8000, senke.getCanvas(0.4)); bild = r && r.canvas; }
    } finally { input.dispose(); }
    // zweiter Weg: das Video-Element (so läuft die Vorschau)
    const url = URL.createObjectURL(blob), el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = url;
    const spielt = await zeit(8000, new Promise((ok) => { el.addEventListener('loadeddata', () => ok(el.videoWidth > 0), { once: true }); el.addEventListener('error', () => ok(false), { once: true }); })).catch(() => false);
    let farbenGut = false, mitte = null;
    if (bild) {
      const k = h('canvas', { id: 'probeBild', width: bild.width, height: bild.height }), x = k.getContext('2d', { willReadFrequently: true }); x.drawImage(bild, 0, 0);
      const W = k.width, H = k.height, feld = [farbe(x, W * 0.1, H * 0.1, W * 0.25, H * 0.25), farbe(x, W * 0.65, H * 0.1, W * 0.25, H * 0.25), farbe(x, W * 0.1, H * 0.65, W * 0.25, H * 0.25), farbe(x, W * 0.65, H * 0.65, W * 0.25, H * 0.25)];
      const arten = feld.map(farbArt); farbenGut = ['rot', 'gruen', 'blau', 'hell'].every((a) => arten.includes(a)); mitte = feld.map((f) => f.map(Math.round));
      E._hevcBild = k;
    }
    URL.revokeObjectURL(url);
    const wert = { lesbar, spielt, farbenGut, codec, w, h: hh, felder: mitte };
    if (lesbar && bild && spielt && farbenGut) setz('hevc', T, 'gut', 'Ja – dieses Gerät liest die platzsparenden HDR-Videos deines Handys, in der Vorschau und bei der Ausgabe. Die Farben werden auf normales Video umgerechnet; wirkt ein Video dadurch etwas dunkler als am Handy, hilft der Regler „Helligkeit“ (Farbe).', wert, E._hevcBild);
    else if (lesbar && bild && spielt) setz('hevc', T, 'halb', 'Die Videos lassen sich lesen, aber die Farben der Probe weichen ab (HDR-Umrechnung). Bitte ein eigenes Video ansehen; wirkt es flau, zu dunkel oder zu hell, am Handy HDR-Video ausschalten.', wert, E._hevcBild);
    else if (lesbar || spielt) setz('hevc', T, 'halb', 'Nur zum Teil: ' + (spielt ? 'Die Vorschau läuft, aber die Ausgabe kann das Format nicht lesen. ' : 'Die Ausgabe kann das Format lesen, aber die Vorschau spielt es nicht ab. ') + rat, wert);
    else setz('hevc', T, 'nein', 'Nein – dieser Browser kann das Format auf diesem Gerät nicht lesen. ' + rat, wert);
  } catch (e) { setz('hevc', T, 'nein', 'Die Probe konnte nicht gelesen werden: ' + (e && e.message ? e.message : e) + ' ' + rat, { lesbar: false }); }
}

async function pruefeUmgebung() {
  const merken = !!window.showOpenFilePicker;
  setz('merken', 'Videos über einen Neustart merken', merken ? 'gut' : 'halb', merken ? 'Ja – nach einem Neustart genügt ein Tipp auf „Dateien wieder verbinden“.' : 'Nein – nach einem Neustart holst du dieselben Videos einfach noch einmal; sie werden von selbst wieder zugeordnet.', { merken });
  const dialog = !!window.showSaveFilePicker, lager = !!(navigator.storage && navigator.storage.getDirectory);
  let teilen = false; try { teilen = !!navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(8)], 'probe.mp4', { type: 'video/mp4' })] }); } catch (e) { /* kein Teilen */ }
  setz('speichern', 'Fertiges Video speichern und teilen', 'gut', (dialog ? 'Du wählst selbst, wohin das Video gespeichert wird.' : 'Das Video landet im Ordner „Downloads“' + (lager ? ' (auch lange Filme, ohne den Arbeitsspeicher zu füllen).' : '.')) + (teilen ? ' „Teilen“ direkt an YouTube, Instagram, Facebook oder Drive ist möglich.' : ' „Teilen“ aus der App heraus gibt es auf diesem Gerät nicht.'), { dialog, lager, teilen });
  const filter = typeof document.createElement('canvas').getContext('2d').filter === 'string';
  setz('farbe', 'Farbregler und Unschärfe', 'gut', filter ? 'Ja, direkt.' : 'Ja – über den eingebauten Ersatzweg.', { filter });
  try { const { effekteBereit } = await import('./effekte-gl.js'), fx = effekteBereit(); setz('effekte', 'Bildeffekte der Palette', fx ? 'gut' : 'halb', fx ? 'Ja – alle Effekte der Palette.' : 'Zum Teil – Rahmen, Bewegung, Licht und Wetter gehen; rechnende Bildeffekte wie Comic oder Mosaik kann dieses Gerät nicht darstellen.', { art: fx }); } catch (e) { /* nicht entscheidend */ }
  try { const s = await navigator.storage.estimate(), frei = (s.quota - s.usage) / 1e6; setz('platz', 'Platz im Gerät für die App', frei > 400 ? 'gut' : 'halb', frei > 400 ? `Genug (rund ${frei > 2000 ? Math.round(frei / 1000) + ' GB' : Math.round(frei) + ' MB'} frei für Sprachmodell und Zwischenablage).` : `Knapp (rund ${Math.round(frei)} MB) – für die Spracherkennung werden etwa 90 MB gebraucht.`, { freiMB: Math.round(frei) }); } catch (e) { /* nicht überall */ }
}

async function pruefeSprache() {
  const T = 'Spracherkennung im Gerät (automatische Untertitel)', SOLL = 'Danach kommt die Abdichtung in zwei Schichten mit Dichtband in allen Ecken.';
  zeile('sprache', T); setz('sprache', T, '', 'Sprachmodell wird geladen (beim ersten Mal rund 85 MB) …');
  try {
    const { sprache, tonStueck } = await import('./sprache.js');
    await sprache.lade((a) => { zeile('sprache', T).querySelector('small').textContent = `Sprachmodell wird geladen … ${Math.round(a * 100)} %`; });
    const blob = await (await fetch('hilfe/probe/sprache-probe.wav')).blob(), m = { art: 'ton', name: 'Probe', datei: new File([blob], 'probe.wav', { type: 'audio/wav' }), dauer: 3.97 };
    const r = await sprache.lies(await tonStueck(m, 0, 3.97)), text = r.woerter.map((w) => w.w).join(' '), gleich = text === SOLL, tempo = r.tonzeit / r.rechenzeit;
    setz('sprache', T, gleich ? 'gut' : 'halb', (gleich ? 'Ja – der Probesatz wurde fehlerfrei erkannt' : 'Läuft, aber der Probesatz wurde anders gelesen („' + text + '“)') + `. Tempo: eine Minute Ton braucht etwa ${Math.max(1, Math.round(60 / tempo))} Sekunden.`, { text, gleich, tempo: Math.round(tempo * 10) / 10 });
  } catch (e) { setz('sprache', T, 'nein', (e && e.message ? e.message : String(e)) + ' Der Schnittraum arbeitet ohne Untertitel weiter.', { fehler: true }); }
}

async function starte() {
  document.documentElement.dataset.fertig = ''; $('gListe').replaceChildren(); for (const k of Object.keys(E)) delete E[k];
  $('gStand').textContent = 'Prüfung läuft …'; $('gStart').disabled = true;
  await pruefeAusgabe(); await pruefeHevc(); await pruefeUmgebung();
  const schlecht = Object.values(E).filter((x) => x && x.stand === 'nein').length, halb = Object.values(E).filter((x) => x && x.stand === 'halb').length;
  $('gStand').textContent = schlecht ? 'Fertig – bei den rot markierten Punkten gibt es eine Einschränkung, siehe Text.' : halb ? 'Fertig – alles Wichtige läuft; die gelben Punkte sind Hinweise.' : 'Fertig – dieses Gerät kann alles, was der Schnittraum braucht.';
  $('gGeraet').textContent = 'Gerät: ' + navigator.userAgent.replace(/Mozilla\/5\.0 /, '').slice(0, 160);
  $('gStart').disabled = false; document.documentElement.dataset.fertig = '1';
}

$('gStart').onclick = starte;
$('gSprache').onclick = async () => { $('gSprache').disabled = true; await pruefeSprache(); $('gSprache').disabled = false; document.documentElement.dataset.sprache = '1'; };
window.TWGeraet = { E, starte, pruefeSprache, farbArt };
starte();
