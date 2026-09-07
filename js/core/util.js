/* Kinoraum - kleine Helfer.
   Sprachstand bewusst ES2015: webOS 4.x faehrt Chromium 53, dort fehlen
   async/await, optionale Verkettung und String.padStart. */
(function (global) {
  "use strict";

  var U = {};

  /* ------------------------------------------------------------------ DOM */

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  U.el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  };

  U.clear = function (node) {
    while (node && node.firstChild) { node.removeChild(node.firstChild); }
    return node;
  };

  /* ------------------------------------------------------------------ Zeit */

  U.pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  /** Sekunden -> "1:07:24" bzw. "7:24". */
  U.hms = function (sec) {
    if (!isFinite(sec) || sec < 0) { sec = 0; }
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h > 0 ? h + ":" + U.pad2(m) + ":" + U.pad2(s) : m + ":" + U.pad2(s);
  };

  /** Minuten -> "1 Std. 47 Min." */
  U.runtime = function (min) {
    if (!min) { return ""; }
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h && m) { return h + " Std. " + m + " Min."; }
    if (h) { return h + " Std."; }
    return m + " Min.";
  };

  U.clockNow = function () {
    var d = new Date();
    return U.pad2(d.getHours()) + ":" + U.pad2(d.getMinutes());
  };

  /* ------------------------------------------------------------------ Text */

  U.tick = function (fn, ms) {
    var t = null;
    return function () {
      var self = this, args = arguments;
      if (t) { clearTimeout(t); }
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  };

  /** Vergleichsform fuer die Suche: klein, ohne Umlaut-Sonderform, ohne Zeichen. */
  U.fold = function (s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  /* Stabiler Farbton aus dem Titel: gleiche Kachel bekommt immer dieselbe
     Flaeche, auch nach Neustart. Ersetzt fehlende Poster, ohne kaputt zu wirken. */
  U.hash = function (s) {
    var h = 2166136261, i;
    s = String(s || "");
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  };

  U.tintFor = function (title) {
    var h = U.hash(title);
    var a = h % 360;
    var b = (a + 38 + (h >> 9) % 40) % 360;
    return "linear-gradient(150deg, hsl(" + a + ",42%,26%) 0%, hsl(" + b + ",48%,14%) 100%)";
  };

  /* ------------------------------------------------------------------ Netz
     XMLHttpRequest statt fetch: liefert auf allen webOS-Staenden ein echtes
     Zeitlimit, fetch braucht dafuer AbortController (erst Chromium 66). */

  U.http = function (opts) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      var done = false;
      var method = opts.method || "GET";

      function fail(msg) {
        if (done) { return; }
        done = true;
        reject(new Error(msg));
      }

      try {
        x.open(method, opts.url, true);
      } catch (e) {
        fail("Ungueltige Adresse");
        return;
      }

      x.timeout = opts.timeout || 15000;
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (k) {
          try { x.setRequestHeader(k, opts.headers[k]); } catch (e) { /* egal */ }
        });
      }

      x.onreadystatechange = function () {
        if (x.readyState !== 4 || done) { return; }
        done = true;
        if (x.status >= 200 && x.status < 300) {
          if (opts.json === false) { resolve(x.responseText); return; }
          try {
            resolve(x.responseText ? JSON.parse(x.responseText) : null);
          } catch (e) {
            reject(new Error("Antwort ist kein gueltiges JSON"));
          }
          return;
        }
        if (x.status === 0) { reject(new Error("Keine Verbindung")); return; }
        reject(new Error("Server meldet " + x.status));
      };
      x.ontimeout = function () { fail("Zeitueberschreitung"); };
      x.onerror = function () { fail("Keine Verbindung"); };

      try {
        x.send(opts.body === undefined ? null : opts.body);
      } catch (e) {
        fail("Anfrage fehlgeschlagen");
      }
    });
  };

  /** Haengt Parameter an eine Adresse - encodeURIComponent fuer jeden Wert. */
  U.withQuery = function (url, params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") { return; }
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    if (!parts.length) { return url; }
    return url + (url.indexOf("?") === -1 ? "?" : "&") + parts.join("&");
  };

  /** Schneidet Schraegstriche am Ende ab, damit Pfade nicht doppelt entstehen. */
  U.trimSlash = function (s) { return String(s || "").replace(/\/+$/, ""); };

  return (global.U = U);
}(window));
