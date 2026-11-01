# DESIGN.md – Fitness-App, Design „B · Instrument“

Umsetzungsvorgabe für Claude Code. Ziel: die bestehende PWA (`index.html`, `app.css`, `app.js`) optisch auf Design B umstellen. Logik, Datenmodell (`localStorage`) und Texte bleiben, soweit unten nichts anderes steht.

Referenz-Entwürfe: Ordner `design/` im Repo (Quelltext der Claude-Design-Artboards, je Screen eine `.dc.html`). Sie laufen nicht eigenständig im Browser (brauchen die Claude-Design-Laufzeit), sind aber als Vorlage für Markup, Abstände und Farben lesbar; dynamische Werte (`{{…}}`) werden im `<script>`-Block unten in `renderVals()` berechnet. Original-Canvas (privat): https://claude.ai/artifact/9rxaZSy69V6nTBmGMxrofg. Alle Zahlen in den Entwürfen sind Beispieldaten.

| Datei | Screen |
|---|---|
| `B-Heute` / `B-Hell-Heute` | Heute dunkel / hell |
| `B-Satz` / `B-Hell-Satz` | Training: Satz dunkel / hell |
| `B-Pause`, `B-Zeit`, `B-Summary` | Training: Pause, Zeitübung, Abschluss |
| `B-Verlauf`, `B-Uebungen`, `B-Mehr` | Tabs |
| `B-Onboarding`, `B-Dialog` | Erststart, Dialog Test eintragen (Muster auch für Nachtragen) |

Hinweis zu den Tweaks in den Dateien: maßgeblich sind die Werte in Abschnitt 6; nicht gewählte Varianten (`sc-if`-Zweige) nicht umsetzen.

## 1. Grundsätze

- Dunkel als Standard, Hell über `prefers-color-scheme: light` (wie bisher).
- Zahlen, Zeiten, Einheiten-Labels in Monospace, Fließtext in Sans.
- Kleine Überschriften: 12 px, Versalien, `letter-spacing: .1em`, Farbe `--muted`.
- Leichte Farbverläufe (Stärke 45 %) und Glow auf Akzent-Elementen. Kein Streak, keine Emojis.
- Touch-Ziele ≥ 44 px, Hauptbuttons 60–64 px hoch.

## 2. Design-Tokens

Ersetzt den `:root`-Block in `app.css`.

```css
:root {
  --bg: #0A0F14;
  --surface: #121A22;  --surface-end: #0F161C;  --surface2: #1A242E;  --inset: #0E151B;
  --line: #1F2B36;  --line-strong: #3A4B5A;  --track: #1F2B36;
  --text: #E6EDF3;  --text-2: #B7C3CE;  --muted: #8B9AA8;
  --accent: #3FD5E8;        /* Flächen, Balken, Ring */
  --accent-ink: #3FD5E8;    /* Akzent als Text/Linie */
  --on-accent: #04161A;
  --violet: #7B6CF6;        /* nur für Hintergrund-Verlauf */
  --good: #6FDBA0;  --bad: #FF8F8F;  --bad-line: #FF7A7A;  --warn: #F2B84B;
  --badminton: #A18CFF;
  --fig: #E6EDF3;  --fig-prop: #3A4B5A;  --fig-prop-fill: #1A242E;
  --r-card: 10px;  --r-ctrl: 6px;  --r-btn: 10px;  --r-pill: 999px;
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #F2F5F8;
    --surface: #FFFFFF;  --surface-end: #FFFFFF;  --surface2: #EEF2F6;  --inset: #F6F8FA;
    --line: #DCE3EA;  --line-strong: #C3CDD7;  --track: #E4EAF0;
    --text: #0F1720;  --text-2: #2E3B48;  --muted: #566473;
    --accent: #3FD5E8;  --accent-ink: #087786;  --on-accent: #04161A;
    --good: #12805A;  --bad: #C43C3C;  --bad-line: #C43C3C;  --warn: #A86A00;
    --fig: #0F1720;  --fig-prop: #C3CDD7;  --fig-prop-fill: #E4EAF0;
    color-scheme: light;
  }
}
```

