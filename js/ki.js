// Gemeinsame Helfer und der einfache Rohschnitt ohne KI – dieser Teil steckt auch in der kostenlosen Fassung.
const MAX_BILDER = 48, KANTE = 384;
const klemm = (v, a, b) => Math.min(b, Math.max(a, v));
const sek = (s) => (Math.round(s * 10) / 10).toFixed(1).replace('.', ',') + ' s';

/** Wie viele Standbilder je Medium (zusammen höchstens 48)? */
export function planeBilder(liste) {
  const wunsch = liste.map(({ m }) => (m.art === 'bild' ? 1 : klemm(Math.ceil((m.dauer || 0) / 4), 2, 10))), summe = wunsch.reduce((a, b) => a + b, 0);
  if (summe <= MAX_BILDER) return wunsch;
  const k = MAX_BILDER / summe; return wunsch.map((n) => Math.max(1, Math.floor(n * k)));
}

/** Grobe Schätzung vor dem Absenden: Bilder, Token und Kosten (Stufe „standard“). */
export function schaetze(liste) {
  const bilder = planeBilder(liste).reduce((a, b) => a + b, 0), text = liste.reduce((n, { zeilen }) => n + (zeilen || []).reduce((k, z) => k + z.text.length, 0), 0);
  const ein = bilder * 120 + 900 + liste.length * 40 + Math.round(text / 3), aus = 400 + liste.length * 60;
  return { bilder, token: ein + aus, cent: Math.max(1, Math.round((ein * 2 + aus * 10) / 1e6 * 100 * 10) / 10) };
}

/** Rohschnitt ohne KI: alle Clips in der Reihenfolge der Aufnahme, jeweils der mittlere Teil – gesprochene Sätze bleiben ganz. */
export function rohschnittEinfach(liste, ziel) {
  const folge = [...liste].sort((x, y) => (x.m.geaendert || 0) - (y.m.geaendert || 0) || x.m.name.localeCompare(y.m.name, 'de', { numeric: true }));
  const je = klemm(ziel / Math.max(1, folge.length), 2, 8), szenen = [];
  for (const { m, zeilen } of folge) {
    if (m.art === 'bild') { szenen.push({ medium: m.id, von: 0, bis: 3, grund: 'Foto' }); continue; }
    const d = Math.min(je, m.dauer); let von = Math.max(0, (m.dauer - d) / 2), bis = von + d;
    const drin = (zeilen || []).filter((z) => z.b > von && z.a < bis);
    if (drin.length) { von = Math.max(0, Math.min(von, drin[0].a - 0.15)); bis = Math.min(m.dauer, Math.max(bis, drin[drin.length - 1].b + 0.15)); }
    if (bis - von >= 0.4) szenen.push({ medium: m.id, von: Math.round(von * 100) / 100, bis: Math.round(bis * 100) / 100, grund: drin.length ? 'mittlerer Teil, Satz bleibt ganz' : 'mittlerer Teil' });
  }
  return { titel: '', kurz: 'Einfacher Rohschnitt ohne KI: alle Clips in der Reihenfolge der Aufnahme, jeweils der mittlere Teil.', szenen, ki: false };
}

