// TW Schnittraum – Projektmodell: was in einem Schnittprojekt steht und wie daraus die Zeitleiste berechnet wird.
// Alle Zeiten in Sekunden. Ein Projekt ist reines JSON (für Rückgängig, Sichern, Export als Datei).

const FREI = !!globalThis.TW_FREI;   // kostenlose öffentliche Fassung (frei-config.js): ohne KI, ohne Google, ohne Firmenlogo im Film
export const FORMATE = {
  quer: { name: 'Quer 16:9', kurz: '16:9', wofuer: 'YouTube, Facebook', w: 1920, h: 1080 },
  hoch: { name: 'Hoch 9:16', kurz: '9:16', wofuer: 'Reels, Shorts, Storys', w: 1080, h: 1920 },
  quadrat: { name: 'Quadrat 1:1', kurz: '1:1', wofuer: 'Beitrag Instagram / Facebook', w: 1080, h: 1080 },
  hochkant: { name: 'Hochkant 4:5', kurz: '4:5', wofuer: 'Beitrag Instagram', w: 1080, h: 1350 },
};

export const UEBERGAENGE = { keiner: 'Harter Schnitt', blende: 'Überblenden', schwarz: 'Über Schwarz', weiss: 'Über Weiß', unscharf: 'Über Unschärfe',
  schieben: 'Schieben ←', schiebenR: 'Schieben →', schiebenO: 'Schieben ↑', schiebenU: 'Schieben ↓', wischen: 'Wischen →', wischenL: 'Wischen ←', wischenU: 'Wischen ↓', wischenO: 'Wischen ↑',
  tuer: 'Tür auf', kreis: 'Kreis', raute: 'Raute', uhr: 'Uhrzeiger', jalousie: 'Jalousie', zoom: 'Hineinzoomen', drehen: 'Hereindrehen', pixel: 'Über Mosaik', stoerung: 'Bildstörung', wirbel: 'Wirbel' };

export const SCHRIFTEN = ['Oswald', 'Source Sans 3', 'Montserrat', 'Bebas Neue', 'Playfair Display', 'Dancing Script'];

export const FARBE_NEUTRAL = { hell: 0, kontrast: 0, saett: 0, waerme: 0, sepia: 0, vignette: 0, weich: 0 };

// Fertige Bildstile – setzen nur die Regler, alles bleibt danach frei verstellbar.
export const STILE = {
  natur: { name: 'Natürlich', w: {} },
  kraeftig: { name: 'Kräftig', w: { kontrast: 18, saett: 30 } },
  warm: { name: 'Warm', w: { waerme: 35, saett: 10, hell: 4 } },
  kuehl: { name: 'Kühl', w: { waerme: -35, kontrast: 8 } },
  klar: { name: 'Baustelle klar', w: { hell: 10, kontrast: 22, saett: 12 } },
  matt: { name: 'Matt', w: { kontrast: -18, saett: -15, hell: 8 } },
  sw: { name: 'Schwarzweiß', w: { saett: -100, kontrast: 15 } },
  alt: { name: 'Alt (Sepia)', w: { sepia: 70, kontrast: 8, vignette: 35 } },
  kino: { name: 'Kino', w: { kontrast: 28, saett: -10, vignette: 45, waerme: -10 } },
};

export const nr = () => Math.random().toString(36).slice(2, 10);
export const klemm = (v, a, b) => Math.min(b, Math.max(a, v));