Wichtig für Hell: Akzent als Text, Linie oder Zahl immer `--accent-ink` (Cyan auf Weiß hat zu wenig Kontrast). Akzent-Flächen (Primärbutton, Balken) bleiben `--accent` mit Text `--on-accent`. Zahlen wie der Wiederholungszähler sind im Hellmodus `--accent-ink`, im Dunkelmodus `--accent`.

## 3. Verläufe und Glow

`color-mix()` statt fester rgba-Werte, damit nur `--accent` gepflegt werden muss. Prozentwerte entsprechen Verlaufsstärke 45 %.

```css
body {
  background:
    radial-gradient(120% 30% at 85% 0%, color-mix(in srgb, var(--accent) 11%, transparent), transparent 70%),
    radial-gradient(90% 25% at 0% 60%, color-mix(in srgb, var(--violet) 6%, transparent), transparent 70%),
    var(--bg);
  background-attachment: fixed;
}
.card {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 4%, var(--surface)) 0%, var(--surface) 42%, var(--surface-end) 100%);
  border: 1px solid var(--line); border-radius: var(--r-card);
}
.btn.primary {
  background: linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 82%, #fff));
  color: var(--on-accent);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 35%, transparent);
}
.glow-text { text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent); }
```

Richtwerte bei Stärke 45 %: Seitenverlauf oben rechts Akzent ≈ 11 % Deckkraft, unten links Violett ≈ 6 %, Karten oben links Akzent ≈ 4 %. Im Hellmodus: Seitenverlauf Akzent ≈ 13 %, Karten ≈ 4,5 %, Button-Schatten `0 8px 22px` mit 40 %. Glow in Hell nur als Schatten, kein `text-shadow`.

Laufende Training-Screens (`#run`): Verlauf von unten (`radial-gradient(110% 40% at 50% 100%, …)`), Pause-Screen mittig hinter dem Ring.

`prefers-reduced-motion`: keine Animationen am Glow; Übergänge des Rings beibehalten (0,6 s).

## 4. Typografie

- IBM Plex Sans 400/500/600/700, IBM Plex Mono 400/500/600.
- **Offline-Pflicht:** Schriften als `woff2` nach `fonts/` legen (Quelle: IBM Plex, OFL-Lizenz, z. B. über npm `@ibm/plex` oder Google Fonts herunterladen, nur Latin-Subset). `@font-face` mit `font-display: swap` in `app.css`. Keine Google-Fonts-Links im HTML.
- Größen: h1 26 px/600; Hero (Onboarding) 38 px; Kartenwerte mono 26 px; Wochenziel-Zahl mono 48 px; Zähler im Satz mono 96 px; Countdown Pause 72 px, Zeitübung 88 px.

## 5. Bausteine und Zuordnung zu bestehenden Klassen

