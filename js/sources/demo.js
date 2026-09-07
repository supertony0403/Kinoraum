/* Mitgelieferte Bibliothek.
   Ausschliesslich Material, dessen Lizenz das freie Abspielen erlaubt:
   die Blender-Kurzfilme unter CC BY und zwei gemeinfreie Filme.
   Lizenz und Urheber stehen an jedem Eintrag und werden in den Details
   angezeigt - die Namensnennung ist bei CC BY Pflicht.

   Zweck: die App zeigt beim ersten Start etwas Echtes, und der Abspielweg
   (MP4 direkt) laesst sich ohne eigenen Server pruefen. */
(function (global) {
  "use strict";

  var U = global.U;

  var IA = "https://archive.org/download/";

  /* Poster und Hintergrund liegen als Datei in der App (scripts/make_demo_art.py
     zieht sie einmalig aus den Filmen). Das haelt die Startseite scharf und
     macht sie unabhaengig von fremden Vorschaubildern. Fehlt eine Datei,
     zeichnet die Kachel ihre Farbflaeche - kaputt aussehen kann nichts. */
  var ART = "assets/demo/";

  function ia(id, file) { return IA + id + "/" + file; }

  var CATALOG = [
    {
      key: "sintel", ia: "Sintel",
      title: "Sintel", year: 2010, runtime: 15,
      genres: ["Animation", "Fantasy"],
      overview: "Ein Maedchen zieht durch eine karge Welt, um einen jungen Drachen wiederzufinden, den sie einst gesund gepflegt hat. Der dritte offene Film der Blender Foundation.",
      license: "CC BY 3.0", credit: "Blender Foundation",
      file: "sintel-2048-surround_512kb.mp4"
    },
    {
      key: "bbb", ia: "BigBuckBunny_124",
      title: "Big Buck Bunny", year: 2008, runtime: 10,
      genres: ["Animation", "Komoedie"],
      overview: "Ein gutmuetiger Riesenhase wird von drei Nagetieren gepiesackt und sinnt auf eine sehr gruendliche Antwort.",
      license: "CC BY 3.0", credit: "Blender Foundation",
      file: "Content/big_buck_bunny_720p_surround.mp4"
    },
    {
      key: "tos", ia: "Tears-of-Steel",
      title: "Tears of Steel", year: 2012, runtime: 12,
      genres: ["Science-Fiction"],
      overview: "In einem zerstoerten Amsterdam versucht eine Gruppe Wissenschaftler, mit den Erinnerungen eines alten Mannes eine Katastrophe rueckgaengig zu machen.",
      license: "CC BY 3.0", credit: "Blender Foundation",
      file: "tears_of_steel_720p.mp4"
    },
    {
      key: "ed", ia: "ElephantsDream",
      title: "Elephants Dream", year: 2006, runtime: 11,
      genres: ["Animation", "Experimentell"],
      overview: "Zwei Maenner bewegen sich durch eine gewaltige, staendig umbauende Maschine und streiten darueber, was davon wirklich da ist.",
      license: "CC BY 3.0 US", credit: "Blender Foundation",
      file: "ed_hd_512kb.mp4"
    },
    {
      key: "general", ia: "TheGeneral1926",
      title: "The General", year: 1926, runtime: 79,
      genres: ["Komoedie", "Stummfilm"],
      overview: "Ein Lokfuehrer verfolgt im amerikanischen Buergerkrieg seine entfuehrte Lokomotive - und nebenbei seine Verlobte. Buster Keatons bekanntester Film.",
      license: "Public Domain Mark 1.0", credit: "Buster Keaton Productions",
      file: "The_General_1926_720p_512kb.mp4"
    },
    {
      key: "nosferatu", ia: "nosferatu_1922",
      title: "Nosferatu", year: 1922, runtime: 94,
      genres: ["Horror", "Stummfilm"],
      overview: "Ein Makler reist in die Karpaten zu einem Grafen, der Wohnraum sucht - und bringt etwas mit zurueck. Murnaus fruehe Vampirverfilmung.",
      license: "Gemeinfrei", credit: "Prana-Film",
      file: "nosferatu_1922.mp4"
    }
  ];

  function toItem(row) {
    return {
      id: "demo:" + row.key,
      source: "demo",
      sourceLabel: "Demo",
      title: row.title,
      year: row.year,
      runtime: row.runtime,
      overview: row.overview,
      genres: row.genres || [],
      poster: ART + row.key + "-poster.jpg",
      backdrop: ART + row.key + "-backdrop.jpg",
      license: row.license,
      credit: row.credit,
      streams: [{ url: ia(row.ia, row.file), type: "mp4", label: "Original" }],
      subtitles: []
    };
  }

  global.SourceDemo = {
    id: "demo",
    label: "Demo-Bibliothek",

    enabled: function () { return global.Store.source("demo").enabled === true; },

    /* Rein lokal - kein Netzzugriff noetig, um die Liste aufzubauen. */
    list: function () {
      return Promise.resolve(CATALOG.map(toItem));
    },

    /* Adressen stehen schon fest, es gibt nichts nachzuladen. */
    resolve: function (item) { return Promise.resolve(item); }
  };

  return global.SourceDemo;
}(window));