export function neuesProjekt(name) {
  return {
    id: 'p' + nr(), name: name || 'Neues Video', format: 'quer', fps: 30, hintergrund: '#000000',
    clips: [], texte: [], ton: [],
    // Alle Zusatzfunktionen sind Schalter – Grundeinstellung AUS (Thomas, 13.11.2026).
    schalter: { logo: false, vorspann: false, abspann: false, musikLeiser: false, originalLeiser: false, untertitel: false, kiRohschnitt: false },
    logo: { ecke: 'or', groesse: 18, deck: 90 },
    untertitel: { groesse: 4.6, lage: 'unten', kasten: true, gross: false },
    // Erkannte Sprache je Medium (Zeiten in der Quelle, nicht im Film – so wandern die Untertitel beim Schneiden mit):
    // { [Medium-ID]: { zeilen: [{ a, b, text }], bereiche: [[von, bis], …] } }
    sprache: {},
    ki: { ziel: 60, art: 'baustelle', thema: '', quelle: 'auto' },
    vorspann: FREI ? { dauer: 3, logo: false, zeile1: 'Mein Film', zeile2: '' } : { dauer: 3, logo: true, zeile1: '', zeile2: '' },
    abspann: { dauer: 4, logo: false, zeile1: 'Danke fürs Zuschauen', zeile2: '' },
    erstellt: Date.now(), geaendert: Date.now(),
  };
}

export function neuerClip(m) {
  const bild = m.art === 'bild';
  return {
    id: 'c' + nr(), medium: m.id, art: bild ? 'bild' : 'video',
    ein: 0, aus: bild ? 0 : m.dauer, dauer: bild ? 4 : 0, tempo: 1,
    laut: 100, stumm: false, einbl: 0, ausbl: 0,
    passung: 'fuellen', hg: 'unscharf', zoom: 1, x: 0, y: 0, dreh: 0, spiegel: false, kb: false,
    farbe: { ...FARBE_NEUTRAL }, stil: 'natur',
    // Effekte (js/effekte.js) – alles aus: Bildeffekte { Kennung: Stärke }, Rahmen, Bewegung, Stellen im Bild, Farbe ändern
    fx: {}, rahmen: { art: 'keiner' }, bew: { art: 'keine', staerke: 50 }, stellen: [], umf: [],
    ueb: { art: 'keiner', dauer: 0.6 },
  };
}

export const TEXT_VORLAGEN = {
  titel: { name: 'Großer Titel', w: { text: 'Titel', y: 0.45, groesse: 10, schrift: 'Oswald', fett: true, schatten: true } },
  unterzeile: { name: 'Zeile unten', w: { text: 'Text unten', y: 0.86, groesse: 4.6, schrift: 'Source Sans 3', fett: true, kasten: true, kastenFarbe: '#000000', kastenDeck: 60 } },
  binde: { name: 'Bauchbinde rot', w: { text: 'Name · Ort', x: 0.06, y: 0.82, ausr: 'links', groesse: 4.4, schrift: 'Oswald', fett: true, kasten: true, kastenFarbe: '#C41E1E', kastenDeck: 100 } },
  hinweis: { name: 'Hinweis oben', w: { text: 'Hinweis', y: 0.1, groesse: 4, schrift: 'Montserrat', fett: true, kontur: true } },
  schoen: { name: 'Schreibschrift', w: { text: 'Schöne Grüße', y: 0.5, groesse: 9, schrift: 'Dancing Script', fett: true, schatten: true } },
};

export function neuerText(vorlage, start, dauer = 4) {
  const v = TEXT_VORLAGEN[vorlage] || TEXT_VORLAGEN.titel;
  return {
    id: 't' + nr(), text: 'Text', start, ende: start + dauer, x: 0.5, y: 0.5, ausr: 'mitte', groesse: 6,
    schrift: 'Oswald', farbe: '#FFFFFF', fett: false, kursiv: false,
    kasten: false, kastenFarbe: '#000000', kastenDeck: 60, kontur: false, schatten: false, anim: 'blende',
    ...v.w,
  };
}

export function neuerTon(m, start, rolle) {
  return { id: 'a' + nr(), medium: m.id, rolle: rolle || 'musik', start, ein: 0, aus: m.dauer, laut: rolle === 'sprecher' ? 100 : 60, einbl: 0, ausbl: rolle === 'sprecher' ? 0 : 1.5 };
}

