// TW Schnittraum – kleine Bausteine der Oberfläche: Elemente bauen, Antipp-Auswahl, Regler, Schalter, Fenster, Meldungen.
// Grundsatz „Antippen statt Tippen“: Wo es nur wenige Möglichkeiten gibt, werden sie zum Antippen gezeigt.

export function h(tag, a, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') { for (const [n, w] of Object.entries(v)) { if (n.startsWith('--')) e.style.setProperty(n, w); else e.style[n] = w; } }
    else if (k === 'value' && tag === 'textarea') e.value = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') { if (k in e) e[k] = v; else e.setAttribute(k, ''); }
    else e.setAttribute(k, v);
  }
  for (const k of kinder.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

// Antipp-Auswahl: optionen = [[wert, text, hinweis?, stil?]]
export function chips(optionen, wert, beiWahl) {
  const d = h('div', { class: 'chips' });
  for (const [w, text, hinweis, stil] of optionen) {
    d.append(h('button', { type: 'button', class: 'chip' + (w === wert ? ' an' : ''), title: hinweis, style: stil, 'aria-pressed': String(w === wert), onclick: () => { for (const k of d.children) { k.classList.remove('an'); k.setAttribute('aria-pressed', 'false'); } const b = d.children[optionen.findIndex(o => o[0] === w)]; b.classList.add('an'); b.setAttribute('aria-pressed', 'true'); beiWahl(w); } }, text));
  }
  return d;
}

// Mehrere an/aus zum Antippen: optionen = [[schluessel, text, an]]
export function haken(optionen, beiWechsel) {
  const d = h('div', { class: 'chips' });
  for (const [k, text, an] of optionen) {
    const b = h('button', { type: 'button', class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(!!an), onclick: () => { const neu = !b.classList.contains('an'); b.classList.toggle('an', neu); b.setAttribute('aria-pressed', String(neu)); beiWechsel(k, neu); } }, text);
    d.append(b);
  }
  return d;
}

let zaehler = 0;
// Schieberegler. o: { min, max, schritt, zeige(v) → Text, std (Doppelklick auf die Beschriftung stellt zurück) }
export function regler(beschriftung, wert, o, beiEingabe, beiFest) {
  const id = 'r' + (++zaehler), zeige = o.zeige || ((v) => String(v));
  const aus = h('output', { for: id }, zeige(wert));
  const inp = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.schritt || 1, value: wert,
    oninput: () => { const v = Number(inp.value); aus.textContent = zeige(v); beiEingabe(v); },
    onchange: () => beiFest && beiFest() });
  const lab = h('label', { for: id, title: o.std != null ? 'Doppelklick stellt zurück' : null, ondblclick: () => { if (o.std == null) return; inp.value = o.std; aus.textContent = zeige(o.std); beiEingabe(o.std); if (beiFest) beiFest(); } }, beschriftung);
  return h('div', { class: 'regler' }, lab, inp, aus);
}

export function schalter(titel, text, an, beiWechsel, zu = false) {
  const inp = h('input', { type: 'checkbox', checked: !!an, disabled: zu, onchange: () => beiWechsel(inp.checked) });
  return h('label', { class: 'schalter' + (zu ? ' zu' : '') }, inp, h('span', { class: 'knopf' }), h('span', { class: 'txt' }, h('b', {}, titel), text ? h('small', {}, text) : null));
}

export function farbwahl(farben, wert, beiWahl) {
  const d = h('div', { class: 'farbwahl' });
  const gleich = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const setze = (f) => { for (const k of d.querySelectorAll('button')) k.classList.toggle('an', gleich(k.dataset.f, f)); frei.value = /^#[0-9a-f]{6}$/i.test(f) ? f : '#ffffff'; };
  for (const [f, name] of farben) d.append(h('button', { type: 'button', 'data-f': f, title: name, 'aria-label': name, style: { background: f }, onclick: () => { setze(f); beiWahl(f, true); } }));
  const frei = h('input', { type: 'color', title: 'Eigene Farbe', 'aria-label': 'Eigene Farbe', oninput: () => { for (const k of d.querySelectorAll('button')) k.classList.remove('an'); beiWahl(frei.value, false); }, onchange: () => beiWahl(frei.value, true) });
  d.append(frei); setze(wert);
  return d;
}

export function meldung(text, fehler = false, ms = 4600) {
  const m = h('div', { class: 'meldung' + (fehler ? ' fehler' : ''), role: fehler ? 'alert' : 'status' }, text);
  document.getElementById('meldungen').append(m);
  setTimeout(() => m.remove(), fehler ? Math.max(ms, 7000) : ms);
}

// Fenster in der App (kein Browser-Dialog). Rückgabe: { zu(), inhalt, fuss }
export function fenster(titel, o = {}) {
  const inhalt = h('div', { class: 'dlg-inhalt' }), fuss = h('div', { class: 'dlg-fuss' });
  const kasten = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel, style: o.breite ? { '--b': o.breite + 'px' } : null });
  const hinter = h('div', { class: 'dlg-hinter' }, kasten);
  let offen = true;
  const zu = () => { if (!offen) return; offen = false; hinter.remove(); document.removeEventListener('keydown', taste, true); if (o.beiZu) o.beiZu(); };
  const taste = (ev) => { if (ev.key === 'Escape' && !o.fest) { ev.stopPropagation(); zu(); } };
  const kreuz = h('button', { class: 'ib', title: 'Schließen (Esc)', 'aria-label': 'Schließen', hidden: !!o.fest, onclick: () => { if (!o.fest) zu(); } }, '✕');
  kasten.append(h('div', { class: 'dlg-kopf' }, h('h2', {}, titel), kreuz), inhalt, fuss);
  hinter.addEventListener('pointerdown', (ev) => { if (ev.target === hinter && !o.fest) zu(); });
  document.addEventListener('keydown', taste, true);
  document.getElementById('dialoge').append(hinter);
  return { zu, inhalt, fuss, kasten, sperre(b) { o.fest = b; kreuz.hidden = b; } }; // gesperrt = lässt sich nicht versehentlich schließen (z. B. während der Ausgabe)
}

// Rückfrage „Wirklich?“ – als eigenes Fenster, damit nichts aus Versehen verschwindet.
export function frage(titel, text, jaText = 'Ja') {
  return new Promise((ok) => {
    const f = fenster(titel, { breite: 440, beiZu: () => ok(false) });
    f.inhalt.append(h('p', { style: { margin: '4px 0' } }, text));
    f.fuss.append(h('button', { class: 'btn', onclick: () => f.zu() }, 'Abbrechen'), h('button', { class: 'btn primaer', onclick: () => { ok(true); f.zu(); } }, jaText));
  });
}

export const prozent = (v) => Math.round(v) + ' %';
export const sekunden = (v) => v.toFixed(1).replace('.', ',') + ' s';
export const mitVorzeichen = (v) => (v > 0 ? '+' : '') + Math.round(v);
