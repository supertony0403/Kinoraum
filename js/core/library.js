/* Bibliothek: fasst alle eingeschalteten Quellen zu einem Bestand zusammen
   und baut daraus die Reihen der Startseite.
   Faellt eine Quelle aus, wird sie vermerkt, aber der Rest wird gezeigt -
   ein toter Server darf nicht die ganze App leeren. */
(function (global) {
  "use strict";

  var U = global.U;
  var Store = global.Store;

  var SOURCES = [global.SourceLinks, global.SourceDemo, global.SourceStreams, global.SourceJellyfin];

  var items = [];
  var byId = {};
  var problems = [];

  function active() {
    return SOURCES.filter(function (s) { return s && s.enabled(); });
  }

  function index() {
    byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
  }

  /* ---------------------------------------------------------------- Reihen */

  function resumeRow() {
    var out = [];
    Store.resumeList().forEach(function (p) {
      var it = byId[p.id];
      if (!it) { return; }
      // Kopie mit Fortschritt, damit die Karte den Balken zeichnen kann.
      var c = {};
      Object.keys(it).forEach(function (k) { c[k] = it[k]; });
      c.progress = p.dur > 0 ? Math.min(0.99, p.pos / p.dur) : 0;
      c.resumeAt = p.pos;
      out.push(c);
    });
    return out.slice(0, 20);
  }

  function genreRows(pool) {
    var buckets = {};
    pool.forEach(function (it) {
      (it.genres || []).forEach(function (g) {
        g = String(g).trim();
        if (!g) { return; }
        if (!buckets[g]) { buckets[g] = []; }
        buckets[g].push(it);
      });
    });

    return Object.keys(buckets)
      .filter(function (g) { return buckets[g].length >= 2; })
      .sort(function (a, b) { return buckets[b].length - buckets[a].length; })
      .slice(0, 8)
      .map(function (g) { return { key: "genre:" + g, title: g, items: buckets[g] }; });
  }

  function buildRows(extra) {
    var rows = [];
    var res = resumeRow();

    if (res.length) {
      rows.push({ key: "resume", title: "Weiterschauen", items: res });
    }

    (extra || []).forEach(function (r) {
      if (r && r.items && r.items.length) { rows.push(r); }
    });

    /* Uebersichtsreihe je Quelle. Bei genau einer Quelle heisst sie schlicht
       "Alle Titel" - sonst stuende dort die Quelle als einzige Ueberschrift
       ueber dem gesamten Bestand, was nichts erklaert. */
    var srcs = {};
    items.forEach(function (it) {
      if (!srcs[it.source]) { srcs[it.source] = []; }
      srcs[it.source].push(it);
    });
    var srcKeys = Object.keys(srcs);
    srcKeys.forEach(function (k) {
      rows.push({
        key: "src:" + k,
        title: srcKeys.length > 1 ? srcs[k][0].sourceLabel : "Alle Titel",
        items: srcs[k]
      });
    });

    genreRows(items).forEach(function (r) { rows.push(r); });

    if (!rows.length && items.length) {
      rows.push({ key: "all", title: "Alles", items: items });
    }
    return rows;
  }

  /* ---------------------------------------------------------------- Laden */

  var Library = {
    get items() { return items; },
    get problems() { return problems; },

    get: function (id) { return byId[id] || null; },

    activeSources: active,

    load: function () {
      problems = [];
      var srcs = active();
      if (!srcs.length) {
        items = [];
        index();
        return Promise.resolve({ rows: [], items: [] });
      }

      // Jede Quelle einzeln absichern: eine Absage darf die anderen nicht
      // mitreissen, deshalb wird jeder Fehler in einen leeren Treffer gewandelt.
      var jobs = srcs.map(function (s) {
        return s.list().then(function (list) {
          // Manche Quellen melden auch bei Erfolg etwas Wichtiges,
          // etwa eine gekuerzte Liste.
          if (s.note) {
            var n = s.note();
            if (n) { problems.push({ source: s.label, message: n }); }
          }
          return list;
        }).catch(function (err) {
          problems.push({ source: s.label, message: err && err.message ? err.message : "Unbekannter Fehler" });
          return [];
        });
      });

      return Promise.all(jobs).then(function (lists) {
        var seen = {};
        items = [];
        lists.forEach(function (list) {
          list.forEach(function (it) {
            if (seen[it.id]) { return; }
            seen[it.id] = true;
            items.push(it);
          });
        });
        index();

        // Jellyfin liefert eigene Reihen, wenn es eingeschaltet ist.
        var jf = global.SourceJellyfin;
        if (!jf.enabled()) {
          return { rows: buildRows([]), items: items };
        }
        return Promise.all([jf.resume(), jf.latest()]).then(function (r) {
          var extra = [];
          if (r[1] && r[1].length) {
            extra.push({ key: "jf-latest", title: "Neu in der Bibliothek", items: r[1] });
          }
          if (r[0] && r[0].length) {
            // Serverseitige Merkpunkte nach vorn, vor die lokalen Reihen.
            extra.unshift({ key: "jf-resume", title: "Auf dem Server angefangen", items: r[0] });
          }
          return { rows: buildRows(extra), items: items };
        });
      });
    },

    /** Reihen ohne Neuladen erzeugen - nach dem Abspielen fuer "Weiterschauen". */
    rows: function () { return buildRows([]); },

    search: function (q) {
      var needle = U.fold(q);
      if (needle.length < 2) { return []; }
      var parts = needle.split(" ");

      return items
        .map(function (it) {
          var hay = U.fold(it.title + " " + (it.genres || []).join(" ") + " " + (it.year || ""));
          var score = 0, i, p;
          for (i = 0; i < parts.length; i++) {
            p = parts[i];
            if (hay.indexOf(p) === -1) { return null; }
            // Treffer am Wortanfang wiegen schwerer als irgendwo mittendrin.
            score += hay.indexOf(p) === 0 ? 3 : (hay.indexOf(" " + p) !== -1 ? 2 : 1);
          }
          return { it: it, score: score };
        })
        .filter(function (x) { return x !== null; })
        .sort(function (a, b) { return b.score - a.score; })
        .map(function (x) { return x.it; })
        .slice(0, 60);
    },

    /** Abspieladressen besorgen (bei Jellyfin erst hier). */
    resolve: function (item) {
      var src = SOURCES.filter(function (s) { return s && s.id === item.source; })[0];
      if (!src || !src.resolve) { return Promise.resolve(item); }
      return src.resolve(item);
    },

    reportProgress: function (item, pos, paused) {
      var src = SOURCES.filter(function (s) { return s && s.id === item.source; })[0];
      if (src && src.report) { src.report(item, pos, paused); }
    }
  };

  return (global.Library = Library);
}(window));
