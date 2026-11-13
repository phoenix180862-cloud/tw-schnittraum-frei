// Päckchen 6 (TW Schnittraum) freischalten – erst ausführen, wenn die öffentliche Geschenk-Fassung der App steht.
// Läuft im Browser im Telekom-Homepage-Center auf den Texten der Dateien vom Webspace (wie patch_2026-11-13.js).
// ADRESSE = Adresse der Geschenk-Fassung, z. B. https://phoenix180862-cloud.github.io/tw-schnittraum-frei/
window.twPaeckchen6 = function (texte, ADRESSE) {
  const neu = {};
  const einmal = (p, t, alt, ersatz) => {
    const n = t.split(alt).length - 1;
    if (n !== 1) throw new Error(p + ': erwartet 1x, gefunden ' + n + 'x: ' + alt.slice(0, 70));
    return t.replace(alt, () => ersatz);
  };
  // Weihnachtsseite: sechs Geschenke, neue Kachel, am PC drei Kacheln je Reihe
  let w = texte['weihnachten.html'];
  w = einmal('weihnachten.html', w, 'fünf kostenlose Programme von Thomas Willwacher Fliesenlegermeister e.K. – Kochbuch, Einkaufsliste, Bildstudio, TW-CAD und Renovierungs-App.',
    'sechs kostenlose Programme von Thomas Willwacher Fliesenlegermeister e.K. – Kochbuch, Einkaufsliste, Bildstudio, TW-CAD, Renovierungs-App und Schnittraum.');
  w = einmal('weihnachten.html', w, 'Fünf kostenlose Programme für zu Hause: Kochbuch, Zeichenprogramm, Bildstudio, Einkaufsliste und Renovierungs-App.',
    'Sechs kostenlose Programme für zu Hause: Kochbuch, Zeichenprogramm, Bildstudio, Einkaufsliste, Renovierungs-App und Videoschnitt.');
  w = einmal('weihnachten.html', w, '<h1>Fünf kleine Geschenke von uns.</h1>', '<h1>Sechs kleine Geschenke von uns.</h1>');
  w = einmal('weihnachten.html', w, 'fünf Programme für zu Hause', 'sechs Programme für zu Hause');
  w = einmal('weihnachten.html', w, 'für 51 Arbeiten rund ums Haus.</p><span class="go">Ansehen und auspacken →</span></a></div>',
    'für 51 Arbeiten rund ums Haus.</p><span class="go">Ansehen und auspacken →</span></a>' +
    '<a class="gift" href="geschenk-schnittraum.html"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF5A5F" aria-hidden="true" style="stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="M4 9h16v10H4zM4 9l1.6-4.2 14.9 2.1L20 9M8.2 5.4L9.6 9M13 6.1L14.4 9M10.4 12v4l3.6-2z"></path></svg>' +
    '<div class="gt">Geschenk 6 · Film</div><div class="gn">TW Schnittraum</div>' +
    '<p>Handyvideos schneiden, vertonen und beschriften – fertig als Clip für YouTube, Instagram und Facebook. Alles bleibt auf Ihrem Gerät.</p>' +
    '<span class="go">Ansehen und auspacken →</span></a></div>');
  w = einmal('weihnachten.html', w, '.xm-glocke{', '@media (min-width:1000px){.gifts{grid-template-columns:repeat(3,minmax(0,1fr))}}\n.xm-glocke{');
  neu['weihnachten.html'] = w;
  // Sitemap und Service-Seite
  neu['sitemap.xml'] = einmal('sitemap.xml', texte['sitemap.xml'], '  <url><loc>https://www.thomas-willwacher.de/geschenk-renovierung.html</loc></url>\n',
    '  <url><loc>https://www.thomas-willwacher.de/geschenk-renovierung.html</loc></url>\n  <url><loc>https://www.thomas-willwacher.de/geschenk-schnittraum.html</loc></url>\n');
  neu['service.html'] = einmal('service.html', texte['service.html'], 'Kochbuch, Einkaufsliste, Bildstudio, TW-CAD und die Renovierungs-App – finden Sie',
    'Kochbuch, Einkaufsliste, Bildstudio, TW-CAD, die Renovierungs-App und der TW Schnittraum – finden Sie');
  // Zählpunkt (neue Datei app/schnittraum/index.html)
  neu['app/schnittraum/index.html'] = '<!doctype html>\n<html lang="de"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>TW Schnittraum wird geöffnet – Thomas Willwacher Fliesenlegermeister e.K.</title>\n<meta name="robots" content="noindex, nofollow">\n<meta http-equiv="refresh" content="0; url=' + ADRESSE + '">\n<script>location.replace(\'' + ADRESSE + '\');</script>\n</head><body style="margin:0;background:#0B0B0B;color:#fff;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">\n<p>TW Schnittraum wird geöffnet … <a href="' + ADRESSE + '" style="color:#FF5A5F">Weiter</a></p>\n</body></html>\n';
  return neu;
  // Dazu neu hochladen: geschenk-schnittraum.html, assets/img/apps/schnittraum-*.jpg, assets/img/og/og-schnittraum.jpg
  // Datenschutz (Abschnitt 4) erst nach Thomas' Freigabe ergänzen – Wortlaut siehe Protokoll.
};
