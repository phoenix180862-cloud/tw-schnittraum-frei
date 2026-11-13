// TW Schnittraum – reicht den Mikrofonton unverändert an die App weiter (läuft im Ton-Faden des Browsers).
class TwAufnahme extends AudioWorkletProcessor {
  process(eingaben) {
    const kanal = eingaben[0] && eingaben[0][0];
    if (kanal && kanal.length) this.port.postMessage(kanal.slice(0));
    return true;
  }
}
registerProcessor('tw-aufnahme', TwAufnahme);
