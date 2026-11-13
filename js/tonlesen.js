// TW Schnittraum – Ton einer Datei so lesen, dass Lücken in den Zeitstempeln erhalten bleiben.
//
// Worum es geht: In manchen Aufnahmen springt der Zeitstempel mitten in der Tonspur (Lücke – etwa bei zusammengesetzten oder pausierten
// Aufnahmen). In der Datei steht dann ein Tonpaket mit überlanger Dauer. Der Decoder des Browsers (Chrome) zählt die Zeit aber einfach
// weiter – der Ton hinter der Lücke läge um die Lücke zu früh. Andere Browser reichen die Zeit der Pakete durch; dann stimmt sie schon.
// Deshalb: Lücken vorab aus den Paket-Zeiten lesen (kein Ton, nur Zeiten) und beim Lesen an jeder Lücke nachsehen, ob der Decoder
// gesprungen ist – wenn nicht, die Lücke selbst dazuzählen. Dateien ohne Lücke (der Normalfall) laufen unverändert durch.
// Gemeinsam für Ausgabe und Spracherkennung.

const SCHUTZ = 0.5;        // so weit hinter einer Lücke beginnt das Lesen sicher mit richtiger Zeit (der Decoder holt ein Paket Anlauf)
const SUCHZEIT = 2000;     // ms – länger wird nicht nach Lücken gesucht (sehr lange oder ungewöhnlich gebaute Dateien)

/** Lücken einer Tonspur: { normal: Sekunden je Paket, stellen: [{ a, b }] } – a = Ende des Tons vor der Lücke, b = Beginn des Tons danach (Dateizeit). */
export async function tonLuecken(M, spur) {
  const aus = { normal: 0, stellen: [] };
  try {
    const senke = new M.EncodedPacketSink(spur), anfang = [], t0 = performance.now(); let normal = 0, vor = null, n = 0;
    const pruefe = (p, q) => { if (p.duration > normal * 1.5 + 0.004) aus.stellen.push({ a: p.timestamp + normal, b: q ? q.timestamp : p.timestamp + p.duration }); };
    for await (const p of senke.packets(undefined, undefined, { metadataOnly: true })) {
      const jetzt = { timestamp: p.timestamp, duration: p.duration };
      if (!normal) {                                           // die übliche Paketdauer aus den ersten Paketen (mittlerer Wert)
        anfang.push(jetzt);
        if (anfang.length === 33) { normal = anfang.map((x) => x.duration).sort((x, y) => x - y)[16]; if (!(normal > 0)) return aus; for (let i = 0; i < 32; i++) pruefe(anfang[i], anfang[i + 1]); }
      } else if (vor) pruefe(vor, jetzt);
      vor = jetzt;
      if ((++n & 1023) === 0 && performance.now() - t0 > SUCHZEIT) { vor = null; break; }
    }
    if (normal && vor) pruefe(vor, null);
    aus.stellen = aus.stellen.filter((L) => L.b - L.a > 0.004); aus.normal = normal;
  } catch (e) { console.warn('Tonlücken nicht lesbar', e); aus.stellen = []; }
  return aus;
}

/** Wie senke.buffers(von, bis) – aber jedes Stück trägt seine richtige Zeit, auch hinter einer Lücke. */
export async function* tonPuffer(senke, luecken, von, bis) {
  const L = (luecken && luecken.stellen) || [];
  if (!L.length || !(luecken.normal > 0)) { yield* senke.buffers(von, bis); return; }
  const tol = Math.min(0.002, luecken.normal / 4);
  let k = -1; for (let i = 0; i < L.length && L[i].a <= von; i++) k = i;      // letzte Lücke, die vor „von" beginnt
  let anker = von, m = k + 1;
  if (k >= 0 && von < L[k].b + SCHUTZ) {                                       // „von" liegt in oder dicht hinter einer Lücke: im Paket davor ansetzen und die Lücke mitzählen
    while (k > 0 && L[k].a - L[k - 1].b < SCHUTZ) k--;
    anker = L[k].a - luecken.normal / 2; m = k;
  }
  let schub = 0;                                                               // so viel Lücke hat der Decoder bisher verschluckt
  for await (const st of senke.buffers(anker, bis)) {
    while (m < L.length && st.timestamp + schub >= L[m].a - tol) {             // dieses Stück liegt hinter der Lücke m
      if (st.timestamp + schub < (L[m].a + L[m].b) / 2) schub += L[m].b - L[m].a;   // Decoder ist nicht gesprungen → Lücke dazuzählen
      m++;
    }
    const t = st.timestamp + schub;
    if (t >= bis - 1e-6) break;
    if (t + st.duration <= von + 1e-6) continue;
    yield schub ? { buffer: st.buffer, timestamp: t, duration: st.duration } : st;
  }
}