/**
 * Legt Musik unter den ganzen Film: Ist der Film länger als das Stück, folgt es noch einmal – bei mehreren Stücken im Wechsel. Ändert p.ton.
 * @param stuecke  ein Medium oder mehrere (Art „ton“)
 * @param wunsch   Lautstärke 15 … 80; wird im Film gesprochen (Originalton in voller Lautstärke oder Sprecher), höchstens 40
 */
export function unterlegeMusik(p, stuecke, wunsch = 45) {
  const liste = (Array.isArray(stuecke) ? stuecke : [stuecke]).filter((m) => m && m.dauer > 1), lay = rechne(p);
  if (!liste.length || lay.dauer < 0.5) return 0;
  const gesprochen = p.clips.some((c) => !c.stumm && c.laut >= 100) || p.ton.some((a) => a.rolle === 'sprecher'), laut = klemm(Math.min(wunsch || 45, gesprochen ? 40 : 80), 15, 80);
  let n = 0;
  for (let t = 0; t < lay.dauer - 0.3 && n < 400; n++) {
    const m = liste[n % liste.length], a = neuerTon(m, t, 'musik'); a.aus = Math.min(m.dauer, lay.dauer - t); a.laut = laut; a.einbl = n ? 0.3 : 1;
    a.ausbl = t + (a.aus - a.ein) >= lay.dauer - 0.3 ? Math.min(2.5, lay.dauer / 4) : 0.3;
    p.ton.push(a); t += a.aus - a.ein;
  }
  return n;
}

export const dauerVon = (c) => c.art === 'video' ? Math.max(0.05, (c.aus - c.ein) / (c.tempo || 1)) : Math.max(0.2, c.dauer);

// Zeitleiste berechnen: Reihenfolge der Clips, Übergänge überlappen (der Film wird um die Übergangsdauer kürzer).
export function rechne(p) {
  const liste = [];
  if (p.schalter.vorspann) liste.push({ id: '__vorspann', art: 'karte', dauer: p.vorspann.dauer, karte: p.vorspann, ueb: { art: 'keiner', dauer: 0 }, einbl: 0, ausbl: 0 });
  for (const c of p.clips) liste.push(c);
  if (p.schalter.abspann) liste.push({ id: '__abspann', art: 'karte', dauer: p.abspann.dauer, karte: p.abspann, ueb: { art: p.clips.length ? 'blende' : 'keiner', dauer: 0.6 }, einbl: 0, ausbl: 0.5 });
  const segs = [];
  let t = 0, dVor = 0;
  liste.forEach((c, i) => {
    const d = dauerVon(c);
    let ueb = 0;
    if (i > 0 && c.ueb && c.ueb.art !== 'keiner') ueb = klemm(c.ueb.dauer, 0, Math.min(d, dVor) * 0.5);
    // Ein vorheriger Übergang darf sich mit diesem nicht überschneiden – dafür sorgt die Hälfte-Regel oben.
    const t0 = t - ueb;
    segs.push({ c, i, t0, t1: t0 + d, d, ueb });
    t = t0 + d; dVor = d;
  });
  return { segs, dauer: t, ut: p.schalter.untertitel ? untertitelZeilen(p, segs, t) : [] };
}

