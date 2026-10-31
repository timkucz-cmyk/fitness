# Fitness

Web-App für Krafttraining mit dem eigenen Körpergewicht: Wochenziel statt Streak, Progressionsleitern für Drücken, Ziehen, Beine und Rumpf, Trendanzeigen.

- Läuft komplett im Browser, keine Anmeldung, kein Server.
- Alle Daten bleiben auf dem Gerät (localStorage). Backup per JSON-Export unter „Mehr“.
- Jede Person, die die App installiert, hat ihre eigenen Daten.

## Auf dem iPhone installieren

1. Seite in Safari öffnen.
2. Teilen-Symbol → „Zum Home-Bildschirm“.
3. App vom Home-Bildschirm starten (Vollbild, offline nutzbar).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `app.css` | Oberfläche |
| `app.js` | Logik: Wochenziel, Blöcke, Stufen, Diagramme, Export |
| `exercises.js` | Übungen, Leitern, Aufwärmen, Dehnen, Tests |
| `figures.js` | Animierte Strichfiguren |
| `sw.js`, `manifest.webmanifest` | Offline-Betrieb und Installation |

Nach Änderungen an den Dateien in `sw.js` die `VERSION` erhöhen, damit installierte Apps die neue Fassung laden.
