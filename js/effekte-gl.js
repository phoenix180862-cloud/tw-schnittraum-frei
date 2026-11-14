// TW Schnittraum – Rechenstufe für Bildeffekte (WebGL). Ein einziges Programm rechnet alle Effekte, die Bildpunkt für Bildpunkt arbeiten:
// Verzerren → Bild lesen → Kanten und Schärfe → Unschärfe und Leuchten → Stellen im Bild (unkenntlich machen) → Farbe ändern → Farbe und Korn → abdecken, hervorheben.
// Alle Maße hängen an der Bildhöhe, nicht an Bildpunkten – die kleine Vorschau und die große Ausgabe sehen deshalb gleich aus.
// Geht etwas nicht (kein WebGL), liefert glBild null und das Bild bleibt unverändert.
import { GL_FX } from './effekte.js';

let gl = null, flaeche = null, prog = null, U = null, progs = [null, null], kopf = null, texLauf = null, texWeich = null, texKlein = null, kaputt = false, maxTex = 4096, art = '';
const feste = new Map();       // Foto → Textur (Fotos ändern sich nicht: nur einmal hochladen)
let hilf = null, mittel = null, weich = null, klein = null;
const neueFlaeche = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const klemm = (v, a, b) => Math.min(b, Math.max(a, v));

