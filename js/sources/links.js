/* Eigene Adressen.

   Was ueber "Adresse oeffnen" gemerkt wurde, liegt im Speicher des Fernsehers
   und erscheint hier als normale Quelle - damit die Eintraege auf der
   Startseite, in der Suche und in "Weiterschauen" genauso auftauchen wie
   alles andere.

   Anders als sources/streams.js braucht das keine erreichbare Listendatei:
   die Adressen stehen im Geraet. */
(function (global) {
  "use strict";

  var U = global.U;

  function typeOf(url) {
    var clean = String(url || "").split("?")[0].toLowerCase();
    if (clean.indexOf(".m3u8") !== -1) { return "hls"; }
    if (clean.indexOf(".mpd") !== -1) { return "dash"; }
    return "mp4";
  }

  /** Notnagel fuer den Titel: der Dateiname aus der Adresse, entzerrt.
      Aus ".../Der_grosse_Film-1080p.mp4" wird "Der grosse Film 1080p". */
  function titleFromUrl(url) {
    var s = String(url).split("?")[0].split("#")[0];
    var last = s.substring(s.lastIndexOf("/") + 1);
    last = last.replace(/\.[a-z0-9]{2,5}$/i, "");
    last = last.replace(/[._+-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!last) {
      // Keine brauchbare Datei in der Adresse - dann eben der Rechnername.
      var m = /^[a-z]+:\/\/([^/]+)/i.exec(s);
      return m ? m[1] : "Adresse";
    }
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  function toItem(link) {
    var title = link.title || titleFromUrl(link.url);
    return {
      id: "links:" + U.hash(link.url),
      source: "links",
      sourceLabel: "Meine Adressen",
      title: title,
      year: null,
      runtime: null,
      overview: link.url,          // die Adresse selbst ist hier die nuetzlichste Angabe
      genres: [],
      poster: null,                // ohne Bild zeichnet die Kachel ihre Farbflaeche
      backdrop: null,
      license: "",
      credit: "",
      url: link.url,
      streams: [{ url: link.url, type: typeOf(link.url), label: "Original" }],
      subtitles: []
    };
  }

  global.SourceLinks = {
    id: "links",
    label: "Meine Adressen",

    /* Kein Schalter noetig: liegt nichts vor, liefert die Quelle nichts. */
    enabled: function () { return global.Store.links().length > 0; },

    list: function () {
      return Promise.resolve(global.Store.links().map(toItem));
    },

    resolve: function (item) { return Promise.resolve(item); },

    /* Fuer den Bildschirm "Adresse oeffnen": ein Eintrag ohne Speichern. */
    itemFor: function (url, title) {
      return toItem({ url: url, title: title || "" });
    },

    titleFromUrl: titleFromUrl
  };

  return global.SourceLinks;
}(window));
