/* Dauerhafter Speicher: Einstellungen und Merkpunkte.
   localStorage ist auf webOS pro App abgeschottet und ueberlebt Neustarts.
   Jeder Zugriff ist gekapselt - im Entwicklermodus kann der Speicher
   abgeschaltet sein, dann laeuft die App eben ohne Gedaechtnis weiter. */
(function (global) {
  "use strict";

  var U = global.U;
  var NS = "kinoraum.v1";
  var MAX_PROGRESS = 200;      // sonst waechst der Eintrag unbegrenzt

  var DEFAULTS = {
    sources: {
      demo:     { enabled: true },
      jellyfin: { enabled: false, url: "", apiKey: "", userId: "" },
      streams:  { enabled: false, url: "" }
    },
    tmdb: { apiKey: "" },
    prefs: { resume: true, reportToServer: true },
    progress: {},
    links: []          // selbst eingetragene Adressen, siehe sources/links.js
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /* Vorgaben und Gespeichertes zusammenlegen, damit neue Felder spaeterer
     Versionen nicht fehlen. Nur Objekte werden vertieft. */
  function merge(base, over) {
    var out = clone(base), k;
    if (!over || typeof over !== "object") { return out; }
    for (k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) { continue; }
      if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) &&
          over[k] && typeof over[k] === "object" && !Array.isArray(over[k])) {
        out[k] = merge(out[k], over[k]);
      } else if (over[k] !== undefined) {
        out[k] = over[k];
      }
    }
    return out;
  }

  var state = clone(DEFAULTS);
  var writable = true;

  function load() {
    try {
      var raw = global.localStorage.getItem(NS);
      state = raw ? merge(DEFAULTS, JSON.parse(raw)) : clone(DEFAULTS);
    } catch (e) {
      state = clone(DEFAULTS);
      writable = false;
    }
  }

  function save() {
    if (!writable) { return false; }
    try {
      global.localStorage.setItem(NS, JSON.stringify(state));
      return true;
    } catch (e) {
      writable = false;
      return false;
    }
  }

  load();

  var Store = {
    get all() { return state; },
    get writable() { return writable; },

    source: function (name) { return state.sources[name] || {}; },

    setSource: function (name, patch) {
      state.sources[name] = merge(state.sources[name] || {}, patch);
      save();
      return state.sources[name];
    },

    tmdbKey: function () { return state.tmdb.apiKey || ""; },
    setTmdbKey: function (k) { state.tmdb.apiKey = String(k || "").trim(); save(); },

    pref: function (k) { return state.prefs[k]; },
    setPref: function (k, v) { state.prefs[k] = v; save(); },

    /* ------------------------------------------------------------ Merkpunkte */

    progressFor: function (id) { return state.progress[id] || null; },

    /** Merkt die Position. Ganz vorn und ganz hinten wird verworfen,
        sonst landen Titel in "Weiterschauen", die niemand angefangen hat
        oder die laengst durch sind. */
    setProgress: function (id, pos, dur) {
      if (!id || !isFinite(pos) || !isFinite(dur) || dur < 60) { return; }
      if (pos < 20 || pos > dur - 45) {
        delete state.progress[id];
        save();
        return;
      }
      state.progress[id] = { pos: Math.floor(pos), dur: Math.floor(dur), at: Date.now() };
      Store.prune();
      save();
    },

    clearProgress: function (id) { delete state.progress[id]; save(); },

    /** Aelteste Merkpunkte abraeumen, wenn die Liste zu lang wird. */
    prune: function () {
      var keys = Object.keys(state.progress);
      if (keys.length <= MAX_PROGRESS) { return; }
      keys.sort(function (a, b) { return state.progress[b].at - state.progress[a].at; });
      keys.slice(MAX_PROGRESS).forEach(function (k) { delete state.progress[k]; });
    },

    /** Angefangene Titel, neueste zuerst. */
    resumeList: function () {
      return Object.keys(state.progress)
        .map(function (id) {
          var p = state.progress[id];
          return { id: id, pos: p.pos, dur: p.dur, at: p.at };
        })
        .sort(function (a, b) { return b.at - a.at; });
    },

    /* ------------------------------------------------------ Eigene Adressen */

    links: function () { return state.links.slice(); },

    /** Adresse merken. Gleiche Adresse zweimal ergibt keinen zweiten Eintrag,
        der Titel wird dann nur aufgefrischt. Neueste stehen vorn. */
    addLink: function (url, title) {
      url = String(url || "").trim();
      if (!url) { return null; }

      var existing = null, i;
      for (i = 0; i < state.links.length; i++) {
        if (state.links[i].url === url) { existing = state.links[i]; break; }
      }
      // Ist der Speicher gesperrt, meldet save() false. Dann darf die
      // Oberflaeche nicht "gemerkt" sagen - der Eintrag waere beim naechsten
      // Start weg, ohne dass es jemand ahnt.
      if (existing) {
        if (title) { existing.title = title; }
        return save() ? existing : null;
      }

      var entry = { url: url, title: title || "", at: Store.stamp() };
      state.links.unshift(entry);
      if (state.links.length > 200) { state.links.length = 200; }
      if (!save()) {
        state.links.shift();
        return null;
      }
      return entry;
    },

    removeLink: function (url) {
      state.links = state.links.filter(function (l) { return l.url !== url; });
      // Der Merkpunkt haengt an der Kennung der Adresse. Bleibt er stehen,
      // taucht der geloeschte Eintrag als Karteileiche in "Weiterschauen" auf.
      delete state.progress["links:" + U.hash(url)];
      save();
    },

    /* Date.now() gekapselt, damit es nur an einer Stelle steht. */
    stamp: function () { return new Date().getTime(); },

    reset: function () {
      state = clone(DEFAULTS);
      save();
    }
  };

  return (global.Store = Store);
}(window));
