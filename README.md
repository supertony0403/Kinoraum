# Kinoraum

Mediathek-App für LG-Fernseher mit **webOS** — kein Android, sondern eine echte
webOS-App, die als `.ipk` auf den Fernseher installiert wird.

Bedienung mit der normalen Fernbedienung: Steuerkreuz, OK, Zurück, dazu die
Farb- und Medientasten. Optik in Richtung der großen Streaming-Oberflächen —
Bühne oben, waagerechte Reihen darunter, Detailseite, eigener Player.

Die App bringt **keine Inhalte mit**, abgesehen von einer kleinen Demo-Bibliothek
aus frei lizenzierten Filmen. Alles Weitere kommt aus Quellen, die du selbst
einträgst.

---

## Quellen

| Quelle | Wofür | Was du brauchst |
|---|---|---|
| **Jellyfin** | Dein eigener Medienserver | Serveradresse + API-Schlüssel |
| **Eigene Stream-Liste** | M3U- oder JSON-Liste mit eigenen Adressen | Eine erreichbare URL |
| **Demo-Bibliothek** | Sofort etwas zum Ausprobieren | nichts |

### Jellyfin

Der beste Weg, wenn eigene Filme und Serien auf einem Server liegen.

1. In Jellyfin: **Systemsteuerung → API-Schlüssel → Neuer Schlüssel**
2. In Kinoraum: **Einstellungen → Jellyfin**, Adresse und Schlüssel eintragen
3. **Verbindung prüfen** — die Benutzerkennung wird dabei automatisch gesetzt
4. Schalter **Jellyfin verwenden** auf An