const RUMPF = `
uniform sampler2D t, tw, tk;
uniform float seite, zeit, stufe;
uniform float E[32];
uniform vec3 duo;
uniform vec4 sA[8], sB[8], sC[8];
uniform vec4 uA[3], uB[3], uC[3], uD[3];
const vec3 LUM = vec3(.299, .587, .114);
float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float rau(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h1(i), h1(i + vec2(1., 0.)), f.x), mix(h1(i + vec2(0., 1.)), h1(i + vec2(1., 1.)), f.x), f.y); }
vec2 rein(vec2 u) { return 1. - abs(1. - mod(u, 2.)); }
vec3 weich(vec2 q, float r) {
  vec2 o = vec2(r / seite, r); vec3 s = TEX(tk, q).rgb * 2.;
  s += TEX(tk, q + o * vec2(1., 0.)).rgb + TEX(tk, q - o * vec2(1., 0.)).rgb + TEX(tk, q + o * vec2(0., 1.)).rgb + TEX(tk, q - o * vec2(0., 1.)).rgb;
  s += TEX(tk, q + o * .7071).rgb + TEX(tk, q - o * .7071).rgb + TEX(tk, q + o * vec2(.7071, -.7071)).rgb + TEX(tk, q - o * vec2(.7071, -.7071)).rgb;
  return s / 10.;
}
// Glätten: zwölf Nachbarn in drei Ringen; ein Nachbar zählt umso mehr, je ähnlicher er dem Bildpunkt ist – Haut wird ruhig, Augen und Mund bleiben stehen.
// Steckt nur in der zweiten Fassung des Programms (GLATT): Manche Geräte rechnen jeden Zweig für jeden Bildpunkt mit – wer nicht glättet, soll dafür nicht zahlen.
#ifdef GLATT
void nimm(vec2 q, vec3 mitte, inout vec3 s, inout float n) { vec3 p = TEX(t, rein(q)).rgb; float w = 1. - smoothstep(.05, .17, distance(p, mitte)); s += p * w; n += w; }
vec3 glatt(vec2 q, vec3 mitte, float r) {
  vec2 o = vec2(r / seite, r); vec3 s = mitte; float n = 1.;
  nimm(q + o * vec2(1., 0.), mitte, s, n); nimm(q - o * vec2(1., 0.), mitte, s, n); nimm(q + o * vec2(0., 1.), mitte, s, n); nimm(q - o * vec2(0., 1.), mitte, s, n);
  nimm(q + o * 1.4, mitte, s, n); nimm(q - o * 1.4, mitte, s, n); nimm(q + o * vec2(1.4, -1.4), mitte, s, n); nimm(q - o * vec2(1.4, -1.4), mitte, s, n);
  nimm(q + o * vec2(2.6, 0.), mitte, s, n); nimm(q - o * vec2(2.6, 0.), mitte, s, n); nimm(q + o * vec2(0., 2.6), mitte, s, n); nimm(q - o * vec2(0., 2.6), mitte, s, n);
  return s / n;
}
#endif
float stelle(vec2 u, vec4 a, float eckig, float kante) {
  if (a.z <= 0. || a.w <= 0.) return 0.;
  vec2 d = abs(u - a.xy) / a.zw; float r = eckig > .5 ? max(d.x, d.y) : length(d);
  return 1. - smoothstep(1. - kante, 1., r);
}
void main() {
  vec2 u = v, as = vec2(seite, 1.);
  // ── 1. Verzerren und Spiegeln ──
  if (E[KACHEL] > 0.) u = fract(u * floor(2. + E[KACHEL] * 3.99));
  if (E[SPIEGEL] > 0.) u.x = .5 - abs(u.x - .5);
  if (E[KALEIDO] > 0.) { vec2 p = (u - .5) * as; float r = length(p), n = floor(3. + E[KALEIDO] * 5.99), seg = 3.14159265 / n, w = abs(mod(atan(p.y, p.x) + zeit * .12, 2. * seg) - seg); u = rein(r * vec2(cos(w), sin(w)) / as + .5); }
  if (E[FISCHAUGE] > 0.) { vec2 p = (u - .5) * as; float rm = length(as) * .5, k = E[FISCHAUGE] * 1.3; u = p * (1. + k * dot(p, p) / (rm * rm)) / (1. + k) / as + .5; }
  if (E[WIRBEL] > 0.) { vec2 p = (u - .5) * as; float m = 1. - smoothstep(0., 1., length(p) / (length(as) * .5)), w = E[WIRBEL] * 4. * m * m, si = sin(w), co = cos(w); u = rein(vec2(co * p.x - si * p.y, si * p.x + co * p.y) / as + .5); }
  if (E[WELLE] > 0.) { float k = E[WELLE] * .014; u = rein(u + vec2(sin(u.y * 17. + zeit * 2.2) * k / seite, sin(u.x * 13. * seite + zeit * 1.7) * k)); }
  if (E[ALTFILM] > 0.) u.y = clamp(u.y + (h1(vec2(stufe, 7.)) - .5) * .006 * E[ALTFILM], 0., 1.);
  float stoer = 0.;
  if (E[VHS] > 0.) { float k = E[VHS], band = fract(zeit * .11 + .3), nah = 1. - smoothstep(0., .035, abs(u.y - band)); u.x += (rau(vec2(u.y * 70., stufe * .37)) - .5) * .004 * k + nah * .03 * k * (h1(vec2(floor(u.y * 240.), stufe)) - .3); }
  if (E[GLITCH] > 0.) { float k = E[GLITCH], takt = floor(stufe / 3.), an = max(.3, step(.62 - .4 * k, h1(vec2(takt, 3.)))), zeile = floor(u.y * (5. + 16. * h1(vec2(takt, 9.)))), ver = h1(vec2(zeile, takt + 17.)) - .5; if (abs(ver) < .3) ver = 0.; u.x += ver * .14 * k * an; stoer = an * k; }
  if (E[PIXEL] > 0.) { float n = mix(150., 12., sqrt(E[PIXEL])); vec2 g = vec2(n * seite, n); u = (floor(u * g) + .5) / g; }
  u = rein(u);
  // ── 2. Bild lesen (mit Farbsäumen) ──
  vec3 roh = TEX(t, u).rgb, c = roh;
  vec2 vers = (u - .5) * E[SAUM] * .035 + vec2(stoer * .022 + E[VHS] * .004, 0.);
  if (dot(vers, vers) > 0.) { c.r = TEX(t, rein(u + vers)).r; c.b = TEX(t, rein(u - vers)).b; }
  // ── 3. Kanten und Schärfe ──
  if (E[SCHARF] + E[RELIEF] + E[COMIC] + E[ZEICHNUNG] + E[NEON] > 0.) {
    vec2 d = vec2(1. / (540. * seite), 1. / 540.);
    vec3 l = TEX(t, rein(u - vec2(d.x, 0.))).rgb, r = TEX(t, rein(u + vec2(d.x, 0.))).rgb, o = TEX(t, rein(u - vec2(0., d.y))).rgb, n = TEX(t, rein(u + vec2(0., d.y))).rgb;
    float kante = length(vec2(dot(r - l, LUM), dot(n - o, LUM)));
    if (E[SCHARF] > 0.) c = clamp(c + (4. * roh - l - r - o - n) * E[SCHARF] * 1.4, 0., 1.);
    if (E[RELIEF] > 0.) c = mix(c, vec3(clamp(.5 + dot(l - r + o - n, LUM) * 2.2, 0., 1.)), E[RELIEF]);
    if (E[COMIC] > 0.) { vec3 q = floor(c * 4. + .5) / 4.; q = clamp(mix(vec3(dot(q, LUM)), q, 1.4), 0., 1.) * (1. - smoothstep(.07, .22, kante)); c = mix(c, q, E[COMIC]); }
    if (E[ZEICHNUNG] > 0.) { float s = 1. - smoothstep(.015, .16, kante); c = mix(c, vec3(.97, .96, .92) * (.35 + .65 * s) * (.88 + .12 * dot(c, LUM)), E[ZEICHNUNG]); }
    if (E[NEON] > 0.) { vec3 f = c / max(max(c.r, max(c.g, c.b)), .2); c = mix(c, f * clamp(kante * 5.5, 0., 1.) * 1.15, E[NEON]); }
  }
  if (E[SOG] > 0.) { vec2 z = (u - .5) * E[SOG] * .16; c = (c + TEX(t, rein(u - z * .17)).rgb + TEX(t, rein(u - z * .33)).rgb + TEX(t, rein(u - z * .5)).rgb + TEX(t, rein(u - z * .67)).rgb + TEX(t, rein(u - z * .83)).rgb + TEX(t, rein(u - z)).rgb) / 7.; }
  // ── 4. Unschärfe und Leuchten (aus der kleinen, weichen Fassung des Bildes) ──
  if (E[WEICHX] + E[MINIATUR] + E[TRAUM] + E[LEUCHTEN] > 0.) {
    vec3 b = TEX(tw, u).rgb;
    if (E[WEICHX] > 0.) c = mix(c, mix(b, weich(u, .01 + .05 * E[WEICHX]), smoothstep(.15, .6, E[WEICHX])), smoothstep(0., .3, E[WEICHX]));
    if (E[MINIATUR] > 0.) { c = mix(c, mix(b, weich(u, .02), E[MINIATUR]), smoothstep(.1, .42, abs(v.y - .5)) * min(1., E[MINIATUR] * 1.5)); c = clamp(mix(vec3(dot(c, LUM)), c, 1. + .45 * E[MINIATUR]), 0., 1.); }
    if (E[TRAUM] > 0.) c = mix(c, 1. - (1. - c) * (1. - b * .75), E[TRAUM] * .9);
    if (E[LEUCHTEN] > 0.) c = clamp(c + b * smoothstep(.6, .97, dot(b, LUM)) * E[LEUCHTEN] * .9, 0., 1.);
  }
  // ── 5. Stellen im Bild: glätten, weichzeichnen, verpixeln, vergrößern (was danach kommt, rechnet nur noch Bildpunkt für Bildpunkt – unkenntlich bleibt unkenntlich) ──
  vec2 lq = u, mq = u; float wm = 0., wr = 0., mm = 0., dm = 0., lm = 0., gm = 0., gr = 0., dunkel = 1., hm = 0.; vec3 df = vec3(0.);
  for (int i = 0; i < 8; i++) {
    vec4 a = sA[i], b = sB[i]; if (b.x > 8.5) break;          // die Stellen sind lückenlos von vorn gefüllt – ab hier kommt nichts mehr
    float m = stelle(u, a, b.y, b.w), kl = min(a.w, a.z * seite);
    if (b.x < .5) { if (m > wm) { wm = m; wr = kl * (.2 + .8 * b.z); } }
    else if (b.x < 1.5) { if (m > .5) { float z = 2. * kl / mix(14., 4., b.z); vec2 g = vec2(z / seite, z); mq = (floor((u - a.xy) / g) + .5) * g + a.xy; mm = 1.; } }
    else if (b.x < 2.5) { if (m > dm) { dm = m; df = sC[i].rgb; } }
    else if (b.x > 3.5 && b.x < 4.5 && m > 0.) { lq = mix(lq, a.xy + (u - a.xy) / (1. + b.z * 2.), m); lm = 1.; }
    else if (b.x < 3.5) dunkel *= mix(1. - .78 * b.z, 1., m);          // hervorheben: wird erst ganz am Ende angewandt (Schritt 8)
    else if (b.x > 4.5 && b.x < 5.5) { if (m * b.z > gm) { gm = m * b.z; gr = kl; } }
    else if (b.x > 5.5 && b.x < 6.5) hm = max(hm, m * b.z);          // aufhellen: ebenfalls am Ende
  }
#ifdef GLATT
  if (gm > 0.) c = mix(c, glatt(u, c, gr * .03), gm);          // zuerst glätten – was unkenntlich gemacht wird, liegt darüber
#endif
  if (lm > 0.) c = TEX(t, rein(lq)).rgb;
  if (mm > 0.) c = TEX(t, rein(mq)).rgb;
  if (wm > 0.) c = mix(c, weich(u, wr), wm);
  // ── 6. Farbe ändern: eine angetippte Farbe umfärben, allein behalten oder entfärben ──
  {
    float Y = dot(c, LUM), halte = 0., hatHalte = 0.; vec2 ch = vec2((c.b - Y) * .564, (c.r - Y) * .713), q1 = ch / (Y + .05); vec3 neu = c;
    for (int i = 0; i < 3; i++) {
      vec4 a = uA[i], b = uB[i], k = uC[i], d = uD[i];
      if (a.w > 0.) {
        // Wie ähnlich ist der Bildpunkt der angetippten Farbe? Bei kräftigen Farben zählt vor allem der Farbton (Schatten und Glanzlichter gehören dazu),
        // bei Weiß, Grau und Schwarz zählen Farbstich und Helligkeit. 1 = an der Grenze der Toleranz.
        vec2 q0 = a.yz / (a.x + .05); float l0 = length(q0), l1 = length(q1), dy = abs(Y - a.x);
        float dh = acos(clamp(dot(q1, q0) / max(l1 * l0, .0001), -1., 1.)) / (a.w * 1.1), ds = abs(l1 - l0) / max(l0, .05) / .75;
        float bunt = sqrt(dh * dh + ds * ds + dy * dy / .3025), grau = sqrt(dot(q1 - q0, q1 - q0) / (a.w * a.w * .1225) + dy * dy / (a.w * a.w * .49));
        float m = (1. - smoothstep(1., 1.15 + k.y, mix(grau, bunt, smoothstep(.08, .3, l0)))) * b.w;
        if (d.z > 0.) m *= stelle(u, d, k.z, .3);
        if (k.x < .5) {
          float Yn = clamp(b.x + (Y - a.x) * clamp(b.x / max(a.x, .05), .6, 1.6), 0., 1.);
          vec2 e0 = a.yz * (Y / max(a.x, .02)); float r = mix(1., clamp(dot(ch, e0) / max(dot(e0, e0), .00001), 0., 1.6), clamp(l0 * 4., 0., 1.));
          vec2 cn = b.yz * (Yn / max(b.x, .05)) * r; vec3 f = vec3(Yn + cn.y / .713, 0., Yn + cn.x / .564); f.g = (Yn - .299 * f.r - .114 * f.b) / .587;
          neu = mix(neu, clamp(f, 0., 1.), m);
        } else if (k.x < 1.5) { hatHalte = 1.; halte = max(halte, m); }
        else neu = mix(neu, vec3(dot(neu, LUM)), m);
      }
    }
    c = hatHalte > .5 ? mix(vec3(dot(neu, LUM)), neu, halte) : neu;
  }
  // ── 7. Farbe, Korn, Störung ──
  if (E[PLAKAT] > 0.) { float n = mix(9., 2.5, E[PLAKAT]); c = floor(c * n + .5) / n; }
  if (E[RASTER] > 0.) { vec2 p = mat2(.7071, -.7071, .7071, .7071) * (vec2(v.x * seite, v.y) * mix(120., 36., E[RASTER])); float rad = sqrt(1. - dot(c, LUM)) * .72; c = mix(vec3(.97, .96, .93), vec3(.08), 1. - smoothstep(rad - .08, rad + .08, length(fract(p) - .5))); }
  if (E[NEGATIV] > 0.) c = mix(c, 1. - c, E[NEGATIV]);
  if (E[DUOTON] > 0.) c = mix(c, mix(duo * .2, mix(duo, vec3(1.), .85), smoothstep(.05, .95, dot(c, LUM))), E[DUOTON]);
  if (E[NACHT] > 0.) { float g = clamp(dot(c, LUM) * 1.6 + .05, 0., 1.); vec3 n = vec3(.12, 1., .22) * g + (h1(floor(v * vec2(540. * seite, 540.)) + vec2(stufe * 1.7, stufe * .9)) - .5) * .16; n *= (1. - .7 * smoothstep(.35, .75, length((v - .5) * as) / length(as))) * (.86 + .14 * sin(v.y * 1700.)); c = mix(c, clamp(n, 0., 1.), E[NACHT]); }
  if (E[WAERMEBILD] > 0.) { float g = dot(c, LUM); vec3 w = g < .25 ? mix(vec3(0., 0., .25), vec3(.3, 0., .7), g / .25) : g < .5 ? mix(vec3(.3, 0., .7), vec3(.95, .15, .15), (g - .25) / .25) : g < .75 ? mix(vec3(.95, .15, .15), vec3(1., .75, 0.), (g - .5) / .25) : mix(vec3(1., .75, 0.), vec3(1., 1., .9), (g - .75) / .25); c = mix(c, w, E[WAERMEBILD]); }
  if (E[ALTFILM] > 0.) {
    float k = E[ALTFILM], takt = floor(stufe / 2.); vec3 s = vec3(dot(c, LUM)) * vec3(1.12, .93, .68) * (.92 + .16 * h1(vec2(stufe, 1.)));
    s += (1. - smoothstep(0., .0025, abs(v.x - h1(vec2(takt, 5.))))) * step(.5, h1(vec2(takt, 6.))) * .3;
    vec2 zl = v * vec2(26. * seite, 26.); if (h1(floor(zl) + vec2(stufe * 1.3, stufe * .7)) > .996) s *= smoothstep(0., .3, length(fract(zl) - .5));
    s *= 1. - .6 * dot(v - .5, v - .5) * 1.6;
    c = mix(c, clamp(s, 0., 1.), k);
  }
  if (E[VHS] > 0.) { float k = E[VHS], band = fract(zeit * .11 + .3); c = mix(c, mix(vec3(dot(c, LUM)), c, .75) * vec3(1.02, .98, 1.06), k * .8); c += (h1(floor(v * vec2(320. * seite, 240.)) + vec2(stufe * 1.1, stufe * 2.3)) - .5) * .09 * k; c *= 1. - .12 * k * step(.5, fract(v.y * 240.)); c += (1. - smoothstep(0., .02, abs(v.y - band))) * .18 * k * h1(vec2(floor(v.x * 90.), stufe)); }
  if (E[ZEILEN] > 0.) c *= (1. - E[ZEILEN] * .5 * (.5 + .5 * sin(v.y * 1696.46))) * (1. + .22 * E[ZEILEN]);
  if (E[KORN] > 0.) c += (h1(floor(v * vec2(720. * seite, 720.)) + vec2(stufe * 3.1, stufe * 1.3)) - .5) * E[KORN] * .3;
  if (E[RAUSCHEN] > 0.) c = mix(c, vec3(h1(floor(v * vec2(360. * seite, 360.)) + vec2(stufe * 2.3, stufe * 3.7))), E[RAUSCHEN] * .7);
  if (E[NEBEL] > 0.) { float n = rau(v * vec2(3. * seite, 3.) + vec2(zeit * .05, zeit * .02)) * .6 + rau(v * vec2(7. * seite, 7.) - vec2(zeit * .08, 0.)) * .4; c = mix(c, vec3(.92, .94, .96), smoothstep(.2, .9, n) * (.35 + .65 * v.y) * E[NEBEL] * .85); }
  // ── 8. Stellen abdecken (in genau der gewählten Farbe), hervorheben (alles außerhalb wird dunkler) und aufhellen ──
  if (dm > 0.) c = mix(c, df, dm);
  c *= dunkel;
  if (hm > 0.) { vec3 p = max(c, 0.); c = mix(c, p * 2.2 / (1. + 1.2 * p), hm); }        // Schatten und Mitten heben, Lichter bleiben (ohne teure Potenz)
  FARBE = vec4(clamp(c, 0., 1.), 1.);
}`;