| Baustein | bisher | neu |
|---|---|---|
| Wochenziel | `.weekcard`, `.ring` (Vollkreis) | **Halbkreis-Bogen** (SVG `path` A90, Strich 14 px, `stroke-linecap: round`), Verlauf `accent` dunkel→hell, Zahl `2/3` mittig unten, darunter Tageszeile MO–SO in Mono: `●` Einheit, `○` Mini, `·` leer, heute umrandet |
| Block-Zeitleiste | – | **neu** über der Wochenkarte: 6 Segmente (6 px hoch), erledigte Wochen `--accent`, laufende anteilig, Woche 6 schraffiert, Label `W1…W5`, `TEST`. Daten: `blockInfo()` |
| Banner | `.banner` mit linkem Rand | Karte mit Verlauf von links (Akzent 10 %), Icon links, Button rechts; kein farbiger Linksrand. Logik `banners()` unverändert. (Im Entwurf ausgeblendet, in der App bleibt es sichtbar, wenn ein Banner aktiv ist.) |
| Gewicht (Heute) | Karte mit Inline-Form | zwei Karten nebeneinander: links Ø-Wert + Sparkline mit Verlaufsfläche + Trend kg/Woche (`--good`), rechts Eingabe + Speichern |
| Primäraktionen | `.btn.big`, `.row2` | Training starten 64 px mit Mono-Zeit rechts; Mini / Badminton als Sekundärbuttons mit Mono-Zusatz rechts |
| Stufen (Heute) | `.lvls` 2×2 mit Mini-Figur | **Liste mit 5-Segment-Balken** je Muster, rechts `S3`; Segmente leicht verlaufend; ganze Zeile tippbar → Übungen |
| Tab-Leiste | `.tabs` | Hintergrund `--bg` 92 % + Linie oben; aktiver Tab `--accent` + Glow |
| Satz-Kopf | `.runhead`, `.prog` | 12 Segmente statt durchgehendem Balken (erledigt Akzent, aktuell hell mit Glow) |
| Satz-Figur | `.figslot.big` | **klein** (120×~70) rechts neben Titel |
| Zielbereich-Skala | – | **neu**: Karte, Spur 0–20 (bzw. 0–max), Band = Zielbereich, Marker = aktueller Wert |
| Tempo-Leiste | – | **neu**: 3 Segmente 2:1:1 „2 S RUNTER · 1 S HALTEN · 1 S HOCH“ (statisch, nur bei Wdh.-Übungen) |
| Letzte Sätze | „zuletzt X“ im Ziel-Text | **neu**: Chips der letzten 2 Einheiten dieser Stufe (`29.10. · 10/9`), aktueller Chip mit Akzent-Rand |
| Zähler | `.stepper` | − / Zahl / + mit 80 px Buttons, Zahl mono 96 px Akzent + Glow |
| Pause | `.stage.rest` | Countdown-Ring 240 px (Verlauf + Glow), darunter „Als Nächstes“-Karte mit Figur |
| Zeitübung | `.stage` timed | Figur groß im Verlaufsfeld, Hinweis „Seite wechseln“ als Akzent-Pill, Countdown 88 px, Fortschrittsbalken mit Halbzeit-Marker „SEITE“ |
| Zusammenfassung | `.sum` | Headline in Akzent + Glow, Karte „Woche erfüllt“ mit 3 Segmenten (neues Segment leuchtet), Liste je Muster mit `▲/■/▼` in good/muted/bad und Select „NÄCHSTE“ (Rand Akzent bei Aufstieg) |
| Übungen | Karten je Leiter | Chip-Navigation (horizontal scrollend, aktiver Chip Akzent), Aufwärmen/Dehnen als `<details>`, **Drücken-Leiter als vertikale Zeitleiste** (Kreise 1–5, aktuelle Stufe gefüllt + Glow, aufgeklappt mit Figur und Cues, andere mit Link „Als aktuelle Stufe setzen“); übrige Leitern kompakt mit 5-Segment-Balken. Jede Leiter so darstellen, die aktuelle aufklappen. |
| Mehr | Formularfelder | Zeilenliste: Zielgewicht/Zeit rechtsbündig, Arbeitsrunden als **Segment-Umschalter**, Stange/Signaltöne als **Switches** (`input type=checkbox` + `role=switch`), Regeln mit Mono-Nummern `01–07`, Ernährung als 2 Kennzahl-Kacheln, Zurücksetzen als rot umrandete Karte |
| Onboarding | Selects je Muster | Startstufen als **5 Buttons 1–5** je Muster (`aria-pressed`), Default wie bisher (Ziehen 1, sonst 2); Hero zweizeilig, zweite Zeile Akzent + Glow |
| Dialoge | `dialog` mittig | **Bottom-Sheet** (Radius 18 px oben, Griff), Felder als Zeile: Label + Hilfe links, Eingabe mit Einheit rechts, Platzhalter = Wert des letzten Tests |
| Verlauf · Gewicht | `.chart` Linie | Wert groß + Trend-Pill, Linie 7-Tage-Mittel (Akzent + Glow) mit **Verlaufsfläche**, Tageswerte als graue Punkte, Zeitraum-Umschalter 12 W / 52 W / Alle |
| Verlauf · Wochen | Balkendiagramm | **Kacheln** (6 je Zeile, Zahl der Einheiten + KW): erfüllt = Akzent-Verlauf, Mini-Woche = Akzent-Rand, darunter = `--line-strong`, laufend = schraffiert. Legende darunter |
| Verlauf · Leistung | `.perfgrid` | je Muster Zeile: Name + Stufenentwicklung (`2 → 3`), 10 Balken = Anteil am Zielbereich der letzten Einheiten, Aufstiege heller mit Glow, rechts `S3` |
| Verlauf · Tests / Einheiten | Tabelle / Liste | Tabelle Mono rechtsbündig mit Δ in `--good`; Einheitenliste mit Farbpunkt (Training Akzent, Badminton `--badminton`, Mini `--muted`), Chip „gemeinsam“, ×-Button 44 px |