// ───────── Untertitel ─────────
// Die erkannte Sprache hängt an der Quelle (Video oder Sprecher-Aufnahme). Hier wird daraus berechnet, was im Film wann zu lesen ist.
// Gleiche Liste für Vorschau und Ausgabe.
export function untertitelZeilen(p, segs, dauer) {
  const aus = [];
  const nimm = (mid, qa, qb, t0, tempo, grenze) => {
    const sp = p.sprache && p.sprache[mid]; if (!sp || !sp.zeilen) return;
    sp.zeilen.forEach((z, i) => {
      const mitte = (z.a + z.b) / 2;
      if (!z.text || mitte < qa || mitte >= qb) return;
      const start = t0 + (Math.max(z.a, qa) - qa) / tempo, ende = Math.min(grenze, t0 + (Math.min(z.b, qb) - qa) / tempo);
      if (ende - start > 0.05) aus.push({ start, ende, text: z.text, medium: mid, i });
    });
  };
  for (const s of segs) { const c = s.c; if (c.art === 'video' && !c.stumm && c.laut !== 0) nimm(c.medium, c.ein, c.aus, s.t0, c.tempo || 1, s.t1); }
  for (const a of p.ton) if (a.rolle === 'sprecher' && a.laut !== 0) nimm(a.medium, a.ein, a.aus, a.start, 1, Math.min(dauer, a.start + tonDauer(a)));
  aus.sort((x, y) => x.start - y.start);
  for (let i = 0; i < aus.length - 1; i++) if (aus[i].ende > aus[i + 1].start - 0.02) aus[i].ende = Math.max(aus[i].start + 0.05, aus[i + 1].start - 0.02);
  return aus;
}

const fasse = (liste) => {            // Bereiche [von, bis] sortieren und zusammenlegen
  const s = liste.filter((b) => b[1] > b[0]).map((b) => [b[0], b[1]]).sort((x, y) => x[0] - y[0]), aus = [];
  for (const b of s) { const l = aus[aus.length - 1]; if (l && b[0] <= l[1] + 0.05) l[1] = Math.max(l[1], b[1]); else aus.push(b); }
  return aus;
};

// Welche Stellen welcher Quelle sind im Film zu hören? → Map Medium-ID → [[von, bis], …]
export function sprechStellen(p, segs) {
  const m = new Map(), dazu = (id, a, b) => { if (!m.has(id)) m.set(id, []); m.get(id).push([a, b]); };
  for (const s of segs) { const c = s.c; if (c.art === 'video' && !c.stumm && c.laut !== 0) dazu(c.medium, c.ein, c.aus); }
  for (const a of p.ton) if (a.rolle === 'sprecher' && a.laut !== 0) dazu(a.medium, a.ein, a.aus);
  for (const [id, l] of m) m.set(id, fasse(l));
  return m;
}

// Für welche dieser Stellen fehlt die Spracherkennung noch? → [{ medium, von, bis }]
export function fehlendeStellen(p, segs) {
  const aus = [];
  for (const [id, stellen] of sprechStellen(p, segs)) {
    const da = fasse((p.sprache && p.sprache[id] && p.sprache[id].bereiche) || []);
    for (const [a, b] of stellen) {
      let von = a;
      for (const [c, d] of da) { if (d <= von || c >= b) continue; if (c - von > 0.6) aus.push({ medium: id, von, bis: c }); von = Math.max(von, d); }
      if (b - von > 0.6) aus.push({ medium: id, von, bis: b });
    }
  }
  return aus;
}

// Neu erkannte Zeilen einer Stelle [von, bis] in die gespeicherte Sprache eines Mediums einfügen (alte Zeilen dieser Stelle werden ersetzt).
export function merkeSprache(p, mediumId, von, bis, zeilen) {
  if (!p.sprache) p.sprache = {};
  const sp = p.sprache[mediumId] || (p.sprache[mediumId] = { zeilen: [], bereiche: [] });
  sp.zeilen = sp.zeilen.filter((z) => { const mitte = (z.a + z.b) / 2; return mitte < von || mitte >= bis; }).concat(zeilen.filter((z) => { const mitte = (z.a + z.b) / 2; return mitte >= von && mitte < bis; })).sort((x, y) => x.a - y.a);
  sp.bereiche = fasse(sp.bereiche.concat([[von, bis]]));
}

// Gleiche Regel für Vorschau und Ausgabe: Welcher Abschnitt ist zur Zeit t sichtbar?
export const istAktiv = (s, t) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6;
export function aktive(lay, t) { const r = []; for (const s of lay.segs) if (istAktiv(s, t)) r.push(s); return r; }
export const quellZeit = (s, t) => s.c.ein + (t - s.t0) * (s.c.tempo || 1);
export const tonDauer = (a) => Math.max(0.05, a.aus - a.ein);

