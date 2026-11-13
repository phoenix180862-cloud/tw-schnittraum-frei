// TW Schnittraum – Fenster zu den Quellen: Ordner, Handy, Google Fotos, Google Drive, Galerie und Kamera des Handys.
// Die Arbeit dahinter steht in quellen.js; hier ist nur die Oberfläche. Grundsatz „Antippen statt Tippen“.
import { h, chips, haken, fenster, frage, meldung } from './bausteine.js';
import { zeitText } from './modell.js';
import { ausGeraet, waehle as waehleDateien } from './medien.js';
import * as Q from './quellen.js';

const FREI = !!globalThis.TW_FREI;   // kostenlose öffentliche Fassung (frei-config.js): ohne KI, ohne Google, ohne Firmenlogo im Film
const SYMBOL = { video: '▶', bild: '▧', ton: '♪' };
const ART_FILTER = [['alle', 'Alles'], ['video', 'Videos'], ['bild', 'Fotos'], ['ton', 'Ton']];
const MEHR = 300;   // so viele Zeilen auf einmal; der Rest kommt mit „Weitere zeigen“

export function baueQuellen(K) {
  const leer = () => !K.Z.lay.dauer;   // ist der Film noch leer, kommt das Geholte gleich hinein (wie bei „Videos holen“)
  const fehlerText = (e) => (e && e.message ? e.message : String(e));

  // ───────── Leiste in der Tafel „Medien“ ─────────
  // start = true: dieselben Knöpfe noch einmal groß auf dem leeren Startbild (eigene Kennungen mit „s“ statt „q“).
  function leiste(start = false) {
    const kn = (id, text, titel, fn) => h('button', { type: 'button', class: 'chip', id: start ? 's' + id.slice(1) : id, title: titel, onclick: fn }, text);
    const l = h('div', { class: 'q-leiste' + (start ? ' q-start' : ''), id: start ? 'sLeiste' : 'qLeiste' }, h('span', { class: 'q-frage' }, start ? 'oder direkt aus:' : 'Woher?'));
    if (Q.MOBIL) l.append(
      kn('qGalerie', 'Galerie', 'Alle Fotos und Videos des Geräts – Kamera, Screenshots, WhatsApp, Downloads', () => galerie()),
      kn('qDateien', 'Eigene Dateien · SD-Karte', 'Interner Speicher, SD-Karte, USB-Stick, OneDrive, Google Drive, Netzwerk – alles, was die Datei-Auswahl des Geräts kennt', () => dateien()),
      kn('qKamera', 'Aufnehmen', 'Jetzt mit der Kamera ein Video aufnehmen', () => kamera()));
    if (Q.kann.ordner) l.append(kn('qOrdner', 'Ordner', 'Einen Ordner als Quelle verbinden – die App zeigt darin immer die neuesten Videos', () => zeigOrdner()));
    if (!Q.MOBIL) l.append(kn('qHandy', 'Handy · Tablet', 'Videos vom Handy oder Tablet holen – ohne Kabel über „Smartphone-Link“ oder mit Kabel', zeigHandy));
    return l;
  }

  // inFilm: gleich in den Film legen (sonst nur, solange der Film noch leer ist)
  async function galerie(inFilm) { const l = await ausGeraet(); if (l.length) await K.nimmUndMelde(l, inFilm || leer()); }
  async function dateien(inFilm) { const l = await ausGeraet({ art: 'dateien' }); if (l.length) await K.nimmUndMelde(l, inFilm || leer()); }
  async function kamera(inFilm) { const l = await ausGeraet({ kamera: true }); if (l.length) await K.nimmUndMelde(l, inFilm || leer()); }
  async function ton() { const l = await ausGeraet({ art: 'ton' }); if (l.length) await K.nimmUndMelde(l, true); }

  // ───────── Handy und Tablet: „Woher sollen die Videos kommen?“ ─────────
  // Der große Knopf „Videos holen“ fragt hier zuerst, aus welchem Speicher – zum Antippen, mit Klartext, was dahinter liegt.
  function zeigWoher(inFilm = false) {
    const f = fenster('Woher sollen die Videos kommen?', { breite: 560 });
    f.kasten.id = 'qFensterWoher';
    const weg = (id, titel, text, fn) => h('button', { type: 'button', class: 'q-weg', id, onclick: () => { f.zu(); fn(); } }, h('b', {}, titel), h('span', {}, text));
    f.inhalt.append(
      weg('qwGalerie', 'Galerie', 'Alle Fotos und Videos auf diesem Gerät: Kamera, Screenshots, WhatsApp, Downloads.', () => galerie(inFilm)),
      weg('qwDateien', 'Eigene Dateien · SD-Karte · USB', 'Interner Speicher, Speicherkarte, USB-Stick, OneDrive, Google Drive, Netzwerk – alles, was die Datei-Auswahl des Geräts kennt.', () => dateien(inFilm)),
      weg('qwKamera', 'Aufnehmen', 'Jetzt ein Video mit der Kamera drehen.', () => kamera(inFilm)),
      weg('qwTon', 'Musik und Ton', 'Musikstücke und Sprachaufnahmen vom Gerät.', ton));
    if (Q.kann.ordner) f.inhalt.append(weg('qwOrdner', 'Ordner verbinden', 'Einen Ordner merken, zum Beispiel „DCIM › Camera“ oder einen Ordner auf der SD-Karte. Die App zeigt darin immer das Neueste.', () => zeigOrdner()));
    f.inhalt.append(h('p', { class: 'klein q-tipp' }, 'Noch kürzer: In der Galerie auf „Teilen“ tippen und „Schnittraum“ wählen – das geht, sobald der Schnittraum als App eingerichtet ist.'));
    f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
  }

  // ───────── gemeinsam: Zeilen mit Mehrfach-Auswahl ─────────
  // eintraege: [{ name, art, groesse, geaendert, dauer?, bild?, neu? }] · wahl: Set der gewählten Einträge
  function dateiListe(eintraege, wahl, beiWechsel) {
    const kasten = h('div', { class: 'q-liste' }); let gezeigt = 0, gruppe = null;
    const zeige = () => {
      const bis = Math.min(eintraege.length, gezeigt + MEHR);
      for (; gezeigt < bis; gezeigt++) {
        const e = eintraege[gezeigt], g = Q.tagGruppe(e.geaendert);
        if (g !== gruppe) { gruppe = g; kasten.append(h('div', { class: 'q-tag' }, g)); }
        const b = h('button', { type: 'button', class: 'q-datei' + (wahl.has(e) ? ' an' : ''), 'aria-pressed': String(wahl.has(e)), title: e.name,
          onclick: () => { const an = !wahl.has(e); if (an) wahl.add(e); else wahl.delete(e); b.classList.toggle('an', an); b.setAttribute('aria-pressed', String(an)); beiWechsel(); } },
          h('span', { class: 'q-box' }, '✓'),
          e.bild ? h('img', { class: 'q-bild', src: e.bild, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'q-sym' }, SYMBOL[e.art] || '▤'),
          h('span', { class: 'q-name' }, h('b', {}, e.name), h('small', {}, [Q.zeitpunktText(e.geaendert), e.dauer ? zeitText(e.dauer, false) : '', Q.groesseText(e.groesse)].filter(Boolean).join(' · '))),
          e.neu ? h('span', { class: 'q-neu' }, 'neu') : null);
        kasten.append(b);
      }
      mehr.hidden = gezeigt >= eintraege.length; mehr.textContent = `Weitere zeigen (${eintraege.length - gezeigt})`;
    };
    const mehr = h('button', { type: 'button', class: 'btn voll', onclick: () => { mehr.remove(); zeige(); kasten.append(mehr); } });
    zeige(); kasten.append(mehr);
    return kasten;
  }
  const ordnerZeile = (name, fn) => h('button', { type: 'button', class: 'q-datei q-ordner', onclick: fn, title: name }, h('span', { class: 'q-sym' }, '▸'), h('span', { class: 'q-name' }, h('b', {}, name)));
  const wahlKnopf = (wahl, text) => { const b = h('button', { class: 'btn primaer', id: 'qNimm', disabled: true }, text(0)); b.zeig = () => { b.disabled = wahl.size === 0; b.textContent = text(wahl.size); }; return b; };

  // ───────── Ordner ─────────
  async function zeigOrdner(gleich) {
    let zu = false, lauf = 0;
    const f = fenster('Ordner als Quelle', { breite: 760, beiZu: () => { zu = true; } });
    f.kasten.id = 'qFensterOrdner';

    async function liste() {
      lauf++;
      const l = await Q.ordnerListe(); if (zu) return;
      const aus = [h('p', { class: 'hinweis', style: { margin: '0 0 10px' } }, 'Ein verbundener Ordner bleibt als Quelle gemerkt: Die App zeigt dir darin die neuesten Videos, Fotos und Tondateien. Die Dateien selbst bleiben, wo sie sind.')];
      if (!Q.kann.ordner) aus.push(h('div', { class: 'notiz' }, 'Dieser Browser kann keine Ordner verbinden – das geht in Chrome und Edge. Nimm hier „Videos, Fotos, Musik holen“.'));
      for (const e of l) aus.push(h('div', { class: 'q-zeile' },
        h('span', { class: 'q-sym' }, e.art === 'handy' ? '▯' : '▤'),
        h('span', { class: 'q-name' }, h('b', {}, e.name), h('small', {}, e.art === 'handy' ? 'Handy' : 'Ordner')),
        h('button', { class: 'btn', onclick: () => oeffne(e, []) }, 'Öffnen'),
        h('button', { class: 'ib', title: 'Verbindung lösen (der Ordner selbst bleibt unberührt)', 'aria-label': 'Verbindung lösen', onclick: async () => { if (await frage('Verbindung lösen?', `„${e.name}“ ist dann keine Quelle mehr. Der Ordner und seine Dateien bleiben unberührt; was schon in der Mediathek liegt, bleibt dort.`, 'Lösen')) { await Q.ordnerTrennen(e.id); liste(); } } }, '✕')));
      if (Q.kann.ordner) aus.push(h('div', { class: 'zeile', style: { marginTop: '10px' } }, h('button', { class: 'btn' + (l.length ? '' : ' primaer'), id: 'qVerbinden', onclick: () => verbinde('ordner') }, '＋ Ordner verbinden …')));
      aus.push(h('details', { class: 'q-tipps' }, h('summary', {}, 'Welche Ordner lohnen sich?'),
        h('ul', {},
          h('li', {}, h('b', {}, 'Das Handy ohne Kabel: '), 'Ist dein Handy über „Smartphone-Link“ mit dem PC verbunden, zeigt Windows es im Datei-Explorer. Wähle dort „DCIM“ und dann „Camera“ – das ist der Ordner der Handy-Kamera. Einzelheiten unter „Handy“.'),
          h('li', {}, h('b', {}, 'Google Drive: '), 'Ist „Google Drive für den Desktop“ auf dem PC eingerichtet, gibt es ein Laufwerk „Google Drive“ – jeder Ordner darin lässt sich verbinden.'),
          h('li', {}, h('b', {}, 'Kamera-Karte, USB-Stick, Netzlaufwerk: '), 'einfach den Ordner mit den Aufnahmen wählen.'),
          h('li', {}, 'Die Ordner „Downloads“, „Dokumente“ und „Desktop“ selbst lässt der Browser aus Sicherheitsgründen nicht zu – einen Unterordner darin schon.'))));
      f.inhalt.replaceChildren(...aus); f.fuss.replaceChildren(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
    }

    async function verbinde(art) {
      let e; try { e = await Q.ordnerVerbinden(art); } catch (x) { if (x && x.name === 'AbortError') return; meldung('Der Ordner ließ sich nicht verbinden: ' + fehlerText(x), true); return; }
      oeffne(e, []);
    }

    // pfad: [{ name, handle }] – Unterordner unterhalb des verbundenen Ordners
    async function oeffne(e, pfad) {
      const meins = ++lauf, handle = pfad.length ? pfad[pfad.length - 1].handle : e.handle;
      const zurueck = h('button', { class: 'btn klein', onclick: () => (pfad.length ? oeffne(e, pfad.slice(0, -1)) : liste()) }, '← ' + (pfad.length ? 'Zurück' : 'Alle Ordner'));
      const stand = h('p', { class: 'hinweis' }, 'Der Ordner wird gelesen …');
      f.inhalt.replaceChildren(h('div', { class: 'q-kopf' }, zurueck, h('span', { class: 'q-pfad' }, [e.name, ...pfad.map((p) => p.name)].join(' › '))), stand);
      f.fuss.replaceChildren(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
      if (!(await Q.erlaubt(e.handle, true))) { if (meins === lauf && !zu) stand.replaceWith(h('div', { class: 'notiz rot' }, 'Der Browser hat den Zugriff auf diesen Ordner nicht erlaubt. Tippe noch einmal auf „Öffnen“ und erlaube das Lesen – oder verbinde den Ordner neu.')); return; }
      let r = null;
      try { r = await Q.ordnerInhalt(handle, (n, alle) => { if (meins === lauf) stand.textContent = `Der Ordner wird gelesen … ${n} von ${alle}`; }, () => zu || meins !== lauf); }
      catch (x) { if (meins === lauf && !zu) stand.replaceWith(h('div', { class: 'notiz rot' }, 'Der Ordner ließ sich nicht lesen. Ist das Gerät verbunden und eingeschaltet? (' + fehlerText(x) + ')')); return; }
      if (!r || zu || meins !== lauf) return;
      for (const d of r.dateien) d.neu = !!(e.gesehen && d.geaendert > e.gesehen);
      const wahl = new Set(); let filter = 'alle', inFilm = leer();
      const nimm = wahlKnopf(wahl, (n) => (n ? (n === 1 ? '1 Datei übernehmen' : n + ' Dateien übernehmen') : 'Übernehmen'));
      const feld = h('div', {});
      const male = () => {
        const gefiltert = r.dateien.filter((d) => filter === 'alle' || d.art === filter);
        const teile = [];
        if (r.ordner.length) teile.push(h('div', { class: 'q-liste' }, r.ordner.map((o) => ordnerZeile(o.name, () => oeffne(e, [...pfad, o])))));
        if (gefiltert.length) teile.push(dateiListe(gefiltert, wahl, nimm.zeig));
        else teile.push(h('p', { class: 'hinweis' }, r.dateien.length ? 'In diesem Ordner liegt davon nichts.' : r.ordner.length ? 'Hier liegen nur Unterordner – tippe einen an.' : 'In diesem Ordner liegen keine Videos, Fotos oder Tondateien.'));
        feld.replaceChildren(...teile);
      };
      const neue = r.dateien.filter((d) => d.neu).length;
      stand.replaceWith(
        r.dateien.length ? h('div', { class: 'q-kopf' }, chips(ART_FILTER, filter, (w) => { filter = w; male(); }), h('span', { class: 'hinweis' }, `${r.dateien.length} ${r.dateien.length === 1 ? 'Datei' : 'Dateien'}, neueste zuerst` + (neue ? ` · ${neue} neu seit dem letzten Mal` : ''))) : h('span', {}),
        feld);
      male();
      nimm.onclick = async () => {
        nimm.disabled = true; nimm.textContent = 'Wird übernommen …';
        const l = await Q.ausOrdner([...wahl]); await Q.ordnerMerke(e.id, { gesehen: Date.now() });
        f.zu(); await K.nimmUndMelde(l, inFilm);
      };
      f.fuss.replaceChildren(haken([['film', 'Gleich in den Film', inFilm]], (k, an) => { inFilm = an; }), h('span', { class: 'platz' }), h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'), nimm);
      if (!pfad.length) Q.ordnerMerke(e.id, { geoeffnet: Date.now() });
    }

    if (gleich === 'handy') { await liste(); verbinde('handy'); }
    else if (gleich && gleich.handle) oeffne(gleich, []);
    else liste();
  }

  // ───────── Handy (am PC) ─────────
  function zeigHandy() {
    const f = fenster('Videos vom Handy oder Tablet holen', { breite: 660 });
    f.kasten.id = 'qFensterHandy';
    f.inhalt.append(
      h('div', { class: 'q-teil' }, h('h4', {}, 'Ohne Kabel – das Handy als Ordner'),
        h('p', {}, 'Ist dein Handy über „Smartphone-Link“ (bei Samsung: „Link zu Windows“) mit dem PC verbunden, kann Windows es wie einen Ordner zeigen. Dann siehst du hier jederzeit die neuesten Aufnahmen – ohne etwas zu kopieren.'),
        h('ol', {},
          h('li', {}, 'Einmalig in Windows: ', h('b', {}, 'Einstellungen › Bluetooth und Geräte › Mobile Geräte › Geräte verwalten'), ' – beim Handy den Schalter „… im Datei-Explorer anzeigen“ einschalten.'),
          h('li', {}, 'Hier „Ordner des Handys verbinden“ antippen. Im Fenster links das Handy wählen, dann ', h('b', {}, '„DCIM“ › „Camera“'), ' öffnen und „Ordner auswählen“.')),
        Q.kann.ordner ? h('button', { class: 'btn primaer', id: 'qHandyOrdner', onclick: () => { f.zu(); zeigOrdner('handy'); } }, 'Ordner des Handys verbinden …') : h('div', { class: 'notiz' }, 'Dieser Browser kann keine Ordner verbinden – das geht in Chrome und Edge.')),
      h('div', { class: 'q-teil' }, h('h4', {}, 'Mit Kabel'),
        h('p', {}, 'Handy oder Tablet anstecken und dort „Dateien übertragen“ wählen. Dann die Videos im Fenster unter „Dieser PC“ beim Gerät auswählen (Ordner „DCIM“ › „Camera“; eine Speicherkarte erscheint dort als eigener Eintrag).'),
        h('button', { class: 'btn', id: 'qHandyKabel', onclick: async () => { f.zu(); await K.nimmUndMelde(await waehleDateien(false), leer()); } }, 'Dateien vom Handy auswählen …')));
    f.inhalt.append(h('div', { class: 'q-teil' }, h('h4', {}, 'Vom Handy herüberschicken (Samsung: Quick Share)'),
        h('p', {}, 'Am Handy oder Tablet das Video in der Galerie auf „Teilen“ › „Quick Share“ tippen und den PC wählen. Die Datei landet auf dem PC im Ordner „Downloads“ › „Quick Share“ – diesen Unterordner kannst du hier als Quelle verbinden.'),
        Q.kann.ordner ? h('button', { class: 'btn', id: 'qHandyQuick', onclick: () => { f.zu(); zeigOrdner(); } }, 'Ordner verbinden …') : null));
    f.inhalt.append(h('div', { class: 'q-teil' }, h('h4', {}, 'Speicherkarte, USB-Stick, Kamera'),
        h('p', {}, 'Karte oder Stick am PC einstecken und über „Videos, Fotos, Musik holen“ auswählen – oder den Ordner darauf als Quelle verbinden.')));
    f.inhalt.append(h('div', { class: 'q-teil' }, h('h4', {}, 'Gleich am Handy oder Tablet schneiden'),
        h('p', {}, 'Den Schnittraum dort unter derselben Adresse öffnen. Unter „Medien“ stehen die Galerie, die eigenen Dateien mit SD-Karte und die Kamera. Als App eingerichtet erscheint er außerdem in der Galerie und in Google Fotos unter „Teilen“.')));
    f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Schließen'));
  }

  const aus = { leiste, zeigOrdner, zeigHandy, zeigWoher, galerie, dateien, kamera };
  return aus;
}
