/* Eigene Stream-Liste.
   Zeigt auf eine Adresse, die entweder eine M3U-Playlist oder eine
   JSON-Liste liefert. Gedacht fuer Material, an dem der Nutzer die Rechte
   haelt: eigene Aufnahmen, eigene Dateien hinter einem Webserver,
   frei lizenzierte Mediatheken.

   JSON-Form:
     [{ "title": "...", "url": "...", "year": 2019, "overview": "...",
        "poster": "...", "backdrop": "...", "genres": ["..."],
        "runtime": 96, "subtitles": [{"url":"...","lang":"de","label":"Deutsch"}] }]

   M3U-Form:
     #EXTM3U
     #EXTINF:-1 tvg-logo="https://.../bild.jpg" group-title="Doku",Titel
     https://.../datei.m3u8
*/
(function (global) {
  "use strict";

  var U = global.U;

  /* Ungebremst ist genau das die Quelle, an der die App stirbt: uebliche
     IPTV-Listen haben 5.000 bis 50.000 Zeilen, daraus werden zehntausende
     DOM-Knoten und ueber eine Sekunde Wartezeit pro Tastendruck. Was
     abgeschnitten wird, sagt die App im Klartext - stilles Kuerzen liest
     sich wie "alles da". */
  var MAX = 1000;
  var lastNote = null;

  /* --------------------------------------------------------------- Parser */

  function typeOf(url) {
    var clean = String(url || "").split("?")[0].toLowerCase();
    if (clean.indexOf(".m3u8") !== -1) { return "hls"; }
    if (clean.indexOf(".mpd") !== -1) { return "dash"; }
    return "mp4";
  }

  /** Ein Attribut aus einer #EXTINF-Zeile ziehen: name="wert". */
  function attr(line, name) {
    var m = new RegExp(name + '="([^"]*)"').exec(line);
    return m ? m[1] : "";
  }

  function parseM3U(text) {
    var lines = String(text).split(/\r?\n/);
    var out = [];
    var pending = null;
    var i, line;

    for (i = 0; i < lines.length; i++) {
      line = lines[i].trim();
      if (!line) { continue; }

      if (line.indexOf("#EXTINF:") === 0) {
        // Der Titel steht hinter dem letzten Komma der Zeile.
        var comma = line.lastIndexOf(",");
        pending = {
          title: comma === -1 ? "Ohne Titel" : line.slice(comma + 1).trim(),
          poster: attr(line, "tvg-logo"),
          group: attr(line, "group-title")
        };
        continue;
      }
      if (line.charAt(0) === "#") { continue; }

      out.push({
        title: pending && pending.title ? pending.title : line,
        url: line,
        poster: pending ? pending.poster : "",
        genres: pending && pending.group ? [pending.group] : []
      });
      pending = null;
    }
    return out;
  }

  function parseJSON(text) {
    var data = JSON.parse(text);
    if (Array.isArray(data)) { return data; }
    if (data && Array.isArray(data.items)) { return data.items; }
    throw new Error("JSON enthaelt keine Liste");
  }

  function normalise(raw, idx) {
    var url = raw.url || raw.stream || raw.src || "";
    if (!url) { return null; }
    var title = raw.title || raw.name || ("Eintrag " + (idx + 1));
    return {
      id: "streams:" + U.hash(url + "|" + title),
      source: "streams",
      sourceLabel: "Eigene Liste",
      title: title,
      year: raw.year || null,
      runtime: raw.runtime || null,
      overview: raw.overview || raw.description || "",
      genres: Array.isArray(raw.genres) ? raw.genres : (raw.group ? [raw.group] : []),
      poster: raw.poster || raw.logo || null,
      backdrop: raw.backdrop || raw.poster || null,
      license: raw.license || "",
      credit: raw.credit || "",
      streams: [{ url: url, type: raw.type || typeOf(url), label: raw.quality || "Original" }],
      subtitles: Array.isArray(raw.subtitles) ? raw.subtitles : []
    };
  }

  /* --------------------------------------------------------------- Quelle */

  global.SourceStreams = {
    id: "streams",
    label: "Eigene Liste",

    enabled: function () {
      var c = global.Store.source("streams");
      return c.enabled === true && !!c.url;
    },

    /** Hinweis zum letzten Ladevorgang, den die Bibliothek einsammelt. */
    note: function () { return lastNote; },

    list: function () {
      var cfg = global.Store.source("streams");
      lastNote = null;
      if (!cfg.url) { return Promise.resolve([]); }

      return U.http({ url: cfg.url, json: false, timeout: 20000 }).then(function (text) {
        var raws;
        var head = String(text).replace(/^﻿/, "").trim();
        if (head.charAt(0) === "[" || head.charAt(0) === "{") {
          raws = parseJSON(head);
        } else if (head.indexOf("#EXTM3U") === 0 || head.indexOf("#EXTINF") !== -1) {
          raws = parseM3U(head);
        } else {
          throw new Error("Format nicht erkannt (weder M3U noch JSON)");
        }

        var gesamt = raws.length;
        if (raws.length > MAX) { raws = raws.slice(0, MAX); }

        var out = [];
        raws.forEach(function (r, i) {
          var it = normalise(r, i);
          if (it) { out.push(it); }
        });
        if (gesamt > MAX) {
          lastNote = "Liste gekuerzt: " + MAX + " von " + gesamt +
                     " Eintraegen geladen (sonst wird der Fernseher unbedienbar)";
        }
        return out;
      });
    },

    resolve: function (item) { return Promise.resolve(item); },

    /* Fuer den Verbindungstest in den Einstellungen. */
    probe: function (url) {
      return U.http({ url: url, json: false, timeout: 15000 }).then(function (text) {
        var head = String(text).replace(/^﻿/, "").trim();
        var n;
        if (head.charAt(0) === "[" || head.charAt(0) === "{") {
          n = parseJSON(head).length;
        } else if (head.indexOf("#EXTM3U") === 0 || head.indexOf("#EXTINF") !== -1) {
          n = parseM3U(head).length;
        } else {
          throw new Error("Format nicht erkannt (weder M3U noch JSON)");
        }
        return n;
      });
    },

    _parseM3U: parseM3U       // fuer Tests
  };

  return global.SourceStreams;
}(window));
