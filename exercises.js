// Übungen, Progressionsleitern, Aufwärm- und Dehnprogramm.
'use strict';

const TABLE_ROW = [['table', 125, 198, 75]];
const CHAIR = [['box', 66, 92, 91, [66, 55, 5]]];
const BAR = [['bar', 110, 8]];

const EX = {
  // ---------- Drücken ----------
  push1: {
    name: 'Liegestütz an der Wand', unit: 'reps',
    cues: ['Hände schulterbreit an der Wand', 'Körper gerade wie ein Brett', 'Brust zur Wand, Ellbogen ca. 45° vom Körper'],
    props: [['wall', 158]],
    A: { hip: [113, 73.6], torso: -70, hand: [157, 45], eh: [0, 1], foot: [98, 115] },
    B: { hip: [121.3, 77.7], torso: -58, hand: [157, 45], eh: [0, 1], foot: [98, 115] },
  },
  push2: {
    name: 'Liegestütz am Tisch', unit: 'reps',
    cues: ['Hände auf der Tischkante (Tisch darf nicht rutschen)', 'Bauch fest, kein Hohlkreuz', 'Brust bis knapp an die Kante'],
    props: [['table', 140, 198, 75]],
    A: { hip: [97.6, 81.4], torso: -50, hand: [146, 75], eh: [-0.6, -1], foot: [69, 115], toe: 60 },
    B: { hip: [103.2, 87.3], torso: -39, head: -10, hand: [146, 75], eh: [-0.6, -1], foot: [69, 115], toe: 60 },
  },
  push3: {
    name: 'Liegestütz an der Sofakante', unit: 'reps',
    cues: ['Hände auf Sofa- oder Bettkante', 'Körper bleibt eine Linie', 'Brust bis knapp an die Kante'],
    props: [['box', 140, 198, 93, [186, 63, 12]]],
    A: { hip: [99.3, 88.3], torso: -37, hand: [148, 93], eh: [-0.6, -1], foot: [64, 115], toe: 60 },
    B: { hip: [103.5, 95.6], torso: -26.2, head: -15, hand: [148, 93], eh: [-0.6, -1], foot: [64, 115], toe: 60 },
  },
  push4: {
    name: 'Liegestütz am Boden', unit: 'reps',
    cues: ['Hände unter den Schultern', 'Körper gerade, Po nicht hoch', 'Brust bis eine Faust über dem Boden'],
    A: { hip: [104.1, 98.2], torso: -22.4, hand: [150, 115], eh: [-0.5, -1], foot: [63.4, 115], toe: 70 },
    B: { hip: [106.5, 106.2], torso: -11.5, head: -15, hand: [150, 115], eh: [-0.5, -1], foot: [63.4, 115], toe: 70 },
  },
  push5: {
    name: 'Liegestütz mit erhöhten Füßen', unit: 'reps',
    cues: ['Füße auf Stuhl oder Sofa', 'Hände unter den Schultern', 'Kein Hohlkreuz, Bauch fest'],
    props: [['box', 20, 62, 91, [20, 55, 5]]],
    A: { hip: [95.9, 85.8], torso: -4.2, hand: [140, 115], eh: [-0.5, -1], foot: [52, 89], toe: 60 },
    B: { hip: [95.6, 94.7], torso: 7.4, head: -20, hand: [140, 115], eh: [-0.5, -1], foot: [52, 89], toe: 60 },
  },

  // ---------- Ziehen ----------
  pull1: {
    name: 'Tisch-Rudern, Knie stark gebeugt', unit: 'reps',
    cues: ['Nur massiver Tisch – vorher auf Kippen prüfen', 'Unter den Tisch legen, Kante schulterbreit greifen', 'Füße nah am Po, Hüfte hoch, Brust zur Kante ziehen'],
    props: TABLE_ROW,
    A: { hip: [85, 98], torso: 10, hand: [128, 76], eh: [-0.3, 1], foot: [60, 115], kh: [0, -1] },
    B: { hip: [83, 93], torso: -8, head: 18, hand: [128, 76], eh: [-0.3, 1], foot: [60, 115], kh: [0, -1] },
  },
  pull2: {
    name: 'Tisch-Rudern, Knie leicht gebeugt', unit: 'reps',
    cues: ['Füße weiter weg vom Tisch', 'Körper von Knie bis Schulter gerade', 'Schulterblätter zusammenziehen'],
    props: TABLE_ROW,
    A: { hip: [84, 105], torso: 3, hand: [128, 76], eh: [-0.3, 1], foot: [50, 115], kh: [0, -1] },
    B: { hip: [82, 96], torso: -10, head: 18, hand: [128, 76], eh: [-0.3, 1], foot: [50, 115], kh: [0, -1] },
  },
  pull3: {
    name: 'Tisch-Rudern, Beine gestreckt', unit: 'reps',
    cues: ['Fersen am Boden, Körper gerade', 'Brust zur Tischkante', 'Langsam ablassen'],
    props: TABLE_ROW,
    A: { hip: [83.6, 108.8], torso: -8, hand: [128, 76], eh: [-0.3, 1], foot: [40, 115], kh: [0, -1], toe: -80 },
    B: { hip: [81.8, 101.3], torso: -18, head: 22, hand: [128, 76], eh: [-0.3, 1], foot: [40, 115], kh: [0, -1], toe: -80 },
  },
  pull4: {
    name: 'Negativ-Klimmzug', unit: 'reps', lo: 4, hi: 8, down: 2, needsBar: true,
    cues: ['Mit Hocker in die obere Position (Kinn über Stange)', '4–5 Sekunden kontrolliert ablassen', 'Unten absteigen, neu ansetzen'],
    props: BAR,
    tempo: [0.8, 4.5, 0.5, 0.8],
    A: { hip: [105.3, 56], torso: -92, head: -10, hand: [110, 10], eh: [1, 0.3], foot: [94, 80], kh: [1, 0.2] },
    B: { hip: [110.3, 79.5], torso: -92, hand: [110, 10], eh: [1, 0.3], foot: [97, 104], kh: [1, 0.2] },
  },
  pull5: {
    name: 'Klimmzug im Untergriff', unit: 'reps', lo: 3, hi: 8, down: 1, needsBar: true,
    cues: ['Hände schulterbreit, Handflächen zu dir', 'Aus dem ruhigen Hang hochziehen', 'Kinn über die Stange, langsam ablassen'],
    props: BAR,
    tempo: [0.5, 1.3, 0.4, 1.8],
    A: { hip: [110.3, 79.5], torso: -92, hand: [110, 10], eh: [1, 0.3], foot: [97, 104], kh: [1, 0.2] },
    B: { hip: [105.3, 56], torso: -92, head: -10, hand: [110, 10], eh: [1, 0.3], foot: [94, 80], kh: [1, 0.2] },
  },

  // ---------- Beine ----------
  legs1: {
    name: 'Kniebeuge auf einen Stuhl', unit: 'reps',
    cues: ['Stuhl hinter dir', 'Hüfte nach hinten, Stuhl kurz antippen – nicht absitzen', 'Knie zeigen in Richtung Zehen'],
    props: CHAIR,
    A: { hip: [106, 71], torso: -88, hand: [140, 38], foot: [112, 115], kh: [1, -0.3] },
    B: { hip: [91, 88], torso: -58, hand: [143, 57], foot: [112, 115], kh: [1, -0.3] },
  },
  legs2: {
    name: 'Kniebeuge frei', unit: 'reps',
    cues: ['Füße schulterbreit, Fersen bleiben am Boden', 'So tief, wie es sauber geht', 'Brust aufrecht'],
    A: { hip: [104, 71], torso: -88, hand: [138, 38], foot: [110, 115], kh: [1, -0.3] },
    B: { hip: [87, 95], torso: -52, hand: [141, 64], foot: [110, 115], kh: [1, -0.3] },
  },
  legs3: {
    name: 'Ausfallschritt am Platz', unit: 'reps', perSide: true,
    cues: ['Großer Schritt, Füße bleiben stehen', 'Hinteres Knie Richtung Boden', 'Wiederholungen je Seite'],
    A: { hip: [104, 81], torso: -90, armA: 95, foot: [130, 115], foot2: [78, 115], kh: [1, 0], kh2: [0, 1], toe2: 40 },
    B: { hip: [102, 93], torso: -90, armA: 95, foot: [130, 115], foot2: [78, 115], kh: [1, 0], kh2: [0, 1], toe2: 40 },
  },
  legs4: {
    name: 'Ausfallschritt, hinterer Fuß auf dem Sofa', unit: 'reps', perSide: true,
    cues: ['Hinterer Fuß liegt auf dem Sofa', 'Vorderes Bein trägt das Gewicht', 'Wiederholungen je Seite'],
    props: [['box', 18, 62, 93, [18, 63, 8]]],
    A: { hip: [100, 77], torso: -84, armA: 95, foot: [120, 115], foot2: [58, 90], kh: [1, 0], kh2: [0, 1], toe2: 180 },
    B: { hip: [94, 93], torso: -78, armA: 98, foot: [120, 115], foot2: [58, 90], kh: [1, 0], kh2: [0, 1], toe2: 180 },
  },
  legs5: {
    name: 'Einbeinige Kniebeuge auf einen Stuhl', unit: 'reps', perSide: true,
    cues: ['Auf einem Bein, das andere nach vorn', 'Kontrolliert auf den Stuhl absetzen', 'Ohne Schwung aufstehen, je Seite'],
    props: CHAIR,
    A: { hip: [106, 71], torso: -88, hand: [140, 38], foot: [112, 115], foot2: [118, 108], kh: [1, -0.3], kh2: [1, 0] },
    B: { hip: [91, 88], torso: -55, hand: [144, 60], foot: [112, 115], foot2: [134, 94], kh: [1, -0.3], kh2: [1, 0] },
  },

  // ---------- Rumpf ----------
  core1: {
    name: 'Dead Bug', unit: 'reps', perSide: true,
    cues: ['Rückenlage, unterer Rücken bleibt am Boden', 'Gegengleich Arm und Bein langsam strecken', 'Wiederholungen je Seite'],
    tempo: [0.4, 1.5, 0.4, 1.5],
    A: { hip: [82, 110], torso: 0, head: -10, hand: [118, 77], hand2: [118, 77], eh: [1, -1], foot: [60, 88], foot2: [60, 88], kh: [1, -1], kh2: [1, -1], toe: -90 },
    B: { hip: [82, 110], torso: 0, head: -10, hand: [150, 104], hand2: [118, 77], eh: [1, -1], foot: [60, 88], foot2: [39, 104], kh: [1, -1], kh2: [1, -1], toe: -90 },
  },
  core2: {
    name: 'Unterarmstütz', unit: 'sec', lo: 20, hi: 45, down: 15,
    cues: ['Ellbogen unter den Schultern', 'Körper gerade, Po nicht hoch', 'Abbruch, sobald ein Hohlkreuz entsteht'],
    tempo: [0.5, 2, 0.5, 2],
    A: { hip: [93, 105.8], torso: -12, head: 10, hand: [146, 115], eh: [0, 1], foot: [50, 115], toe: 70 },
    B: { hip: [93, 104.8], torso: -12.5, head: 10, hand: [146, 115], eh: [0, 1], foot: [50, 115], toe: 70 },
  },
  core3: {
    name: 'Seitstütz', unit: 'sec', lo: 20, hi: 45, down: 15, perSide: true,
    cues: ['Ellbogen unter der Schulter', 'Hüfte hoch, Körper eine Linie', 'Zeit je Seite'],
    tempo: [0.5, 2, 0.5, 2],
    A: { hip: [94.3, 102.9], torso: -16, hand: [140, 115], eh: [0, 1], armA2: -90, foot: [52, 115] },
    B: { hip: [94.3, 101.9], torso: -16.5, hand: [140, 115], eh: [0, 1], armA2: -92, foot: [52, 115] },
  },
  core4: {
    name: 'Hollow Hold', unit: 'sec', lo: 20, hi: 45, down: 15,
    cues: ['Rückenlage, unterer Rücken drückt in den Boden', 'Schultern und gestreckte Beine knapp anheben', 'Arme über den Kopf'],
    tempo: [0.5, 2, 0.5, 2],
    A: { hip: [88, 110], torso: -10, hand: [155, 96], eh: [1, -1], foot: [46, 100] },
    B: { hip: [88, 110], torso: -11, hand: [155, 97], eh: [1, -1], foot: [46, 101.5] },
  },
  core5: {
    name: 'Unterarmstütz mit Schieben', unit: 'sec', lo: 20, hi: 45, down: 15,
    cues: ['Aus dem Unterarmstütz', 'Körper über die Zehen langsam vor und zurück schieben', 'Rumpf bleibt gerade'],
    tempo: [0.3, 1.5, 0.3, 1.5],
    A: { hip: [93, 105.8], torso: -12, head: 10, hand: [146, 115], eh: [0, 1], foot: [50, 115], toe: 70 },
    B: { hip: [86, 105.8], torso: -12, head: 10, hand: [146, 115], eh: [0, 1], foot: [43, 115], toe: 70 },
  },

  // ---------- Beweglichkeit / Aufwärmen ----------
  mob_shoulder: {
    name: 'Große Armkreise', unit: 'sec',
    cues: ['Locker stehen', 'Arme gestreckt nach vorn, oben, hinten kreisen', 'Nach der Hälfte Richtung wechseln'],
    loop: true, tempo: [0, 3, 0, 0],
    A: { hip: [100, 71], torso: -90, armA: 90, armA2: 270, foot: [100, 115] },
    B: { hip: [100, 71], torso: -90, armA: -270, armA2: -90, foot: [100, 115] },
  },
  mob_catcow: {
    name: 'Katze-Kuh', unit: 'sec',
    cues: ['Vierfüßlerstand', 'Rücken langsam rund machen, dann sanft durchhängen lassen', 'Ruhig atmen, ohne Druck'],
    tempo: [0.5, 2, 0.5, 2],
    A: { hip: [88, 91], torso: -14, arch: 8, head: 35, hand: [124, 115], foot: [66, 113], kh: [1, 1], toe: 180 },
    B: { hip: [88, 91], torso: -14, arch: -5, head: -20, hand: [124, 115], foot: [66, 113], kh: [1, 1], toe: 180 },
  },
  mob_hinge: {
    name: 'Hüftbeuge im Stand', unit: 'sec',
    cues: ['Knie leicht gebeugt', 'Hüfte nach hinten schieben, Rücken bleibt gerade', 'Zurück in den aufrechten Stand'],
    tempo: [0.4, 1.6, 0.4, 1.6],
    A: { hip: [100, 71], torso: -90, hand: [101, 125], foot: [100, 115] },
    B: { hip: [90, 74], torso: -32, hand: [118, 110], foot: [100, 115] },
  },
  mob_lunge: {
    name: 'Kniender Ausfallschritt mit Armheben', unit: 'sec', perSide: true,
    cues: ['Hinteres Knie am Boden', 'Becken nach vorn schieben', 'Arm der hinteren Seite nach oben strecken'],
    tempo: [0.4, 1.8, 0.8, 1.8],
    A: { hip: [96, 96], torso: -85, armA: 92, armA2: 92, foot: [132, 115], foot2: [60, 113], kh: [0.5, -1], kh2: [0, 1], toe2: 180 },
    B: { hip: [99, 98], torso: -95, armA: -100, armA2: 92, foot: [132, 115], foot2: [63, 113], kh: [0.5, -1], kh2: [0, 1], toe2: 180 },
  },
  mob_squat: {
    name: 'Langsame Kniebeugen', unit: 'sec',
    cues: ['Ganz ruhiges Tempo', 'Nur so tief, wie es angenehm ist', 'Fersen bleiben am Boden'],
    tempo: [0.4, 2, 0.4, 2],
    A: { hip: [104, 71], torso: -88, hand: [138, 38], foot: [110, 115], kh: [1, -0.3] },
    B: { hip: [87, 95], torso: -52, hand: [141, 64], foot: [110, 115], kh: [1, -0.3] },
  },
  mob_deep: {
    name: 'Tiefe Hocke halten', unit: 'sec',
    cues: ['Fersen möglichst am Boden', 'Ellbogen drücken die Knie sanft nach außen', 'Bei Bedarf an einem Türrahmen festhalten'],
    tempo: [0.5, 2.5, 0.5, 2.5],
    A: { hip: [95, 101], torso: -68, hand: [124, 92], eh: [0, 1], foot: [110, 115], kh: [1, -1] },
    B: { hip: [95, 100], torso: -70, hand: [124, 91], eh: [0, 1], foot: [110, 115], kh: [1, -1] },
  },

  // ---------- Dehnen ----------
  st_hipflexor: {
    name: 'Hüftbeuger-Dehnung', unit: 'sec', perSide: true,
    cues: ['Kniender Ausfallschritt', 'Po anspannen, Becken nach vorn', 'Ruhig atmen, nicht wippen'],
    tempo: [0.5, 2.5, 1, 2.5],
    A: { hip: [96, 96], torso: -90, armA: 95, foot: [132, 115], foot2: [60, 113], kh: [0.5, -1], kh2: [0, 1], toe2: 180 },
    B: { hip: [100, 98], torso: -92, armA: 95, foot: [132, 115], foot2: [63, 113], kh: [0.5, -1], kh2: [0, 1], toe2: 180 },
  },
  st_hamstring: {
    name: 'Oberschenkelrückseite in Rückenlage', unit: 'sec', perSide: true,
    cues: ['Rückenlage, ein Bein gestreckt nach oben', 'Hände hinter dem Oberschenkel', 'Sanft zu dir ziehen, Rücken bleibt am Boden'],
    tempo: [0.5, 2.5, 1, 2.5],
    A: { hip: [80, 110], torso: 0, head: -10, hand: [90, 84], eh: [1, -1], foot: [86, 67], foot2: [36, 111], kh: [1, -1], toe: -90 },
    B: { hip: [80, 110], torso: 0, head: -10, hand: [92, 84], eh: [1, -1], foot: [96, 69], foot2: [36, 111], kh: [1, -1], toe: -90 },
  },
  st_chest: {
    name: 'Brust-Dehnung am Türrahmen', unit: 'sec', perSide: true,
    cues: ['Unterarm senkrecht an den Türrahmen', 'Ellbogen auf Schulterhöhe', 'Langsam einen Schritt nach vorn'],
    props: [['wall', 86]],
    tempo: [0.5, 2.5, 1, 2.5],
    A: { hip: [108, 71], torso: -90, hand: [93, 19], eh: [0, 1], hand2: [109, 125], foot: [108, 115] },
    B: { hip: [116, 71], torso: -84, hand: [93, 19], eh: [0, 1], hand2: [119, 125], foot: [116, 115], foot2: [104, 115] },
  },
};