Unterstützt: Filme, Serien mit Folgen, Untertitel, Ton- und Qualitätswahl,
serverseitige Merkpunkte („Weiterschauen" auch geräteübergreifend).

Die App fragt zuerst einen umgewandelten HLS-Strom an und fällt auf die
direkte Fassung zurück, wenn der Fernseher den Codec ohnehin beherrscht.
Beide Wege lassen sich im Player unter **Spuren → Abspielweg** umschalten.

### Eigene Stream-Liste

Eine Adresse, die entweder eine M3U-Playlist oder eine JSON-Liste liefert.

**M3U:**

```
#EXTM3U
#EXTINF:-1 tvg-logo="https://beispiel.de/bild.jpg" group-title="Doku",Mein Titel
https://beispiel.de/film.m3u8
```

**JSON:**

```json
[
  {
    "title": "Mein Titel",
    "url": "https://beispiel.de/film.mp4",
    "year": 2024,
    "runtime": 96,
    "overview": "Kurzbeschreibung",
    "poster": "https://beispiel.de/poster.jpg",
    "genres": ["Doku"],
    "subtitles": [{ "url": "https://beispiel.de/de.vtt", "lang": "de", "label": "Deutsch" }]
  }
]
```

Gedacht für Material, an dem du die Rechte hältst: eigene Aufnahmen, eigene
Dateien hinter einem Webserver, frei lizenzierte Mediatheken.

### Demo-Bibliothek

Sechs Titel, die ohne jede Einrichtung laufen:

| Titel | Jahr | Lizenz |
|---|---|---|
| Sintel | 2010 | CC BY 3.0 — Blender Foundation |
| Big Buck Bunny | 2008 | CC BY 3.0 — Blender Foundation |
| Tears of Steel | 2012 | CC BY 3.0 — Blender Foundation |
| Elephants Dream | 2006 | CC BY 3.0 US — Blender Foundation |
| The General | 1926 | Public Domain Mark 1.0 |
| Nosferatu | 1922 | gemeinfrei |

Lizenz und Urheber stehen an jedem Eintrag in der Detailansicht — bei CC BY
ist die Namensnennung Pflicht.

---

## Bauen und installieren

### Einmal am Fernseher

1. Im **LG Content Store** die App **Developer Mode** installieren
2. Mit einem LG-Entwicklerkonto anmelden, **Dev Mode Status** einschalten
   (der Fernseher startet dabei neu)
3. Die App zeigt danach eine **IP-Adresse** und einen **Passphrase**

### Einmal am Rechner

```bash
ares-setup-device
# Gerät hinzufügen:  Name "tv" · die IP vom Fernseher · Port 9922 · Benutzer "prisoner"
# Schlüssel holen:   ares-novacom --device tv --getkey   (fragt nach dem Passphrase)
```

Fehlt `ares-*` im System, legt `scripts/build.sh` die Werkzeuge beim ersten
Lauf lokal ins Projekt (`npm install @webosose/ares-cli`, ohne Systemeingriff).

### Jedes Mal

```bash
scripts/build.sh        # erzeugt dist/de.benzsw.kinoraum_1.0.0_all.ipk
scripts/install.sh tv   # installiert und startet auf dem Fernseher
```

Fehlersuche bei laufender App (öffnet die Entwicklerwerkzeuge im Browser):

```bash
ares-inspect --device tv --app de.benzsw.kinoraum
```

Wieder entfernen:

```bash
ares-install --device tv --remove de.benzsw.kinoraum
```

> Der Entwicklermodus von LG läuft nach etwa 50 Stunden ab. In der
> Developer-Mode-App am Fernseher verlängert **Extend** ihn wieder; die
> installierte App bleibt dabei erhalten.

### Am Rechner ausprobieren

```bash
scripts/dev.sh          # http://127.0.0.1:8137/
```

Browserfenster auf 1920×1080 stellen. Pfeiltasten und Enter ersetzen die
Fernbedienung. Die Zurück-Taste des Fernsehers entspricht `Esc`.

---

## Fernbedienung

| Taste | Wirkung |
|---|---|
| Steuerkreuz | Fokus bewegen |
| OK | Auslösen · im Player: Pause/Weiter, wenn der Regler den Fokus hat |
| Zurück | Eine Ebene zurück · schließt den Player · beendet die App auf der Startseite |
| Rot | Suche |
| Grün | Einstellungen |
| Gelb | Bestand neu laden |
| ◀◀ / ▶▶ | 30 Sekunden springen |
| ▶ / ❚❚ / ■ | Wiedergabe steuern |

Im Player blendet die Leiste nach gut vier Sekunden aus. Der erste Tastendruck
holt sie nur zurück, ohne etwas auszulösen — so verstellt man nichts aus Versehen.

Auf dem Fortschrittsregler springen **links/rechts** in Zehn-Sekunden-Schritten.
Schnelle Druckfolgen werden aufaddiert und erst nach kurzer Ruhe ausgeführt,
damit sich der Fernseher nicht durch den Film ruckelt.

---

## Aufbau

```
appinfo.json            Anmeldung der App bei webOS
index.html              Gerüst aller Schirme
css/app.css             Gestaltung (auf 3 m Abstand ausgelegt)
js/core/util.js         Helfer: DOM, Zeit, HTTP über XMLHttpRequest
js/core/keys.js         Tastencodes der LG-Fernbedienung
js/core/nav.js          Fokus-Steuerung, räumlich gerechnet
js/core/store.js        Einstellungen und Merkpunkte (localStorage)
js/core/card.js         Kachel-Fabrik mit verzögertem Bildnachladen
js/core/library.js      Führt alle Quellen zu einem Bestand zusammen
js/sources/demo.js      Mitgelieferte freie Titel
js/sources/streams.js   M3U- und JSON-Listen
js/sources/jellyfin.js  Jellyfin-Anbindung
js/screens/*.js         Startseite, Detail, Suche, Einstellungen, Player
js/app.js               Wegweiser, Tastenverteilung, Start
scripts/                Bauen, Installieren, Bilder erzeugen
```

### Warum der Code so aussieht

- **ES2015, kein `async`/`await`, keine optionale Verkettung.** webOS 4.x
  fährt Chromium 53. Moderne Syntax ergäbe auf älteren Geräten einen weißen
  Schirm ohne Fehlermeldung.
- **`XMLHttpRequest` statt `fetch`.** Nur so gibt es ein verlässliches
  Zeitlimit; `fetch` bräuchte dafür `AbortController` (erst Chromium 66).
- **Reihen werden per `transform` verschoben, nicht per `scrollLeft`.** Die
  Verschiebung bleibt damit auf der GPU und ruckelt auf schwachen Panels nicht.
- **Fokus wird räumlich berechnet**, nicht über feste Zeilen-/Spalten-Tabellen.
  Das hält auch bei ungleich langen Reihen und nachgeladenen Kacheln.
- **Kein Zustand hängt an `:hover`.** Der Fokus ist die einzige Wahrheit.
- **Fällt eine Quelle aus, wird sie vermerkt, der Rest wird gezeigt.** Ein
  toter Server darf nicht die ganze App leeren.

### Demo-Bilder neu erzeugen

Poster und Hintergründe der Demo-Titel sind Einzelbilder aus den Filmen,
per `ffmpeg` geholt (nur die nötigen Byte-Bereiche, nicht die ganze Datei):

```bash
python3 scripts/make_demo_art.py            # nur was fehlt
python3 scripts/make_demo_art.py --force    # alles neu
```

App-Icon und Startbild:

```bash
python3 scripts/make_assets.py
```

---

## Was diese App nicht tut

Kinoraum enthält keinen Zugang zu Streaming-Portalen ohne Lizenz und keinen
Baustein, um solche Seiten anzuzapfen. Die Quellen-Schnittstelle nimmt
Adressen entgegen, die du einträgst — was dahinter liegt und ob du daran die
Rechte hältst, entscheidest du.

Wer eigene Filme und Serien auf dem Fernseher sehen will, richtet dafür am
besten **Jellyfin** ein: kostenlos, quelloffen, läuft auf jedem Server oder
im eigenen Cluster, und die App spricht es vollständig an.

---

## Lizenz

Der Code steht unter der MIT-Lizenz (`LICENSE`).

`js/lib/hls.min.js` ist [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0).

Die Demo-Filme stehen unter den oben genannten Lizenzen und gehören ihren
jeweiligen Urhebern.