Strichfiguren (`figures.js`): Farben auf `--fig`, `--fig-prop`, `--fig-prop-fill` umstellen; Animation bleibt.

## 6. Feste Entscheidungen (aus den Tweaks)

Heute: Wochenziel = Bogen, Stufen = Balken, Block-Zeitleiste an, Gewichtstrend an, „Gemeinsam“-Zähler aus.
Satz: Zähler = Zahl, Figur = klein, Zielbereich-Skala an, Tempo-Leiste an, Letzte Sätze an.
Verlauf: Gewicht = Fläche, Messpunkte an, Wochen = Kacheln, Leistung/Tests/Einheiten an.
Alle: Akzent `#3FD5E8`, Verlauf 45 %, Glow an, Raster aus.

## 7. Technische Schritte

1. `fonts/` mit IBM-Plex-woff2 (Sans 400/500/600/700, Mono 400/500/600) anlegen, `@font-face` in `app.css`.
2. `app.css` neu nach Abschnitt 2–5; Klassennamen möglichst behalten, neue nur wo nötig (`.blockbar`, `.gauge`, `.scale`, `.tempo`, `.chips`, `.ladder`, `.switch`, `.seg`, `.sheet`, `.tiles`).
3. `app.js`: Markup der Views anpassen (`viewHome`, `viewHistory`, `viewExercises`, `viewMore`, `viewOnboarding`, `renderStep`, `summaryHtml`, `dlgTest`, `dlgLater`, `weeksChart`, `perfChart`, `weightChart`). Logik nicht verändern.
4. `index.html`: `theme-color` auf `#0A0F14` (dunkel) und `#F2F5F8` (hell, per `media`-Attribut).
5. `manifest.webmanifest`: `background_color`/`theme_color` `#0A0F14`.
6. `sw.js`: `VERSION` auf `fit-v2`, Schriftdateien in `ASSETS` aufnehmen.
7. Prüfen: iPhone-Breite 390 px und 320 px, Hell/Dunkel, offline (Flugmodus) mit installierter App, Kontrast ≥ 4,5:1 für Text.
8. Commit und Push nach `origin/main`.

## 8. Barrierefreiheit

- Echte `<button>`, `<label>`, `<input>`; Icon-Buttons mit `aria-label`.
- Diagramme mit `role="img"` und `aria-label` (Kurzaussage, z. B. „7-Tage-Mittel fällt von 93,8 auf 91,4 kg“).
- Zustände nicht nur über Farbe: Mini-Woche = Rand, laufend = Schraffur, Entscheidung ▲/■/▼.