const PATTERNS = [
  { id: 'push', name: 'Drücken', ladder: ['push1', 'push2', 'push3', 'push4', 'push5'] },
  { id: 'legs', name: 'Beine', ladder: ['legs1', 'legs2', 'legs3', 'legs4', 'legs5'] },
  { id: 'pull', name: 'Ziehen', ladder: ['pull1', 'pull2', 'pull3', 'pull4', 'pull5'] },
  { id: 'core', name: 'Rumpf', ladder: ['core1', 'core2', 'core3', 'core4', 'core5'] },
];

// Standardbereiche: 8–12 Wdh. bzw. 20–45 s; darunter "down" → Stufe zurück
function range(exId) {
  const e = EX[exId];
  if (e.unit === 'sec') return { lo: e.lo || 20, hi: e.hi || 45, down: e.down || 15 };
  return { lo: e.lo || 8, hi: e.hi || 12, down: e.down || 6 };
}

const WARMUP = [
  { ex: 'mob_shoulder', sec: 40 },
  { ex: 'mob_catcow', sec: 40 },
  { ex: 'mob_hinge', sec: 40 },
  { ex: 'mob_lunge', sec: 60, note: 'Nach 30 s Seite wechseln' },
  { ex: 'mob_squat', sec: 40 },
  { ex: 'mob_deep', sec: 20 },
];

