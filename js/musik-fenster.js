// TW Schnittraum – „Musik von der App“: das Fenster dazu (Stil, Länge, Variante, anhören, unter den Film legen).
// Die Musik selbst entsteht in musik.js – im Gerät, ohne Netz, ohne fremde Stücke.
import { h, chips, fenster, meldung } from './bausteine.js';
import { unterlegeMusik } from './modell.js';
import { medien, nimm } from './medien.js';
import { MUSIK_STILE, LAENGE_HOECHSTENS, erzeuge, alsWav, musikDatei } from './musik.js';

const MERK = 'tw_sr_musik';
const lies = () => { try { return JSON.parse(localStorage.getItem(MERK) || '{}') || {}; } catch (e) { return {}; } };

export function baueMusik(K) {
  const Z = K.Z;
  /** Erzeugt ein Stück und legt es in die Mediathek (gibt es dasselbe Stück schon, wird es wiederverwendet). → Medium */
  async function medium(stil, sekunden, variante = 1, melde) {
    const datei = await musikDatei(stil, sekunden, variante, melde), r = await nimm([{ datei, kopie: true, herkunft: 'app-musik' }]);
    return r.medien[0] || null;
  }
  /** Musik für einen Film dieser Länge: ein Stück in genau passender Länge; bei Filmen über 3 Minuten zwei Varianten, die sich abwechseln. → [Medium] */
  async function fuerFilm(stil, dauer, variante = 1, melde = () => {}) {
    if (dauer <= LAENGE_HOECHSTENS + 2) return [await medium(stil, Math.ceil(dauer), variante, melde)].filter(Boolean);
    const a = await medium(stil, LAENGE_HOECHSTENS, variante, (x) => melde(x / 2)), b = await medium(stil, LAENGE_HOECHSTENS, variante + 1, (x) => melde(0.5 + x / 2));
    return [a, b].filter(Boolean);
  }
  /** Kurze Hörprobe (ohne Mediathek). → { stopp() } */
  async function probe(stil, variante, beiEnde) {
    const k = await erzeuge(stil, 24, variante), url = URL.createObjectURL(alsWav(k.l, k.r)), ton = new Audio(url);
    const stopp = () => { ton.pause(); URL.revokeObjectURL(url); };
    ton.onended = () => { stopp(); beiEnde(); };
    await ton.play();
    return { stopp };
  }

  function zeig() {
    K.vor.halt();
    const alt = lies(), film = Z.lay.dauer > 1, e = { stil: MUSIK_STILE[alt.stil] ? alt.stil : 'heiter', laenge: film ? 'film' : 60, variante: 1 };
    let laeuft = null;
    const hoer = h('button', { class: 'btn', id: 'mProbe' }, '▶ Anhören'), los = h('button', { class: 'btn primaer', id: 'mNimm' }, film ? 'Unter den Film legen' : 'In die Mediathek legen'), info = h('p', { class: 'hinweis', id: 'mInfo' });
    const stopp = () => { if (laeuft) { laeuft.stopp(); laeuft = null; } hoer.textContent = '▶ Anhören'; hoer.disabled = false; };
    const f = fenster('Musik von der App', { breite: 580, beiZu: stopp });
    f.kasten.id = 'mFenster';
    const stand = () => { stopp(); const s = e.laenge === 'film' ? Z.lay.dauer : e.laenge; info.textContent = e.laenge === 'film' && s > LAENGE_HOECHSTENS + 2 ? 'Dein Film ist länger als 3 Minuten: Es entstehen zwei Stücke im selben Stil, die sich abwechseln.' : e.laenge === 'film' ? 'Das Stück wird genau so lang wie dein Film und endet mit einem Schlussakkord.' : film ? 'Das Stück kommt an den Anfang des Films bzw. an den Abspielzeiger – wie ein selbst geholtes Musikstück.' : 'Das Stück liegt danach unter „Medien“.'; };
    hoer.onclick = async () => {
      if (laeuft) { stopp(); return; }
      hoer.disabled = true; hoer.textContent = 'Wird erzeugt …';
      try { laeuft = await probe(e.stil, e.variante, stopp); hoer.textContent = '■ Stopp'; } catch (err) { console.warn(err); stopp(); meldung('Die Hörprobe ließ sich nicht abspielen.', true); }
      hoer.disabled = false;
    };
    los.onclick = async () => {
      stopp(); los.disabled = true; hoer.disabled = true; info.textContent = 'Die Musik wird erzeugt …';
      try {
        const ganz = e.laenge === 'film', st = ganz ? await fuerFilm(e.stil, Z.lay.dauer, e.variante) : [await medium(e.stil, e.laenge, e.variante)].filter(Boolean);
        if (!st.length) throw new Error('kein Stück');
        if (ganz) K.aendere((p) => { p.ton = p.ton.filter((a) => !(a.rolle === 'musik' && (medien.get(a.medium) || {}).herkunft === 'app-musik')); unterlegeMusik(p, st, 55); });   // frühere App-Musik wird ersetzt, selbst geholte Musik bleibt
        else if (film) K.legeMedium(st[0].id);
        try { localStorage.setItem(MERK, JSON.stringify({ stil: e.stil })); } catch (err) { /* egal */ }
        f.zu(); meldung(ganz ? 'Die Musik liegt unter dem ganzen Film.' : film ? 'Die Musik liegt im Film.' : 'Die Musik liegt jetzt unter „Medien“.');
      } catch (err) { console.warn(err); los.disabled = false; hoer.disabled = false; info.textContent = ''; meldung('Die Musik ließ sich nicht erzeugen.', true); }
    };
    f.inhalt.append(
      h('div', { class: 'notiz blau' }, h('b', {}, 'Die App macht die Musik selbst – hier im Gerät, ohne Internet. '), 'Es steckt kein fremdes Stück darin. Du darfst sie überall verwenden, auch in Werbefilmen und auf YouTube, Instagram und Facebook; sie kostet nichts.'),
      h('label', { class: 'lbl' }, 'Welche Stimmung?'), chips(Object.entries(MUSIK_STILE).map(([k, v]) => [k, v[0], v[1]]), e.stil, (v) => { e.stil = v; stand(); }),
      h('label', { class: 'lbl' }, 'Wie lang?'), chips([...(film ? [['film', 'So lang wie der Film']] : []), [30, '30 s'], [60, '1 Minute'], [120, '2 Minuten'], [180, '3 Minuten']], e.laenge, (v) => { e.laenge = v; stand(); }),
      h('label', { class: 'lbl' }, 'Gefällt sie dir nicht? Andere Melodie im selben Stil'), chips([[1, 'Variante 1'], [2, 'Variante 2'], [3, 'Variante 3']], e.variante, (v) => { e.variante = v; stand(); }),
      info);
    f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Abbrechen'), hoer, los);
    stand();
  }
  return { zeig, medium, fuerFilm, probe };
}
