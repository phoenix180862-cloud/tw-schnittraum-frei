// TW Schnittraum – Ersatz für die Filter der Malfläche (ctx.filter), für Browser, die sie nicht kennen (iPhone/iPad).
// Farbe (Helligkeit, Kontrast, Farbkraft, Sepia) rechnet eine kleine WebGL-Stufe mit denselben Formeln wie die Filter,
// Unschärfe entsteht durch Verkleinern und Vergrößern. Schlägt etwas fehl, wird das Bild unverändert gemalt.

let gl = null, flaeche = null, prog = null, ort = null, tex = null, kaputt = false;
const neueFlaeche = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

function richteEin() {
  if (gl || kaputt) return !!gl;
  try {
    flaeche = neueFlaeche(16, 16);
    gl = flaeche.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false }) || flaeche.getContext('experimental-webgl');
    if (!gl) throw new Error('kein WebGL');
    const baue = (art, quelle) => { const s = gl.createShader(art); gl.shaderSource(s, quelle); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, baue(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(prog, baue(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 v; uniform sampler2D t; uniform float hell, kontrast, saett, sepia;
      void main(){ vec3 c = texture2D(t, v).rgb;
        c = clamp(c * hell, 0., 1.);
        c = clamp((c - .5) * kontrast + .5, 0., 1.);
        c = clamp(vec3(dot(c, vec3(.213 + .787 * saett, .715 - .715 * saett, .072 - .072 * saett)), dot(c, vec3(.213 - .213 * saett, .715 + .285 * saett, .072 - .072 * saett)), dot(c, vec3(.213 - .213 * saett, .715 - .715 * saett, .072 + .928 * saett))), 0., 1.);
        float q = 1. - sepia;
        c = clamp(vec3(dot(c, vec3(.393 + .607 * q, .769 - .769 * q, .189 - .189 * q)), dot(c, vec3(.349 - .349 * q, .686 + .314 * q, .168 - .168 * q)), dot(c, vec3(.272 - .272 * q, .534 - .534 * q, .131 + .869 * q))), 0., 1.);
        gl_FragColor = vec4(c, 1.); }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const puffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, puffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const stelle = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(stelle); gl.vertexAttribPointer(stelle, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    ort = { hell: gl.getUniformLocation(prog, 'hell'), kontrast: gl.getUniformLocation(prog, 'kontrast'), saett: gl.getUniformLocation(prog, 'saett'), sepia: gl.getUniformLocation(prog, 'sepia') };
    return true;
  } catch (e) { console.warn('Farb-Ersatz nicht möglich', e); kaputt = true; gl = null; return false; }
}

/** Bild mit den Farbreglern a = { hell, kontrast, saett, sepia } einfärben → Malfläche in Bildgröße (oder null). */
export function gefaerbt(bild, w, h, a) {
  if (!richteEin()) return null;
  try {
    const k = Math.min(1, 1920 / Math.max(w, h)), W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    if (flaeche.width !== W || flaeche.height !== H) { flaeche.width = W; flaeche.height = H; }
    gl.viewport(0, 0, W, H);
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bild);
    gl.uniform1f(ort.hell, 1 + (a.hell || 0) / 200); gl.uniform1f(ort.kontrast, 1 + (a.kontrast || 0) / 200);
    gl.uniform1f(ort.saett, Math.max(0, 1 + (a.saett || 0) / 100)); gl.uniform1f(ort.sepia, (a.sepia || 0) / 100);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return flaeche;
  } catch (e) { console.warn('Farb-Ersatz', e); return null; }
}

let klein = null, mittel = null;
/** Bild weichzeichnen (Radius in Bildpunkten des Bildes) → kleine Malfläche, die beim Malen wieder groß gezogen wird (oder null). */
export function verwischt(bild, w, h, radius) {
  try {
    if (!(radius > 0.3)) return null;
    const k = Math.min(1, 1.6 / radius), W = Math.max(4, Math.round(w * k)), H = Math.max(4, Math.round(h * k));
    if (!klein) { klein = neueFlaeche(W, H); mittel = neueFlaeche(W * 2, H * 2); }
    if (mittel.width !== W * 2 || mittel.height !== H * 2) { mittel.width = W * 2; mittel.height = H * 2; }
    if (klein.width !== W || klein.height !== H) { klein.width = W; klein.height = H; }
    const m = mittel.getContext('2d'), c = klein.getContext('2d');
    m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high'; m.drawImage(bild, 0, 0, W * 2, H * 2);   // in zwei Schritten verkleinern = ruhigeres Ergebnis
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(mittel, 0, 0, W, H);
    return klein;
  } catch (e) { console.warn('Weichzeichnen-Ersatz', e); return null; }
}