function richteEin() {
  if (gl || kaputt) return !!gl;
  try {
    flaeche = neueFlaeche(16, 16);
    const o = { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false };
    let zwei = !globalThis.TW_OHNE_WEBGL2; gl = zwei ? flaeche.getContext('webgl2', o) : null;
    if (!gl) { zwei = false; gl = flaeche.getContext('webgl', o) || flaeche.getContext('experimental-webgl', o); }
    if (!gl) throw new Error('kein WebGL');
    const lod = !zwei && !!gl.getExtension('EXT_shader_texture_lod'), hoch = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), genau = zwei || (hoch && hoch.precision > 0);
    art = zwei ? 'WebGL 2' : lod ? 'WebGL 1 (genau)' : 'WebGL 1';
    const namen = GL_FX.map((k, i) => `#define ${k.toUpperCase()} ${i}\n`).join('');
    const kopfF = zwei ? '#version 300 es\nprecision highp float;\nin vec2 v;\nout vec4 farbeAus;\n#define FARBE farbeAus\n#define TEX(s, q) textureLod(s, q, 0.)\n'
      : (lod ? '#extension GL_EXT_shader_texture_lod : enable\n' : '') + `precision ${genau ? 'highp' : 'mediump'} float;\nvarying vec2 v;\n#define FARBE gl_FragColor\n#define TEX(s, q) ${lod ? 'texture2DLodEXT(s, q, 0.)' : 'texture2D(s, q)'}\n`;
    const kopfV = zwei ? '#version 300 es\nin vec2 p;\nout vec2 v;\n' : 'attribute vec2 p;\nvarying vec2 v;\n';
    const baue = (typ, quelle) => { const s = gl.createShader(typ); gl.shaderSource(s, quelle); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Programm lässt sich nicht bauen'); return s; };
    kopf = { v: kopfV, f: kopfF + namen, baue };
    const puffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, puffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    progs = [null, null]; nimmProgramm(0);
    maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
    texLauf = neueTextur(); texWeich = neueTextur(); texKlein = neueTextur();
    if (flaeche.addEventListener) flaeche.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); gl = null; prog = null; progs = [null, null]; feste.clear(); });   // beim nächsten Bild wird neu eingerichtet
    return true;
  } catch (e) { console.warn('Bildeffekte nicht möglich:', e && e.message ? e.message : e); kaputt = true; gl = null; return false; }
}
// Das Rechenprogramm in einer von zwei Fassungen einschalten: 0 = ohne, 1 = mit „Glätten“ (wird erst gebaut, wenn es gebraucht wird).
function nimmProgramm(nr) {
  let e = progs[nr];
  if (!e && nr && progs[0]) {      // die zweite Fassung ist eine Zugabe: Lässt sie sich auf einem Gerät nicht bauen, rechnet die erste weiter (dann ohne Glätten)
    try { e = baueProgramm(nr); } catch (f) { console.warn('Glätten nicht möglich:', f && f.message ? f.message : f); e = progs[nr] = progs[0]; }
  } else if (!e) e = baueProgramm(nr);
  if (prog !== e.pr) { prog = e.pr; U = e.u; gl.useProgram(prog); }
}
function baueProgramm(nr) {
  let e = null;
  {
    const pr = gl.createProgram();
    gl.attachShader(pr, kopf.baue(gl.VERTEX_SHADER, kopf.v + 'void main(){ v = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(pr, kopf.baue(gl.FRAGMENT_SHADER, kopf.f + (nr ? '#define GLATT\n' : '') + RUMPF));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'Programm lässt sich nicht verbinden');
    gl.useProgram(pr); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const u = {}; for (const n of ['t', 'tw', 'tk', 'seite', 'zeit', 'stufe', 'E', 'duo', 'sA', 'sB', 'sC', 'uA', 'uB', 'uC', 'uD']) u[n] = gl.getUniformLocation(pr, n);
    gl.uniform1i(u.t, 0); gl.uniform1i(u.tw, 1); gl.uniform1i(u.tk, 2);
    e = progs[nr] = { pr, u };
  }
  prog = e.pr; U = e.u;
  return e;
}
function neueTextur() {
  const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return x;
}
const lade = (bild) => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bild);
// Bild in eine Hilfsfläche der Größe W × H malen (der Browser verkleinert dabei sauber).
function aufFlaeche(alt, bild, W, H, fein = true) {
  const f = alt || neueFlaeche(W, H); if (f.width !== W || f.height !== H) { f.width = W; f.height = H; }
  const x = f.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = fein ? 'high' : 'low'; x.drawImage(bild, 0, 0, W, H);
  return f;
}
const istFoto = (b) => (typeof ImageBitmap !== 'undefined' && b instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && b instanceof HTMLImageElement);

/** Kann dieses Gerät die Bildeffekte rechnen? → '' oder die Art der Rechenstufe (für „Gerät prüfen“). */
export function effekteBereit() { return richteEin() ? art : ''; }

/**
 * Rechnet die Bildeffekte in ein Bild hinein.
 * @param bild  Videobild, Foto oder Malfläche (w × h)
 * @param zb,zh gewünschte Größe des Ergebnisses (nie größer als nötig – spart Rechenzeit)
 * @param P     Angaben aus effekte.js › glWerte
 * @returns Malfläche mit dem Ergebnis (gleiche Form wie das Bild) oder null
 */
export function glBild(bild, w, h, zb, zh, P) {
  if (!P || !richteEin()) return null;
  try {
    const W = klemm(Math.round(zb), 16, maxTex), H = klemm(Math.round(zh), 16, maxTex);
    if (flaeche.width !== W || flaeche.height !== H) { flaeche.width = W; flaeche.height = H; }
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    if (istFoto(bild)) {
      let e = feste.get(bild);
      if (!e) {
        if (feste.size >= 4) { const [alt, a] = feste.entries().next().value; gl.deleteTexture(a.tex); feste.delete(alt); }
        const k = Math.min(1, Math.min(maxTex, 2560) / Math.max(w, h)); e = { tex: neueTextur() };
        lade(k < 1 ? aufFlaeche(null, bild, Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))) : bild); feste.set(bild, e);
      } else gl.bindTexture(gl.TEXTURE_2D, e.tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texLauf);
      if (Math.max(w, h) > maxTex || Math.max(w / W, h / H) > 1.6) { hilf = aufFlaeche(hilf, bild, W, H, false); lade(hilf); } else lade(bild);       // große Videobilder erst verkleinern – genau so, wie die Malfläche es ohne Effekt täte (das Bild neben dem Effekt bleibt, wie es war)
    }
    if (P.weich) {
      const k = 160 / Math.max(w, h), kw = Math.max(4, Math.round(w * k)), kh = Math.max(4, Math.round(h * k));
      mittel = aufFlaeche(mittel, bild, Math.min(w, kw * 4), Math.min(h, kh * 4)); weich = aufFlaeche(weich, mittel, kw, kh); klein = aufFlaeche(klein, weich, Math.max(2, Math.round(kw / 4)), Math.max(2, Math.round(kh / 4)));
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texWeich); lade(weich);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texKlein); lade(klein);
    }
    nimmProgramm(P.glatt ? 1 : 0);
    gl.uniform1f(U.seite, w / h); gl.uniform1f(U.zeit, P.zeit); gl.uniform1f(U.stufe, P.stufe); gl.uniform1fv(U.E, P.E); gl.uniform3f(U.duo, P.duo[0], P.duo[1], P.duo[2]);
    gl.uniform4fv(U.sA, P.sA); gl.uniform4fv(U.sB, P.sB); gl.uniform4fv(U.sC, P.sC);
    gl.uniform4fv(U.uA, P.uA); gl.uniform4fv(U.uB, P.uB); gl.uniform4fv(U.uC, P.uC); gl.uniform4fv(U.uD, P.uD);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return flaeche;
  } catch (e) { console.warn('Bildeffekte', e); return null; }
}
