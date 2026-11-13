// TW Schnittraum – Was für ein Gerät ist das? (Handy/Tablet mit Finger-Bedienung oder PC)
//
// Wichtig (Thomas, 13.11.2026 – Samsung-Tablet kam nicht an die Galerie): Große Tablets melden sich im Browser als PC
// („Desktop-Seite“ ist dort Grundeinstellung: Kennung „X11; Linux x86_64“ statt „Android“). Nach dem Namen allein
// hielte die App ein Samsung-Tablet für einen PC und böte statt der Galerie die Datei-Auswahl an. Deshalb zählt neben
// dem Namen auch, ob der Bildschirm mit dem Finger bedient wird.
const UA = navigator.userAgent || '', PLATT = navigator.platform || '', PUNKTE = navigator.maxTouchPoints || 0;

export const WINDOWS = /Win/i.test(PLATT) || /Windows/i.test(UA);
const APPLE_MOBIL = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && PUNKTE > 1);
// Android – auch wenn es sich als PC ausgibt: Linux mit Finger-Bildschirm, aber kein Chromebook.
export const ANDROID = /Android/i.test(UA) || (PUNKTE > 0 && /Linux/i.test(PLATT) && !/CrOS/.test(UA) && !WINDOWS);
/** Handy oder Tablet: Galerie, Kamera und die Datei-Auswahl des Geräts sind hier die richtigen Wege. */
// Ein Windows-PC mit Finger-Bildschirm bleibt ein PC: Dort ist die Datei-Auswahl von Windows der richtige Weg.
export const MOBIL = ANDROID || APPLE_MOBIL;
/** Die Anleitung „Handy am PC“ (Smartphone-Link, Kabel) gehört nur auf einen PC. */
export const PC = !MOBIL;
