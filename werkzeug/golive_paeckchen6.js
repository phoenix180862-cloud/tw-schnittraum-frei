// Päckchen 6 (TW Schnittraum) online stellen – läuft im Browser im Telekom-Homepage-Center (gleiche Herkunft wie /webdav/).
// Voraussetzung: window.twPaeckchen6 aus patch_paeckchen6.js ist geladen.
//   ROH     = Adresse, unter der die neuen Dateien bereitliegen (Zweig „webseite“ des Geschenk-Repos), endet mit „/“
//   ADRESSE = Adresse der kostenlosen Fassung, z. B. https://phoenix180862-cloud.github.io/tw-schnittraum-frei/
//   tun     = false: nur prüfen und berichten (nichts wird geschrieben) · true: sichern, schreiben, gegenlesen
// Nichts wird gelöscht; die bisherigen Fassungen der geänderten Seiten kommen vorher in den nicht öffentlichen Bereich.
window.twGoLive6 = async function (ROH, ADRESSE, tun) {
  const W = '/webdav/public_html/', S = '/webdav/temp/sicherung_' + new Date().toISOString().slice(0, 10) + '_paeckchen-6/', log = [];
  const NEU = ['geschenk-schnittraum.html', 'assets/img/og/og-schnittraum.jpg',
    ...['00-pc', '01-mediathek', '02-schneiden', '03-text', '04-ton', '05-ausgabe', '06-tablet', '07-handy', '08-untertitel'].map((n) => 'assets/img/apps/schnittraum-' + n + '.jpg')];
  const AENDERN = ['weihnachten.html', 'sitemap.xml', 'service.html', 'datenschutz.html'];
  const gleich = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const lies = async (p) => { const r = await fetch(W + p + '?nc=' + Date.now(), { credentials: 'include', cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
  const lege = async (pfad, bytes) => { const r = await fetch(pfad, { method: 'PUT', credentials: 'include', body: new Blob([bytes]) }); if (![200, 201, 204].includes(r.status)) throw new Error('Schreiben fehlgeschlagen (' + r.status + '): ' + pfad); return r.status; };
  const ordner = async (pfad) => { const da = await fetch(pfad, { method: 'PROPFIND', credentials: 'include', headers: { Depth: '0' } }); if (da.status === 207) return; const r = await fetch(pfad, { method: 'MKCOL', credentials: 'include' }); if (![201, 405].includes(r.status)) throw new Error('Ordner nicht anlegbar (' + r.status + '): ' + pfad); };
  const text = (b) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b);
  const einmal = (p, t, alt, ersatz) => { const n = t.split(alt).length - 1; if (n !== 1) throw new Error(p + ': erwartet 1x, gefunden ' + n + 'x: ' + alt.slice(0, 70)); return t.replace(alt, () => ersatz); };

  // 1) Neue Dateien holen (alles oder nichts)
  const neu = {};
  for (const p of NEU) {
    const r = await fetch(ROH + p + '?nc=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('Bereitgestellte Datei fehlt (' + r.status + '): ' + p);
    neu[p] = new Uint8Array(await r.arrayBuffer());
    if (neu[p].length < 20000) throw new Error('Bereitgestellte Datei auffällig klein: ' + p + ' (' + neu[p].length + ' Bytes)');
  }
  const seite = text(neu['geschenk-schnittraum.html']);
  for (const wort of ['Objektbereich', 'Privathaushalt']) if (seite.includes(wort)) throw new Error('Geschenk-Seite enthält „' + wort + '“');
  if (!seite.includes('href="app/schnittraum/"')) throw new Error('Geschenk-Seite: Knopf zur App fehlt');

  // 2) Bestehende Seiten lesen und ändern (jede Ersetzung muss genau einmal treffen)
  const alt = {}, texte = {};
  for (const p of AENDERN) { alt[p] = await lies(p); if (!alt[p]) throw new Error('Nicht lesbar: ' + p); texte[p] = text(alt[p]); }
  const schon = texte['weihnachten.html'].includes('geschenk-schnittraum.html');
  if (schon) log.push('Weihnachtsseite zeigt Päckchen 6 schon – die vier Seiten bleiben, wie sie sind.');
  const geaendert = schon ? {} : window.twPaeckchen6(texte, ADRESSE);
  if (!schon) {
    let d = texte['datenschutz.html'];
    d = einmal('datenschutz.html', d, 'TW-CAD, TW Bildstudio und die Einkaufsliste.', 'TW-CAD, TW Bildstudio, TW Schnittraum und die Einkaufsliste.');
    d = einmal('datenschutz.html', d, 'ohne sie bleibt das Kochbuch voll nutzbar.</p>',
      'ohne sie bleibt das Kochbuch voll nutzbar.</p>\n<p><strong>TW Schnittraum:</strong> Videos, Fotos, Musik und Sprachaufnahmen bleiben auf Ihrem Gerät; das Mikrofon wird nur verwendet, wenn Sie eine Sprecher-Aufnahme starten.' + (window.TW_DS_UNTERTITEL ? ' ' + window.TW_DS_UNTERTITEL : '') + '</p>');
    geaendert['datenschutz.html'] = d;
    for (const [p, t] of Object.entries(geaendert)) for (const wort of ['Objektbereich', 'Privathaushalt']) if (t.includes(wort)) throw new Error(p + ' enthält „' + wort + '“');
  }
  const zaehler = '<!doctype html>\n<html lang="de"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>TW Schnittraum wird geöffnet – Thomas Willwacher Fliesenlegermeister e.K.</title>\n<meta name="robots" content="noindex, nofollow">\n<meta http-equiv="refresh" content="0; url=' + ADRESSE + '">\n<script>location.replace(\'' + ADRESSE + '\');</script>\n</head><body style="margin:0;background:#0B0B0B;color:#fff;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">\n<p>TW Schnittraum wird geöffnet … <a href="' + ADRESSE + '" style="color:#FF5A5F">Weiter</a></p>\n</body></html>\n';
  geaendert['app/schnittraum/index.html'] = zaehler;
  log.push('Neu: ' + NEU.length + ' Dateien, zusammen ' + Math.round(Object.values(neu).reduce((n, b) => n + b.length, 0) / 1024) + ' kB · geändert: ' + Object.keys(geaendert).join(', '));
  if (!tun) { log.push('NUR GEPRÜFT – es wurde nichts geschrieben.'); return log.join('\n'); }

  // 3) Sichern (bisherige Fassungen), dann schreiben und Byte für Byte gegenlesen
  await ordner(S);
  for (const p of AENDERN) if (geaendert[p]) { await lege(S + p, alt[p]); }
  for (const o of ['app/', 'app/schnittraum/', 'assets/img/og/', 'assets/img/apps/']) await ordner(W + o);
  const schreib = async (p, bytes) => { const st = await lege(W + p, bytes); const g = await lies(p); const ok = !!g && gleich(g, bytes); log.push((ok ? 'ok   ' : 'FEHLER ') + p + ' · ' + bytes.length + ' Bytes · PUT ' + st); if (!ok) throw new Error('Gegenlesen fehlgeschlagen: ' + p + '\n' + log.join('\n')); };
  for (const p of NEU) if (p !== 'geschenk-schnittraum.html') await schreib(p, neu[p]);            // erst die Bilder,
  await schreib('geschenk-schnittraum.html', neu['geschenk-schnittraum.html']);                     // dann die Seite,
  await schreib('app/schnittraum/index.html', new TextEncoder().encode(zaehler));                   // der Zählpunkt
  for (const p of ['datenschutz.html', 'sitemap.xml', 'service.html', 'weihnachten.html']) if (geaendert[p]) await schreib(p, new TextEncoder().encode(geaendert[p]));   // und zuletzt die Kachel auf der Weihnachtsseite
  log.push('Sicherung der bisherigen Seiten: ' + S);
  return log.join('\n');
};