// Wie stark die Musik / der Originalton zurückgenommen wird, während ein Sprecher läuft (weiche Rampe 0,4 s).
function sprecherNaehe(p, t) {
  let f = 1;
  for (const a of p.ton) {
    if (a.rolle !== 'sprecher') continue;
    const e = a.start + tonDauer(a);
    const abstand = t < a.start ? a.start - t : t > e ? t - e : 0;
    f = Math.min(f, abstand >= 0.4 ? 1 : 0.22 + 0.78 * (abstand / 0.4));
  }
  return f;
}

// Lautstärke des Originaltons eines Abschnitts zur Zeit t (1 = normal).
export function pegelSeg(p, lay, s, t) {
  const c = s.c;
  if (c.art !== 'video' || c.stumm) return 0;
  let g = c.laut / 100;
  const rel = t - s.t0, rest = s.t1 - t;
  if (rel < 0 || rest < 0) return 0;
  if (s.ueb > 0 && rel < s.ueb) g *= rel / s.ueb;
  const n = lay.segs[s.i + 1];
  if (n && n.ueb > 0 && t >= n.t0) g *= Math.max(0, 1 - (t - n.t0) / n.ueb);
  if (c.einbl > 0 && rel < c.einbl) g *= rel / c.einbl;
  if (c.ausbl > 0 && rest < c.ausbl) g *= rest / c.ausbl;
  if (p.schalter.originalLeiser) g *= sprecherNaehe(p, t);
  return Math.max(0, g);
}

// Lautstärke eines Tonstücks (Musik, Sprecher) zur Zeit t.
export function pegelTon(p, a, t) {
  const rel = t - a.start, rest = a.start + tonDauer(a) - t;
  if (rel < 0 || rest < 0) return 0;
  let g = a.laut / 100;
  if (a.einbl > 0 && rel < a.einbl) g *= rel / a.einbl;
  if (a.ausbl > 0 && rest < a.ausbl) g *= rest / a.ausbl;
  if (a.rolle === 'musik' && p.schalter.musikLeiser) g *= sprecherNaehe(p, t);
  return Math.max(0, g);
}

export function zeitText(s, mitZehntel = true) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60), r = s - m * 60;
  const sek = mitZehntel ? r.toFixed(1).padStart(4, '0').replace('.', ',') : String(Math.floor(r)).padStart(2, '0');
  return m + ':' + sek;
}

// Ältere gespeicherte Projekte auf den aktuellen Stand bringen (fehlende Felder ergänzen).
export function pflege(p) {
  const n = neuesProjekt(p.name);
  for (const k of Object.keys(n)) if (p[k] === undefined) p[k] = n[k];
  p.schalter = { ...n.schalter, ...p.schalter };
  p.logo = { ...n.logo, ...p.logo }; p.vorspann = { ...n.vorspann, ...p.vorspann }; p.abspann = { ...n.abspann, ...p.abspann };
  p.untertitel = { ...n.untertitel, ...p.untertitel }; p.ki = { ...n.ki, ...p.ki }; if (!p.sprache || typeof p.sprache !== 'object') p.sprache = {};
  for (const c of p.clips) {
    c.farbe = { ...FARBE_NEUTRAL, ...c.farbe }; if (!c.ueb) c.ueb = { art: 'keiner', dauer: 0.6 };
    if (!c.fx || typeof c.fx !== 'object') c.fx = {}; if (!c.rahmen) c.rahmen = { art: 'keiner' }; if (!c.bew) c.bew = { art: 'keine', staerke: 50 };
    if (!Array.isArray(c.stellen)) c.stellen = []; if (!Array.isArray(c.umf)) c.umf = [];
  }
  return p;
}
