// TW Schnittraum – Service Worker: Netz zuerst (immer die neueste Fassung), Zwischenspeicher nur, wenn kein Netz da ist.
// Den Hinweis „Neue Version … – jetzt aktualisieren“ zeigt lib/tw-version.js (vergleicht <meta name="tw-version"> der index.html).
// Bei jeder Veröffentlichung STAND zusammen mit der Versionsnummer in index.html erhöhen.
const STAND = 'tw-schnittraum-1.6.0';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('tw-schnittraum-') && n !== STAND).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // „Teilen“ vom Handy: Die eingerichtete App steht im Teilen-Menü (manifest.json › share_target). Geteilte Videos, Fotos und Tondateien
  // legt der Service Worker kurz im Gerät ab; die App holt sie beim Start in ihre Mediathek (js/quellen.js › geteiltes).
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/teilen')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), c = await caches.open('tw-sr-geteilt'); let n = 0;
        for (const f of fd.getAll('medien')) {
          if (!f || typeof f === 'string' || !f.size) continue;
          await c.put(new Request('geteilt/' + Date.now() + '-' + (++n)), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'Geteilt'), 'x-zeit': String(f.lastModified || Date.now()) } }));
        }
      } catch (err) { /* die App startet trotzdem */ }
      return Response.redirect('./?geteilt=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/geteilt/')) return;          // abgelegte geteilte Dateien liest die App selbst
  if (u.searchParams.has('twv')) return;                 // Versionsprüfung nie zwischenspeichern
  if (u.pathname.includes('/hilfe/videos/')) return;     // Hilfe-Filme nicht im Gerät ablegen
  if (u.pathname.includes('/lib/sprache/') || u.pathname.includes('/lib/ort/')) return;   // Sprachmodell: legt die Spracherkennung selbst dauerhaft ab
  if (e.request.headers.has('range')) return;            // Teilabrufe (Medien) direkt durchlassen
  e.respondWith(fetch(e.request).then(r => { if (r.ok && r.type === 'basic') { const k = r.clone(); caches.open(STAND).then(c => c.put(e.request, k)).catch(() => {}); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
