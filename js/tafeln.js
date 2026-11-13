// TW Schnittraum – die beiden Tafeln: links Medien / Text / Ton / Schalter, rechts die Einstellungen zum gewählten Teil.
import { FORMATE, UEBERGAENGE, SCHRIFTEN, STILE, FARBE_NEUTRAL, TEXT_VORLAGEN, tonDauer, zeitText, dauerVon } from './modell.js';
import { medien, getrennte } from './medien.js';
import { MOBIL } from './geraeteart.js';
import { h, chips, haken, regler, schalter, farbwahl, frage, prozent, sekunden, mitVorzeichen } from './bausteine.js';
import { schaetze } from './ki.js';
const FREI = !!globalThis.TW_FREI;   // kostenlose öffentliche Fassung (frei-config.js): ohne KI, ohne Google, ohne Firmenlogo im Film

const FARBEN = [['#FFFFFF', 'Weiß'], ['#000000', 'Schwarz'], ['#C41E1E', 'TW-Rot'], ['#FACC15', 'Gelb'], ['#4DA6FF', 'Blau'], ['#27AE60', 'Grün']];
const ART_NAME = { video: 'Video', bild: 'Foto', ton: 'Ton' };

export function baueTafeln(K) {
  const Z = K.Z, lFeld = document.getElementById('lFeld'), eig = document.getElementById('eig'), lReiter = document.getElementById('lReiter');
  const schmal = () => matchMedia('(max-width: 1000px)').matches;
  const live = (fn) => K.aendere(fn, false), fest = () => K.fest();
  const teil = (titel, ...rest) => h('div', { class: 'e-teil' }, titel ? h('h4', {}, titel) : null, ...rest);

  function setzReiter(r) {
    if (r === 'eig' && !schmal()) r = 'medien';
    Z.reiter = r;
    for (const b of lReiter.children) b.classList.toggle('an', b.dataset.r === r);
    zeigLinks();
  }
  lReiter.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) setzReiter(b.dataset.r); });

  // ───────── Links ─────────
  function zeigLinks() {
    const r = Z.reiter;
    if (r === 'eig') { if (schmal()) { lFeld.replaceChildren(...baueEig()); return; } Z.reiter = 'medien'; }
    lFeld.replaceChildren(...(r === 'text' ? tafelText() : r === 'ton' ? tafelTon() : r === 'schalter' ? tafelSchalter() : tafelMedien()));
  }

  function tafelMedien() {
    const aus = [h('button', { class: 'btn voll', onclick: () => K.holeMedien(false) }, '＋ Videos, Fotos, Musik holen'), K.quellen.leiste(),
      h('div', { class: 'zieh-feld', id: 'ziehFeld', title: 'Aus dem Explorer, vom Stick, von der Speicherkarte oder vom verbundenen Handy – einfach hereinziehen. Es geht überall im Fenster.' }, h('b', {}, '⇩ Hierher ziehen'), h('span', {}, 'Dateien oder ganze Ordner'))];
    const weg = getrennte();
    if (weg.length) aus.push(h('div', { class: 'notiz' }, h('b', {}, weg.length === 1 ? '1 Datei ist noch nicht verbunden. ' : weg.length + ' Dateien sind noch nicht verbunden. '), 'Nach einem Neustart braucht der Browser einmal deine Erlaubnis.', h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: K.verbinde }, 'Dateien wieder verbinden'))));
    const liste = [...medien.values()].reverse();
    if (!liste.length) aus.push(h('p', { class: 'hinweis' }, MOBIL ? 'Noch nichts geholt. Nimm oben die Galerie, die eigenen Dateien mit SD-Karte oder die Kamera' + (FREI ? '' : ' – oder Google Fotos und Google Drive') + '. Es wird nichts hochgeladen.'
      : 'Noch nichts geholt. Wähle Dateien aus, zieh Dateien oder ganze Ordner ins Fenster – oder nimm eine der Quellen darüber: ' + (FREI ? 'einen Ordner oder das Handy' : 'einen Ordner, das Handy, Google Fotos oder Google Drive') + '. Es wird nichts hochgeladen.'));
    const raster = h('div', { class: 'm-raster' });
    for (const m of liste) {
      const imFilm = m.art === 'ton' ? Z.p.ton.some(a => a.medium === m.id) : Z.p.clips.some(c => c.medium === m.id);
      const k = h('div', { class: 'm-kachel' + (!m.datei ? ' getrennt' : '') + (m.fehler ? ' fehler' : ''), draggable: !!m.datei && !m.fehler, title: m.name,
        ondragstart: (ev) => { ev.dataTransfer.setData('text/tw-medium', m.id); ev.dataTransfer.effectAllowed = 'copy'; },
        ondblclick: () => K.legeMedium(m.id) },
        h('div', { class: 'm-bild', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : null }, m.thumb ? null : (m.art === 'ton' ? '♪' : m.art === 'bild' ? '▧' : '▶')),
        h('span', { class: 'm-art' }, ART_NAME[m.art] + (imFilm ? ' ✓' : '')),
        m.art !== 'bild' && m.dauer ? h('span', { class: 'm-dauer' }, zeitText(m.dauer, false)) : null,
        h('div', { class: 'm-name' }, m.name),
        m.fehler ? h('div', { class: 'm-warn' }, m.fehler) : !m.datei ? h('div', { class: 'm-warn' }, 'Nicht verbunden') : null,
        h('div', { class: 'm-tun' },
          h('button', { class: 'btn', disabled: !m.datei || !!m.fehler, title: m.art === 'ton' ? 'Als Ton unter den Film legen' : 'Hinten an den Film anhängen', onclick: () => K.legeMedium(m.id) }, m.art !== 'ton' ? '＋ In den Film' : m.herkunft === 'aufnahme' ? '＋ Als Sprecher' : '＋ Als Musik'),
          h('button', { class: 'ib', title: m.ablage ? 'Aus der Mediathek nehmen (die Kopie in der App wird entfernt)' : 'Aus der Mediathek nehmen (die Datei selbst bleibt erhalten)', 'aria-label': 'Aus der Mediathek nehmen', onclick: () => K.nimmMedium(m.id) }, '✕')));
      raster.append(k);
    }
    aus.push(raster);
    return aus;
  }

  function tafelText() {
    const aus = [h('div', { class: 'gruppe' }, 'Text einfügen'), h('p', { class: 'hinweis', style: { margin: '0 0 8px' } }, 'Antippen – der Text erscheint an der Stelle des Abspielzeigers. Danach rechts anpassen oder in der Vorschau verschieben.')];
    for (const [k, v] of Object.entries(TEXT_VORLAGEN)) aus.push(h('button', { class: 'vorlage', onclick: () => K.neuerText(k) }, h('b', { style: { fontFamily: `"${v.w.schrift}"`, fontWeight: v.w.fett ? 700 : 400 } }, v.w.text), h('small', {}, v.name)));
    if (Z.p.texte.length) {
      aus.push(h('div', { class: 'gruppe' }, 'Texte im Film'));
      for (const x of [...Z.p.texte].sort((a, b) => a.start - b.start)) aus.push(h('div', { class: 'liste-eintrag' + (Z.sel && Z.sel.id === x.id ? ' an' : ''), onclick: () => { K.waehle({ art: 'text', id: x.id }); K.vor.geh(x.start + 0.01); } }, h('span', { class: 'n' }, x.text.replace(/\n/g, ' ')), h('small', {}, zeitText(x.start))));
    }
    return aus;
  }

  function tafelTon() {
    const A = K.aufnahme, aus = [];
    aus.push(h('div', { class: 'gruppe' }, 'Musik'), h('button', { class: 'btn voll', onclick: () => K.holeMusik() }, '♪ Musik oder Ton holen'),
      h('button', { class: 'btn voll', id: 'bAppMusik', style: { marginTop: '6px' }, onclick: () => K.musik.zeig() }, '♫ Musik von der App'),
      h('p', { class: 'hinweis' }, 'Für YouTube, Instagram und Facebook nur Musik verwenden, die du verwenden darfst – sonst wird das Video dort stumm geschaltet oder gesperrt. Musik aus Spotify und anderen Abos ist dafür nicht erlaubt. Die Musik von der App darfst du überall verwenden.'));
    aus.push(h('div', { class: 'gruppe' }, 'Nachvertonen (Sprecher)'));
    if (A.laeuft()) {
      aus.push(h('div', { class: 'notiz rot' }, h('b', {}, 'Aufnahme läuft … '), 'Sprich jetzt zum Film.'), h('div', { class: 'aufn-zeit', id: 'aufnZeit' }, '0:00,0'), h('div', { class: 'pegel' }, h('i', { id: 'aufnPegel' })),
        h('button', { class: 'btn primaer voll', onclick: A.stopp }, '■ Aufnahme beenden'), h('button', { class: 'btn voll', style: { marginTop: '6px' }, onclick: A.abbruch }, 'Verwerfen'));
    } else {
      aus.push(h('p', { class: 'hinweis', style: { margin: '0 0 4px' } }, 'Der Film läuft ab dem Abspielzeiger (', h('b', {}, zeitText(K.vor.zeit())), ') und du sprichst dazu ins Mikrofon.'),
        schalter('Originalton beim Aufnehmen stumm', 'Damit das Mikrofon nur deine Stimme aufnimmt und nicht den Lautsprecher.', A.stumm(), (b) => A.setzStumm(b)),
        h('button', { class: 'btn voll', onclick: A.start }, '● Aufnahme starten'));
    }
    if (Z.p.ton.length) {
      aus.push(h('div', { class: 'gruppe' }, 'Ton im Film'));
      for (const a of [...Z.p.ton].sort((x, y) => x.start - y.start)) { const m = medien.get(a.medium); aus.push(h('div', { class: 'liste-eintrag' + (Z.sel && Z.sel.id === a.id ? ' an' : ''), onclick: () => K.waehle({ art: 'ton', id: a.id }) }, h('span', { class: 'n' }, (a.rolle === 'musik' ? '♪ ' : '● ') + (m ? m.name : 'Datei fehlt')), h('small', {}, zeitText(a.start)))); }
    }
    return aus;
  }

  function karteFelder(k, mitLogo = true) {
    const d = h('div', {});
    const feld = (name, schl) => { const i = h('input', { class: 'inp', type: 'text', value: k[schl] || '', maxlength: 90, oninput: () => live(() => { k[schl] = i.value; }), onchange: fest }); return [h('label', { class: 'lbl' }, name), i]; };
    d.append(...feld('Zeile 1', 'zeile1'), ...feld('Zeile 2 (kleiner)', 'zeile2'),
      regler('Dauer', k.dauer, { min: 1.5, max: 10, schritt: 0.5, zeige: sekunden, std: 3 }, (v) => live(() => { k.dauer = v; }), fest));
    return d;
  }

  function tafelSchalter() {
    const p = Z.p, s = p.schalter, aus = [];
    const setz = (k) => (b) => { K.aendere(() => { s[k] = b; }); zeigLinks(); if (k === 'vorspann' && b) K.vor.geh(0); if (k === 'abspann' && b) K.vor.geh(Math.max(0, Z.lay.dauer - p.abspann.dauer + 1)); };
    aus.push(h('p', { class: 'hinweis', style: { margin: '0 0 4px' } }, 'Alle Zusatzfunktionen sind aus, bis du sie hier einschaltest – je Film getrennt.'));
    aus.push(schalter('Vorspann', FREI ? 'Ruhige Titelkarte vor dem Film – mit deinem Titel.' : 'Ruhige Titelkarte vor dem Film – mit Logo und eigenem Titel.', s.vorspann, setz('vorspann')));
    if (s.vorspann) aus.push(h('div', { class: 'unter' }, karteFelder(p.vorspann)));
    aus.push(schalter('Abspann', FREI ? 'Schlusskarte nach dem Film – mit deinem Text.' : 'Schlusskarte nach dem Film – Logo, Firmenname, Leistungen.', s.abspann, setz('abspann')));
    if (s.abspann) aus.push(h('div', { class: 'unter' }, karteFelder(p.abspann)));
    aus.push(schalter('Musik leiser, wenn gesprochen wird', 'Senkt die Musik automatisch ab, solange eine Sprecher-Aufnahme läuft.', s.musikLeiser, setz('musikLeiser')));
    aus.push(schalter('Originalton leiser, wenn gesprochen wird', 'Senkt den Ton der Videos ab, solange eine Sprecher-Aufnahme läuft.', s.originalLeiser, setz('originalLeiser')));
    aus.push(schalter('Automatische Untertitel', 'Gesprochenes Deutsch wird im Gerät erkannt und als Text ins Bild gesetzt – es wird nichts hochgeladen.', s.untertitel, setz('untertitel')));
    if (s.untertitel) aus.push(h('div', { class: 'unter' }, teilUntertitel()));
    let rohschnitt = schalter('Schneller Rohschnitt', 'Setzt aus deinen Clips einen ersten Film zusammen – als Anfang zum Weiterschneiden.', s.kiRohschnitt, setz('kiRohschnitt'));
    aus.push(rohschnitt);
    if (s.kiRohschnitt) aus.push(h('div', { class: 'unter' }, teilKi()));
    return aus;
  }

  // Einstellungen zum Schalter „Automatische Untertitel“: erkennen, Aussehen, Texte nachbessern.
  function teilUntertitel() {
    const U = K.untertitel, u = Z.p.untertitel, zl = Z.lay.ut || [], fehlt = U.fehlend(), aus = [];
    if (U.laeuft()) {
      const st = U.stand();
      aus.push(h('div', { class: 'notiz blau' }, h('b', { id: 'utText' }, st.text), h('div', { class: 'balken' }, h('i', { id: 'utBalken', style: { width: Math.round(st.anteil * 100) + '%' } })),
        h('button', { class: 'btn klein', onclick: U.abbrechen }, 'Abbrechen')));
    } else if (!U.hatTon()) aus.push(h('p', { class: 'hinweis' }, 'Im Film ist noch kein Ton, in dem gesprochen wird. Lege ein Video mit Ton hinein oder nimm unter „Ton“ einen Sprecher auf.'));
    else if (fehlt.length) aus.push(h('div', { class: 'notiz' },
      h('b', {}, zl.length ? `Für ${fehlt.length === 1 ? 'eine Stelle' : fehlt.length + ' Stellen'} im Film fehlt die Erkennung noch. ` : 'Die Sprache im Film ist noch nicht erkannt. '),
      'Beim ersten Mal wird das Sprachmodell geladen (rund 85 MB, am besten im WLAN) – danach geht es ohne Internet.',
      h('div', { class: 'zeile' }, h('button', { class: 'btn primaer', id: 'utStart', onclick: () => U.starte(false) }, zl.length ? '▶ Fehlende Stellen erkennen' : '▶ Sprache jetzt erkennen'))));
    else aus.push(h('p', { class: 'hinweis' }, zl.length ? `${zl.length} Untertitel im Film – sie wandern beim Schneiden mit.` : 'In diesem Film wurde keine deutsche Sprache erkannt.'));
    aus.push(h('label', { class: 'lbl' }, 'Größe'), chips([[3.6, 'Klein'], [4.6, 'Mittel'], [5.8, 'Groß']], u.groesse, (v) => K.aendere(() => { u.groesse = v; })),
      h('label', { class: 'lbl' }, 'Platz im Bild'), chips([['unten', 'Unten'], ['mitte', 'Mitte'], ['oben', 'Oben']], u.lage, (v) => K.aendere(() => { u.lage = v; })),
      h('label', { class: 'lbl' }, 'Aussehen'), haken([['kasten', 'Dunkler Kasten', u.kasten], ['gross', 'GROSSBUCHSTABEN', u.gross]], (k, b) => K.aendere(() => { u[k] = b; })));
    if (zl.length && !U.laeuft()) {
      aus.push(h('div', { class: 'gruppe' }, 'Texte nachbessern'), h('p', { class: 'hinweis', style: { margin: '0 0 6px' } }, 'Zeit antippen = hinspringen. Text antippen = ändern. Leeres Feld = Zeile ausblenden.'));
      for (const z of zl) {
        const feld = h('input', { class: 'inp', type: 'text', value: z.text, maxlength: 160, 'aria-label': 'Untertitel bei ' + zeitText(z.start), onchange: () => U.setzText(z, feld.value) });
        aus.push(h('div', { class: 'ut-zeile' }, h('button', { class: 'btn klein', title: 'Zu dieser Stelle springen', onclick: () => K.vor.geh(z.start + 0.05) }, zeitText(z.start)), feld));
      }
      const knoepfe = h('div', { class: 'zeile' });
      knoepfe.append(h('button', { class: 'btn klein', onclick: async () => { if (await frage('Alles neu erkennen?', 'Die Sprache im ganzen Film wird noch einmal gelesen. Deine Verbesserungen an den Texten gehen dabei verloren.', 'Neu erkennen')) U.starte(true); } }, 'Alles neu erkennen'));
      aus.push(knoepfe);
    }
    return aus;
  }

  // Einstellungen zum Schalter für den Rohschnitt (Firmen-Fassung: mit KI; kostenlose Fassung: der einfache Rohschnitt).
  function teilKi() {
    const k = Z.p.ki, A = K.ki, aus = [];
    if (A.laeuft()) {
      const st = A.stand();
      return [h('div', { class: 'notiz blau' }, h('b', { id: 'kiText' }, st.text), h('div', { class: 'balken' }, h('i', { id: 'kiBalken', style: { width: Math.round(st.anteil * 100) + '%' } })))];
    }
    if (FREI) {   // kostenlose Fassung: der einfache Rohschnitt – alle Clips nacheinander, jeweils der mittlere Teil
      const l = A.liste();
      return [h('p', { class: 'hinweis', style: { margin: '0 0 4px' } }, 'Alle Clips kommen in der Reihenfolge der Aufnahme in den Film, jeweils der mittlere Teil. Gesprochene Sätze bleiben ganz, wenn die Sprache schon erkannt ist. Danach schneidest du wie gewohnt weiter.'),
        h('label', { class: 'lbl' }, 'Wie lang soll das Video werden?'), chips([[15, '15 s'], [30, '30 s'], [60, '1 Minute'], [90, '1½ Minuten'], [180, '3 Minuten']], k.ziel, (v) => K.aendere(() => { k.ziel = v; })),
        h('label', { class: 'lbl' }, 'Woraus?'), chips([['film', 'Clips im Film'], ['alle', 'Ganze Mediathek']], A.quelle(), (v) => { K.aendere(() => { k.quelle = v; }); zeigLinks(); }),
        h('p', { class: 'hinweis', id: 'kiInfo' }, l.length ? `${l.length} ${l.length === 1 ? 'Datei' : 'Dateien'}` : (A.quelle() === 'film' ? 'Im Film liegt noch kein Clip.' : 'Noch keine Videos da – erst unter „Medien“ welche holen.')),
        h('div', { class: 'zeile' }, h('button', { class: 'btn primaer', id: 'kiOhne', disabled: !l.length, onclick: () => A.vorschlag(false) }, '▶ Rohschnitt vorschlagen'))];
    }
  }

  // ───────── Rechts: Einstellungen ─────────
  function zeigEig() {
    if (schmal()) { eig.replaceChildren(); if (Z.reiter === 'eig') lFeld.replaceChildren(...baueEig()); return; }
    eig.replaceChildren(...baueEig());
  }

  function baueEig() {
    const sel = Z.sel, ding = K.gewaehlt();
    if (!sel || !ding) return eigProjekt();
    if (sel.art === 'clip') return eigClip(ding);
    if (sel.art === 'text') return eigText(ding);
    if (sel.art === 'ton') return eigTon(ding);
    return eigKarte(sel.id, ding);
  }

  const kopf = (titel, unter) => h('div', { class: 'e-kopf' }, h('h3', { title: titel }, titel), h('small', {}, unter));

  function eigProjekt() {
    const p = Z.p;
    const name = h('input', { class: 'inp', type: 'text', value: p.name, maxlength: 80, oninput: () => { live(() => { p.name = name.value || 'Neues Video'; }); K.zeigName(); }, onchange: fest });
    return [kopf('Dieser Film', 'Nichts ausgewählt – hier stehen die Grundeinstellungen.'),
      teil('Name', name),
      teil('Format', chips(Object.entries(FORMATE).map(([k, f]) => [k, f.name, f.wofuer]), p.format, (v) => K.setzFormat(v)), h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, FORMATE[p.format].wofuer + ' · ' + FORMATE[p.format].w + ' × ' + FORMATE[p.format].h)),
      teil('Hintergrund', farbwahl([['#000000', 'Schwarz'], ['#FFFFFF', 'Weiß'], ['#0F1923', 'TW-Dunkel']], p.hintergrund, (f, ende) => { live(() => { p.hintergrund = f; }); if (ende) fest(); }), h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, 'Sichtbar, wenn ein Video nicht das ganze Bild füllt.')),
      teil('So geht’s', h('ol', { class: 'hinweis', style: { margin: '0', paddingLeft: '18px', lineHeight: '1.55' } },
        h('li', {}, 'Links Videos holen und mit „＋ In den Film“ anhängen.'), h('li', {}, 'Unten in der Zeitleiste kürzen (an den Rändern ziehen), teilen und umsortieren.'),
        h('li', {}, 'Clip antippen – hier rechts Farbe, Tempo, Ton und Übergang einstellen.'), h('li', {}, 'Text, Musik und Sprecher über die Reiter links dazunehmen.'), h('li', {}, 'Oben rechts „Video ausgeben“.')))];
  }

  function eigClip(c) {
    const m = medien.get(c.medium), s = Z.lay.segs.find(x => x.c === c), erster = s && s.i === 0;
    const aus = [kopf(m ? m.name : 'Datei fehlt', (c.art === 'bild' ? 'Foto' : 'Video-Clip') + (s ? ' · ' + zeitText(s.d) + ' im Film' : ''))];
    if (m && m.fehler) aus.push(h('div', { class: 'notiz rot', style: { margin: '10px 12px' } }, m.fehler));
    if (m && !m.datei) aus.push(h('div', { class: 'notiz', style: { margin: '10px 12px' } }, 'Die Datei ist nicht verbunden. Links unter „Medien“ auf „Dateien wieder verbinden“ tippen.'));

    aus.push(teil('Schnitt',
      h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: K.teile, title: 'Am Abspielzeiger in zwei Teile schneiden (S)' }, '✂ Am Zeiger teilen'), h('button', { class: 'btn klein', onclick: K.verdopple }, '⧉ Verdoppeln'), h('button', { class: 'btn klein gefahr', onclick: K.entferne }, '✕ Entfernen')),
      c.art === 'bild'
        ? regler('Standzeit', c.dauer, { min: 0.5, max: 20, schritt: 0.5, zeige: sekunden, std: 4 }, (v) => live(() => { c.dauer = v; }), fest)
        : [h('label', { class: 'lbl' }, 'Tempo (Zeitlupe / Zeitraffer)'), chips([[0.25, '¼×'], [0.5, '½×'], [0.75, '¾×'], [1, 'Normal'], [1.5, '1,5×'], [2, '2×'], [4, '4×']], c.tempo, (v) => { K.aendere(() => { c.tempo = v; }); }),
          h('p', { class: 'hinweis', style: { margin: '6px 0 0' } }, 'Anfang und Ende kürzt du in der Zeitleiste, indem du am Rand des Clips ziehst. Bei Zeitlupe und Zeitraffer ändert sich die Tonhöhe – Ton dann am besten stumm schalten.')]));

    if (c.art === 'video') aus.push(teil('Ton',
      m && !m.hatTon ? h('p', { class: 'hinweis' }, 'Dieses Video hat keinen Ton.') : [
        schalter('Ton dieses Clips stumm', '', c.stumm, (b) => K.aendere(() => { c.stumm = b; })),
        regler('Lautstärke', c.laut, { min: 0, max: 200, schritt: 5, zeige: prozent, std: 100 }, (v) => live(() => { c.laut = v; }), fest)]));

    aus.push(teil('Ein- und Ausblenden',
      regler('Einblenden', c.einbl, { min: 0, max: 3, schritt: 0.1, zeige: sekunden, std: 0 }, (v) => live(() => { c.einbl = v; }), fest),
      regler('Ausblenden', c.ausbl, { min: 0, max: 3, schritt: 0.1, zeige: sekunden, std: 0 }, (v) => live(() => { c.ausbl = v; }), fest),
      h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'Bild und Ton kommen weich aus dem Schwarz bzw. gehen dorthin.')));

    aus.push(teil('Bildausschnitt',
      chips([['fuellen', 'Bild füllen', 'Das Video füllt das ganze Bild, Ränder werden abgeschnitten'], ['einpassen', 'Ganz zeigen', 'Das ganze Video ist zu sehen, der Rest wird aufgefüllt']], c.passung, (v) => { K.aendere(() => { c.passung = v; }); zeigEig(); }),
      c.passung === 'einpassen' ? [h('label', { class: 'lbl' }, 'Rand auffüllen mit'), chips([['unscharf', 'Unscharfem Bild'], ['schwarz', 'Schwarz']], c.hg, (v) => K.aendere(() => { c.hg = v; }))] : null,
      regler('Zoom', Math.round(c.zoom * 100), { min: 50, max: 300, schritt: 5, zeige: prozent, std: 100 }, (v) => live(() => { c.zoom = v / 100; }), fest),
      regler('Seitlich', Math.round(c.x * 100), { min: -50, max: 50, zeige: mitVorzeichen, std: 0 }, (v) => live(() => { c.x = v / 100; }), fest),
      regler('Hoch / tief', Math.round(c.y * 100), { min: -50, max: 50, zeige: mitVorzeichen, std: 0 }, (v) => live(() => { c.y = v / 100; }), fest),
      h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => K.aendere(() => { c.dreh = ((c.dreh || 0) + 90) % 360; }) }, '↻ Drehen'),
        haken([['spiegel', '⇋ Spiegeln', c.spiegel], ...(c.art === 'bild' ? [['kb', 'Langsam heranfahren', c.kb]] : [])], (k, b) => K.aendere(() => { c[k] = b; }))),
      h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'Tipp: Den Ausschnitt kannst du auch direkt in der Vorschau mit der Maus verschieben.')));

    const f = c.farbe;
    const farbRegler = (name, k, min = -100, max = 100) => regler(name, f[k], { min, max, zeige: mitVorzeichen, std: 0 }, (v) => live(() => { f[k] = v; c.stil = 'eigen'; }), () => { fest(); });
    aus.push(teil(h('span', { style: { display: 'contents' } }, 'Farbe und Stil', h('button', { class: 'btn klein', onclick: () => { K.aendere(() => { c.farbe = { ...FARBE_NEUTRAL }; c.stil = 'natur'; }); zeigEig(); } }, 'Zurücksetzen')),
      chips(Object.entries(STILE).map(([k, v]) => [k, v.name]), c.stil, (v) => { K.aendere(() => { c.farbe = { ...FARBE_NEUTRAL, ...STILE[v].w }; c.stil = v; }); zeigEig(); }),
      farbRegler('Helligkeit', 'hell'), farbRegler('Kontrast', 'kontrast'), farbRegler('Farbkraft', 'saett'), farbRegler('Kalt ↔ Warm', 'waerme'),
      farbRegler('Randschatten', 'vignette', 0), farbRegler('Weichzeichnen', 'weich', 0), farbRegler('Sepia', 'sepia', 0),
      Z.p.clips.length > 1 ? h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: () => { K.aendere((p) => { for (const k of p.clips) { k.farbe = { ...c.farbe }; k.stil = c.stil; } }); K.sag('Farbe auf alle Clips übertragen.'); } }, 'Auf alle Clips übertragen') : null));

    aus.push(teil('Übergang davor',
      erster ? h('p', { class: 'hinweis' }, 'Der erste Clip hat keinen Übergang davor. Für einen weichen Einstieg oben „Einblenden“ nutzen.') : [
        chips(Object.entries(UEBERGAENGE), c.ueb.art, (v) => { K.aendere(() => { c.ueb.art = v; }); zeigEig(); if (s && v !== 'keiner') K.vor.geh(Math.max(0, s.t0 - 0.8)); }),
        c.ueb.art !== 'keiner' ? regler('Dauer', c.ueb.dauer, { min: 0.2, max: 2, schritt: 0.1, zeige: sekunden, std: 0.6 }, (v) => live(() => { c.ueb.dauer = v; }), fest) : null,
        Z.p.clips.length > 2 && c.ueb.art !== 'keiner' ? h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: () => { K.aendere((p) => { p.clips.forEach((k, i) => { if (i > 0) k.ueb = { ...c.ueb }; }); }); K.sag('Übergang zwischen alle Clips gesetzt.'); } }, 'Zwischen alle Clips setzen') : null]));
    return aus;
  }

  function eigText(x) {
    const feld = h('textarea', { class: 'inp', id: 'textFeld', rows: 3, value: x.text, placeholder: 'Text eingeben …', oninput: () => live(() => { x.text = feld.value; }), onchange: () => { fest(); if (Z.reiter === 'text') zeigLinks(); } });
    const aus = [kopf('Text', zeitText(x.start) + ' bis ' + zeitText(x.ende)),
      teil('Inhalt', feld, h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: K.verdopple }, '⧉ Verdoppeln'), h('button', { class: 'btn klein gefahr', onclick: K.entferne }, '✕ Entfernen'))),
      teil('Schrift',
        chips(SCHRIFTEN.map(s => [s, s, null, { fontFamily: `"${s}"` }]), x.schrift, (v) => K.aendere(() => { x.schrift = v; })),
        regler('Größe', x.groesse, { min: 2, max: 25, schritt: 0.2, zeige: (v) => v.toFixed(1).replace('.', ','), std: 6 }, (v) => live(() => { x.groesse = v; }), fest),
        h('label', { class: 'lbl' }, 'Farbe'), farbwahl(FARBEN, x.farbe, (f, ende) => { live(() => { x.farbe = f; }); if (ende) fest(); }),
        h('label', { class: 'lbl' }, 'Aussehen'), haken([['fett', 'Fett', x.fett], ['kursiv', 'Kursiv', x.kursiv], ['kontur', 'Kontur', x.kontur], ['schatten', 'Schatten', x.schatten], ['kasten', 'Kasten', x.kasten]], (k, b) => { K.aendere(() => { x[k] = b; }); if (k === 'kasten') zeigEig(); }),
        x.kasten ? [h('label', { class: 'lbl' }, 'Kastenfarbe'), farbwahl(FARBEN, x.kastenFarbe, (f, ende) => { live(() => { x.kastenFarbe = f; }); if (ende) fest(); }),
          regler('Deckkraft', x.kastenDeck, { min: 10, max: 100, schritt: 5, zeige: prozent, std: 60 }, (v) => live(() => { x.kastenDeck = v; }), fest)] : null),
      teil('Platz im Bild',
        chips([['links', 'Linksbündig'], ['mitte', 'Mittig'], ['rechts', 'Rechtsbündig']], x.ausr, (v) => { K.aendere(() => { x.ausr = v; x.x = v === 'links' ? 0.06 : v === 'rechts' ? 0.94 : 0.5; }); zeigEig(); }),
        h('label', { class: 'lbl' }, 'Höhe'), chips([[0.12, 'Oben'], [0.5, 'Mitte'], [0.86, 'Unten']], x.y, (v) => { K.aendere(() => { x.y = v; }); zeigEig(); }),
        regler('Seitlich', Math.round(x.x * 100), { min: 0, max: 100, zeige: prozent, std: 50 }, (v) => live(() => { x.x = v / 100; }), fest),
        regler('Hoch / tief', Math.round(x.y * 100), { min: 0, max: 100, zeige: prozent, std: 50 }, (v) => live(() => { x.y = v / 100; }), fest),
        h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'Oder den Text einfach in der Vorschau anfassen und verschieben.')),
      teil('Zeit',
        regler('Dauer', Math.min(60, x.ende - x.start), { min: 0.5, max: 60, schritt: 0.5, zeige: sekunden, std: 4 }, (v) => live(() => { x.ende = x.start + v; }), fest),
        h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => { K.aendere(() => { const d = x.ende - x.start; x.start = K.vor.zeit(); x.ende = x.start + d; }); zeigEig(); } }, 'Ab Abspielzeiger'),
          h('button', { class: 'btn klein', onclick: () => { K.aendere(() => { x.start = 0; x.ende = Math.max(1, Z.lay.dauer); }); zeigEig(); } }, 'Über den ganzen Film')),
        h('label', { class: 'lbl' }, 'Erscheinen'), chips([['keine', 'Ohne'], ['blende', 'Einblenden'], ['hoch', 'Hochschieben'], ['tippen', 'Wie getippt']], x.anim, (v) => { K.aendere(() => { x.anim = v; }); K.vor.geh(x.start); }))];
    return aus;
  }

  function eigTon(a) {
    const m = medien.get(a.medium);
    return [kopf(m ? m.name : 'Datei fehlt', (a.rolle === 'musik' ? 'Musik' : 'Sprecher') + ' · ' + zeitText(tonDauer(a)) + ' · ab ' + zeitText(a.start)),
      teil('Art', chips([['musik', '♪ Musik'], ['sprecher', '● Sprecher']], a.rolle, (v) => { K.aendere(() => { a.rolle = v; }); zeigEig(); }),
        h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: K.teile }, '✂ Am Zeiger teilen'), h('button', { class: 'btn klein', onclick: K.verdopple }, '⧉ Verdoppeln'), h('button', { class: 'btn klein gefahr', onclick: K.entferne }, '✕ Entfernen'))),
      teil('Lautstärke',
        regler('Lautstärke', a.laut, { min: 0, max: 200, schritt: 5, zeige: prozent, std: a.rolle === 'musik' ? 60 : 100 }, (v) => live(() => { a.laut = v; }), fest),
        regler('Einblenden', a.einbl, { min: 0, max: 5, schritt: 0.1, zeige: sekunden, std: 0 }, (v) => live(() => { a.einbl = v; }), fest),
        regler('Ausblenden', a.ausbl, { min: 0, max: 5, schritt: 0.1, zeige: sekunden, std: 1.5 }, (v) => live(() => { a.ausbl = v; }), fest)),
      teil('Lage', h('div', { class: 'zeile' },
        h('button', { class: 'btn klein', onclick: () => { K.aendere(() => { a.start = 0; }); zeigEig(); } }, 'An den Filmanfang'),
        h('button', { class: 'btn klein', onclick: () => { K.aendere(() => { a.start = K.vor.zeit(); }); zeigEig(); } }, 'Ab Abspielzeiger'),
        h('button', { class: 'btn klein', title: 'Das Tonstück endet mit dem Film', onclick: () => { K.aendere(() => { if (a.start < Z.lay.dauer) a.aus = Math.min(a.aus, a.ein + (Z.lay.dauer - a.start)); }); zeigEig(); } }, 'Auf Filmlänge kürzen')),
        h('p', { class: 'hinweis', style: { margin: '2px 0 0' } }, 'In der Zeitleiste verschieben oder an den Rändern kürzen.'))];
  }

  function eigKarte(id, k) {
    return [kopf(id === '__vorspann' ? 'Vorspann' : 'Abspann', 'Titelkarte – ein- und ausschalten unter „Schalter“'), teil('Inhalt', karteFelder(k)),
      teil('', h('button', { class: 'btn klein', onclick: () => setzReiter('schalter') }, 'Zu den Schaltern'))];
  }

  return { zeigLinks, zeigEig, setzReiter, schmal };
}