const COOLDOWN = [
  { ex: 'st_hipflexor', sec: 60, note: 'Nach 30 s Seite wechseln' },
  { ex: 'st_hamstring', sec: 60, note: 'Nach 30 s Seite wechseln' },
  { ex: 'st_chest', sec: 40, note: 'Nach 20 s Seite wechseln' },
  { ex: 'mob_deep', sec: 30 },
];

const MINI_MOB = [
  { ex: 'mob_catcow', sec: 30 },
  { ex: 'mob_lunge', sec: 40, note: 'Nach 20 s Seite wechseln' },
  { ex: 'mob_deep', sec: 30 },
];

// Tests in Woche 0, danach alle 6 Wochen
const TESTS = [
  { id: 'push', label: 'Liegestütze max.', unit: 'Wdh.', better: 1, how: 'Auf der höchsten Stufe, die du sauber schaffst. Stufe wird mitgespeichert.' },
  { id: 'row', label: 'Tisch-Rudern, Beine gestreckt, max.', unit: 'Wdh.', better: 1, how: 'Fußposition beim ersten Test markieren und immer gleich wählen.' },
  { id: 'hang', label: 'Hängen an der Stange', unit: 's', better: 1, optional: true, how: 'Ruhiger Hang, Arme gestreckt. Leer lassen, solange keine Stange da ist.' },
  { id: 'squat', label: 'Kniebeugen in 60 s', unit: 'Wdh.', better: 1, how: 'Volle Tiefe, Fersen am Boden.' },
  { id: 'plank', label: 'Unterarmstütz', unit: 's', better: 1, how: 'Abbruch, sobald ein Hohlkreuz entsteht.' },
  { id: 'ffa', label: 'Finger-Boden-Abstand', unit: 'cm', better: -1, how: 'Stehend, Knie gestreckt, langsam vorbeugen. Berühren = 0, darüber hinaus negativ.' },
  { id: 'shoulder', label: 'Hände hinter dem Rücken', unit: 'cm', better: -1, how: 'Eine Hand von oben, eine von unten. Abstand der Fingerspitzen, Mittel beider Seiten. Überlappen = negativ.' },
  { id: 'deep', label: 'Tiefe Hocke, Fersen am Boden', unit: 's', better: 1, how: 'Ohne Festhalten. 0, wenn die Fersen sofort abheben.' },
  { id: 'waist', label: 'Taillenumfang', unit: 'cm', better: -1, how: 'Morgens, auf Nabelhöhe, entspannt ausatmen.' },
  { id: 'rhr', label: 'Ruhepuls', unit: '/min', better: -1, how: 'Morgens im Liegen, 30 s zählen × 2.' },
];
