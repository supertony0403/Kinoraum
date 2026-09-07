/* Rahmen: Wegweiser zwischen den Schirmen, Tastenverteilung, Start.

   Der Player ist bewusst kein eigener Weg im Adressbalken, sondern eine
   Schicht darueber. So landet die Zurueck-Taste nach dem Abspielen wieder
   genau dort, wo der Titel angetippt wurde. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Keys = global.Keys;

  var VERSION = "1.0.0";

  var SCREENS = {};
  var currentId = null;
  var stack = [];                 // Wege fuer die Zurueck-Taste
  var toastTimer = null;
  var booted = false;

  /* ---------------------------------------------------------------- Wege */

  function parse(hash) {
    var raw = String(hash || "").replace(/^#\/?/, "");
    var parts = raw.split("/");
    var name = parts[0] || "home";
    if (name === "detail") {
      return { name: "detail", params: { id: decodeURIComponent(parts[1] || "") } };
    }
    if (!SCREENS[name]) { return { name: "home", params: {} }; }
    return { name: name, params: {} };
  }

  function markTabs(name) {
    U.$$(".tab").forEach(function (t) {
      var target = parse(t.getAttribute("data-route")).name;
      t.classList.toggle("tab--on", target === name);
    });
  }

  function show(route) {
    var next = SCREENS[route.name];
    if (!next) { return Promise.resolve(); }

    if (currentId && currentId !== route.name && SCREENS[currentId]) {
      SCREENS[currentId].leave();
    }
    currentId = route.name;
    markTabs(route.name);

    return Promise.resolve(next.enter(route.params)).then(function () {
      Nav.revalidate(U.$(next.el));
    });
  }

  /* ---------------------------------------------------------------- App */

  var App = {
    version: VERSION,

    go: function (hash) {
      var cur = global.location.hash;
      if (cur && cur !== hash) { stack.push(cur); }
      if (global.location.hash === hash) {
        show(parse(hash));
      } else {
        global.location.hash = hash;
      }
    },

    /** Zurueck: erst den Player, dann den Stapel, dann die Startseite.
        Steht die App schon auf der Startseite, wird sie beendet. */
    back: function () {
      if (global.ScreenPlayer.open) { global.ScreenPlayer.close(); return; }

      if (stack.length) {
        var prev = stack.pop();
        if (global.location.hash === prev) {
          show(parse(prev));
        } else {
          global.location.hash = prev;
        }
        return;
      }
      if (currentId !== "home") {
        global.location.hash = "#/home";
        return;
      }
      App.exit();
    },

    exit: function () {
      // webOS beendet die App ueber platformBack; window.close ist der Notnagel.
      try {
        if (global.webOS && global.webOS.platformBack) { global.webOS.platformBack(); return; }
      } catch (e) { /* egal */ }
      try { global.close(); } catch (e) { /* egal */ }
    },

    play: function (item, at) {
      global.ScreenPlayer.start(item, at || 0);
    },

    /** Nach dem Player: Reihen auffrischen, damit Weiterschauen stimmt. */
    afterPlayback: function () {
      global.ScreenHome.refreshRows();
      var scr = SCREENS[currentId];
      if (scr) { Nav.revalidate(U.$(scr.el)); }
    },

    toast: function (text, ms) {
      var t = U.$("#toast");
      t.textContent = text;
      t.hidden = false;
      if (toastTimer) { clearTimeout(toastTimer); }
      toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3200);
    },

    reloadLibrary: function () { return global.ScreenHome.reload(); }
  };

  global.App = App;

  /* ---------------------------------------------------------------- Tasten */

  function onKey(ev) {
    var code = ev.keyCode || ev.which;

    if (global.ScreenPlayer.open) {
      if (global.ScreenPlayer.onKey(code)) { ev.preventDefault(); }
      return;
    }

    if (Keys.isBack(code)) {
      ev.preventDefault();
      App.back();
      return;
    }

    // Im Textfeld duerfen Zeichen- und Loeschtasten durch.
    var inField = Nav.current && Nav.current.tagName === "INPUT";

    var dir = Keys.dirOf(code);
    if (dir) {
      ev.preventDefault();
      Nav.move(dir);
      return;
    }

    if (Keys.isOk(code)) {
      if (inField) { return; }        // OK im Feld oeffnet die Tastatur des TV
      ev.preventDefault();
      Nav.activate();
      return;
    }

    if (code === Keys.RED) { ev.preventDefault(); App.go("#/search"); return; }
    if (code === Keys.GREEN) { ev.preventDefault(); App.go("#/settings"); return; }
    if (code === Keys.YELLOW) {
      ev.preventDefault();
      App.toast("Bestand wird neu geladen ...");
      App.reloadLibrary().then(function () { App.toast("Bestand aktualisiert"); });
      return;
    }
  }

  /* ---------------------------------------------------------------- Start */

  function tickClock() {
    U.$("#clock").textContent = U.clockNow();
  }

  function boot() {
    if (booted) { return; }
    booted = true;

    SCREENS.home = global.ScreenHome;
    SCREENS.search = global.ScreenSearch;
    SCREENS.settings = global.ScreenSettings;
    SCREENS.detail = global.ScreenDetail;

    Object.keys(SCREENS).forEach(function (k) { SCREENS[k].init(); });
    global.ScreenPlayer.init();

    U.$$(".tab").forEach(function (t) {
      t.addEventListener("click", function () { App.go(t.getAttribute("data-route")); });
    });

    document.addEventListener("keydown", onKey, false);

    global.addEventListener("hashchange", function () {
      show(parse(global.location.hash));
    });

    tickClock();
    setInterval(tickClock, 20000);

    // Der Bestand wird einmal beim Start geholt; danach nur noch auf Zuruf.
    global.ScreenHome.reload().catch(function (err) {
      App.toast("Bestand konnte nicht geladen werden: " + err.message, 6000);
    }).then(function () {
      if (!global.location.hash) { global.location.hash = "#/home"; }
      return show(parse(global.location.hash));
    }).then(function () {
      var b = U.$("#boot");
      b.classList.add("boot--off");
      setTimeout(function () { b.hidden = true; }, 400);
    });

    /* webOS meldet den Wechsel in den Hintergrund. Dann anhalten und merken -
       sonst laeuft der Ton weiter, waehrend der Nutzer fernsieht. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && global.ScreenPlayer.open) {
        var v = U.$("#video");
        if (v && !v.paused) { v.pause(); }
      }
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 0);
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }
}(window));
