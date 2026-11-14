// TW Schnittraum – Fenster „Gesichter finden“: sucht im gewählten Clip (oder in allen Clips des Films) nach Gesichtern und legt auf jedes
// eine „Stelle im Bild“, die mit dem Gesicht mitläuft – zum Weichzeichnen, Verpixeln, Abdecken, Glätten oder Aufhellen.
// Läuft nur auf Knopfdruck und ganz im Gerät: Es wird nichts hochgeladen, niemand wird erkannt oder gespeichert.
import { STELLEN_ARTEN, STELLEN_HOECHSTENS } from './effekte.js';
import { ladeGesichtsfinder, findeImClip, gesichterAnClip } from './gesicht.js';
import { medien } from './medien.js';
import { dauerVon, zeitText } from './modell.js';
import { h, chips, fenster } from './bausteine.js';

const ARTEN = ['unscharf', 'mosaik', 'balken', 'glatt', 'hell'];      // „Hervorheben“ und „Vergrößern“ lassen sich danach an der Stelle wählen
const TUN = { unscharf: 'weichgezeichnet', mosaik: 'verpixelt', balken: 'abgedeckt', glatt: 'geglättet', hell: 'aufgehellt' };
// Inhalt eines Fensterteils ersetzen – leere Einträge und Listen sind erlaubt (wie bei h)
const fuelle = (el, ...kinder) => el.replaceChildren(...kinder.flat(3).filter((k) => k != null && k !== false));

export function baueGesichter(K) {
  const Z = K.Z, merk = { art: 'unscharf', gruendlich: false, alle: false };

  /** Das Fenster öffnen – für den Clip c. */
  function zeig(c) {
    K.vor.halt();
    const abbruch = { an: false }; let offen = true;
    const f = fenster('Gesichter finden', { breite: 640, beiZu: () => { offen = false; abbruch.an = true; } });
    const stand = (s) => { f.kasten.dataset.gs = s; };
    const clipName = (k) => { const m = medien.get(k.medium); return m ? m.name : 'Clip'; };

    function start(hinweis) {
      stand('start'); abbruch.an = false;
      const hat = (c.stellen || []).some((e) => e.gesicht), mehrere = Z.p.clips.length > 1;
      fuelle(f.inhalt, 
        h('p', { style: { margin: '0 0 8px' } }, 'Die App sucht nach Gesichtern und legt auf jedes eine Stelle, die von selbst mitläuft. Das geschieht ganz in deinem Gerät: ',
          h('b', {}, 'Es wird nichts hochgeladen, und es wird niemand erkannt oder gespeichert.')),
        hinweis ? h('div', { class: 'notiz' + (hinweis.fehler ? ' rot' : ''), id: 'gsHinweis' }, hinweis.text) : null,
        h('label', { class: 'lbl' }, 'Was soll mit den Gesichtern geschehen?'),
        chips(ARTEN.map((a) => [a, STELLEN_ARTEN[a]]), merk.art, (v) => { merk.art = v; }),
        mehrere ? [h('label', { class: 'lbl' }, 'Wo suchen?'), chips([[false, 'In diesem Clip'], [true, `In allen ${Z.p.clips.length} Clips des Films`]], merk.alle, (v) => { merk.alle = v; })] : null,
        h('label', { class: 'lbl' }, 'Wie gründlich?'),
        chips([[false, 'Normal'], [true, 'Auch kleine Gesichter im Hintergrund', 'Sucht im größeren Bild – dauert etwa viermal so lange']], merk.gruendlich, (v) => { merk.gruendlich = v; }),
        hat ? h('p', { class: 'hinweis', style: { margin: '8px 0 0' } }, 'Dieser Clip hat schon Stellen für Gesichter – sie werden durch das neue Ergebnis ersetzt. Andere Stellen bleiben.') : null,
        h('p', { class: 'hinweis', style: { margin: '8px 0 0' } }, 'Beim ersten Mal lädt die App den Gesichtsfinder (einmalig, rund 15 MB) – danach geht es auch ohne Netz.'));
      fuelle(f.fuss, h('span', { class: 'platz' }), h('button', { class: 'btn', onclick: () => f.zu() }, 'Abbrechen'), h('button', { class: 'btn primaer', id: 'gsSuchen', onclick: suche }, 'Gesichter suchen'));
    }

    async function suche() {
      stand('laeuft'); abbruch.an = false;
      const text = h('b', { id: 'gsText' }, 'Der Gesichtsfinder wird geladen …'), balken = h('i', { id: 'gsBalken', style: { width: '0%' } });
      const zeigAnteil = (a) => { balken.style.width = Math.round(Math.min(1, Math.max(0, a)) * 100) + '%'; };
      fuelle(f.inhalt, h('div', { class: 'notiz blau' }, text, h('div', { class: 'balken' }, balken)),
        h('p', { class: 'hinweis' }, 'Du kannst zuschauen – das Fenster bleibt offen, bis die Suche fertig ist. Je länger der Clip, desto länger dauert es.'));
      fuelle(f.fuss, h('span', { class: 'platz' }), h('button', { class: 'btn', id: 'gsAbbrechen', onclick: () => { abbruch.an = true; text.textContent = 'Wird abgebrochen …'; } }, 'Abbrechen'));
      const clips = (merk.alle ? Z.p.clips : [c]).filter((k) => { const m = medien.get(k.medium); return m && !m.fehler && (k.art === 'video' ? m.datei : m.bild); });
      try {
        if (!clips.length) throw new Error('Die Datei dieses Clips ist nicht verbunden. Bitte in der Mediathek „Dateien wieder verbinden“ antippen.');
        await ladeGesichtsfinder((a) => { if (offen) { text.textContent = `Der Gesichtsfinder wird geladen … ${Math.round(a * 100)} %`; zeigAnteil(a); } });
        const gesamt = clips.reduce((n, k) => n + Math.max(0.5, dauerVon(k)), 0), funde = []; let getan = 0, bilder = 0;
        for (let i = 0; i < clips.length; i++) {
          const k = clips[i], d = Math.max(0.5, dauerVon(k));
          const r = await findeImClip(k, medien.get(k.medium), { gruendlich: merk.gruendlich }, (n, N) => {
            if (!offen) return;
            text.textContent = (clips.length > 1 ? `Clip ${i + 1} von ${clips.length} – ` : '') + (N > 1 ? `Bild ${n} von ${N}` : 'Das Bild wird abgesucht …'); zeigAnteil((getan + d * n / N) / gesamt);
          }, abbruch);
          if (r.abgebrochen || abbruch.an) { if (offen) start({ text: 'Die Suche wurde abgebrochen. Es wurde nichts verändert.' }); return; }
          getan += d; bilder += r.bilder;
          r.gesichter.forEach((g) => funde.push({ clip: k, g, an: true }));
        }
        if (offen) zeigErgebnis(clips, funde, bilder);
      } catch (e) {
        console.warn('Gesichter finden', e);
        if (offen) start({ fehler: true, text: 'Die Suche hat nicht geklappt: ' + (e && e.message ? e.message : e) + ' Es wurde nichts verändert.' });
      }
    }

    function zeigErgebnis(clips, funde, bilder) {
      stand('fertig');
      const zahl = h('b', { id: 'gsZahl' }), ueb = h('button', { class: 'btn primaer', id: 'gsUebernehmen', onclick: () => uebernimm(clips, funde) }, 'Übernehmen');
      const zeigZahl = () => { const n = funde.filter((x) => x.an).length; zahl.textContent = n === 1 ? '1 Gesicht wird ' + TUN[merk.art] : n + ' Gesichter werden ' + TUN[merk.art]; ueb.disabled = !n; };
      const kachel = (x, i) => {
        const von = x.clip.art === 'video' ? zeitText(Math.max(0, x.g.von - (x.clip.ein || 0)), false) + ' – ' + zeitText(Math.max(0, x.g.bis - (x.clip.ein || 0)), false) : 'Foto';
        const b = h('button', { type: 'button', class: 'gs-kachel an', 'data-nr': i, 'aria-pressed': 'true', title: 'Antippen: dieses Gesicht auslassen oder wieder dazunehmen',
          onclick: () => { x.an = !x.an; b.classList.toggle('an', x.an); b.setAttribute('aria-pressed', String(x.an)); zeigZahl(); } },
          x.g.bild || h('span', { class: 'gs-ohne' }, '☺'), h('span', {}, 'Gesicht ' + (i + 1)), h('small', {}, (clips.length > 1 ? clipName(x.clip) + ' · ' : '') + von));
        return b;
      };
      if (!funde.length) {
        fuelle(f.inhalt, h('div', { class: 'notiz', id: 'gsKeins' }, h('b', {}, 'Kein Gesicht gefunden. '), `Abgesucht: ${bilder} ${bilder === 1 ? 'Bild' : 'Bilder'}.`),
          h('p', { class: 'hinweis' }, 'Der Gesichtsfinder braucht ein Gesicht, das einigermaßen von vorn zu sehen ist. Sehr kleine Gesichter im Hintergrund findet er mit „Auch kleine Gesichter im Hintergrund“. ',
            'Was er nicht findet, deckst du von Hand ab: „Stelle im Bild bearbeiten“.'));
        fuelle(f.fuss, h('span', { class: 'platz' }), h('button', { class: 'btn', onclick: () => start() }, 'Noch einmal suchen'), h('button', { class: 'btn primaer', onclick: () => f.zu() }, 'Schließen'));
        return;
      }
      zeigZahl();
      fuelle(f.inhalt, 
        h('p', { style: { margin: '0 0 8px' } }, h('b', {}, funde.length === 1 ? '1 Gesicht gefunden. ' : funde.length + ' Gesichter gefunden. '), 'Antippen nimmt ein Gesicht aus – zum Beispiel dein eigenes.'),
        h('div', { class: 'gs-raster' }, funde.map(kachel)),
        h('p', { class: 'hinweis', style: { margin: '8px 0 0' } }, 'Bitte danach einmal ansehen: Dreht sich jemand weg oder wird verdeckt, kann der Gesichtsfinder ihn kurz verlieren. ',
          'Größe und Stärke stellst du danach unter „Stellen im Bild“ ein.'));
      fuelle(f.fuss, zahl, h('span', { class: 'platz' }), h('button', { class: 'btn', onclick: () => start() }, 'Noch einmal suchen'), ueb);
    }

    function uebernimm(clips, funde) {
      let stellen = 0, uebrig = 0, gesichter = 0;
      K.aendere(() => {
        for (const k of clips) {
          const wahl = funde.filter((x) => x.clip === k && x.an); gesichter += wahl.length;
          if (!wahl.length && !(k.stellen || []).some((e) => e.gesicht)) continue;
          const r = gesichterAnClip(k, wahl.map((x) => x.g.lauf), merk.art); stellen += r.stellen; uebrig += r.uebrig;
        }
      });
      Z.fx.wahl = null; f.zu(); K.tafelNeu(); K.vor.neu();
      const n = gesichter - uebrig;
      K.sag((n === 1 ? '1 Gesicht wird ' : n + ' Gesichter werden ') + TUN[merk.art] + ' – die Stellen laufen mit.'
        + (uebrig ? ` Für ${uebrig} weitere war kein Platz mehr (höchstens ${STELLEN_HOECHSTENS} Stellen je Clip, die zugleich im Bild sind).` : ''), !!uebrig && !n);
    }

    start();
  }
  /**
   * Alle Gesichter eines fertigen Films unkenntlich machen (ohne Fenster – der Aufrufer zeigt den Fortschritt). p = Film, melde(text), abbruch = { an }.
   * → { gesichter, clips } (wie viele Gesichter in wie vielen Clips)
   */
  async function fuerFilm(p, melde = null, abbruch = null, art = 'unscharf') {
    let gesichter = 0, clips = 0; const liste = p.clips.filter((k) => { const m = medien.get(k.medium); return m && !m.fehler && (k.art === 'video' ? m.datei : m.bild); });
    if (!liste.length) return { gesichter, clips };
    if (melde) melde('Der Gesichtsfinder wird geladen …');
    await ladeGesichtsfinder();
    for (let i = 0; i < liste.length; i++) {
      if (abbruch && abbruch.an) break;
      if (melde) melde(`Gesichter suchen – Szene ${i + 1} von ${liste.length} …`);
      const r = await findeImClip(liste[i], medien.get(liste[i].medium), {}, null, abbruch);
      if (r.abgebrochen || !r.gesichter.length) continue;
      const a = gesichterAnClip(liste[i], r.gesichter.map((g) => g.lauf), art); gesichter += r.gesichter.length - a.uebrig; clips++;
    }
    return { gesichter, clips };
  }
  return { zeig, fuerFilm };
}
