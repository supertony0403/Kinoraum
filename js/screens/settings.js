/* Einstellungen: Quellen einrichten und pruefen.

   Alles wird sofort in den Speicher geschrieben, sobald ein Feld verlassen
   wird - auf dem Fernseher geht ein Formular sonst beim kleinsten Fehltritt
   verloren. Der Verbindungstest fragt den Server wirklich an und meldet
   Klartext zurueck, statt nur "Fehler" zu sagen. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Store = global.Store;

  var elScreen, elBody;

  /* ---------------------------------------------------------------- Bausteine */

  function group(title, note) {
    var g = U.el("section", "set-group");
    g.setAttribute("data-nav-section", "settings");
    g.appendChild(U.el("h3", "set-group__title", title));
    if (note) { g.appendChild(U.el("p", "set-group__note", note)); }
    return g;
  }

  function field(label, value, note, onChange) {
    var wrap = U.el("div", "field");
    wrap.appendChild(U.el("label", "field__label", label));

    var input = U.el("input", "field__input");
    input.type = "text";
    input.value = value || "";
    input.setAttribute("data-focusable", "");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    input.addEventListener("change", function () { onChange(input.value.trim()); });
    input.addEventListener("blur", function () { onChange(input.value.trim()); });

    wrap.appendChild(input);
    if (note) { wrap.appendChild(U.el("p", "field__note", note)); }
    wrap.__input = input;
    return wrap;
  }

  function toggle(label, hint, isOn, onToggle) {
    var b = U.el("button", "toggle");
    b.setAttribute("data-focusable", "");

    var left = U.el("span");
    left.appendChild(U.el("span", "toggle__label", label));
    if (hint) { left.appendChild(U.el("span", "toggle__hint", hint)); }
    left.firstChild.style.display = "block";

    var state = U.el("span", "toggle__state");

    function paint(on) {
      state.textContent = on ? "An" : "Aus";
      state.className = "toggle__state" + (on ? " toggle__state--on" : "");
    }
    paint(isOn());

    b.addEventListener("click", function () {
      onToggle(!isOn());
      paint(isOn());
    });

    b.appendChild(left);
    b.appendChild(state);
    return b;
  }

  function button(label, cls, onClick) {
    var b = U.el("button", "btn " + (cls || ""), label);
    b.setAttribute("data-focusable", "");
    b.addEventListener("click", onClick);
    return b;
  }

  function statusLine() {
    var s = U.el("p", "status");
    s.hidden = true;
    s.set = function (text, kind) {
      s.hidden = false;
      s.textContent = text;
      s.className = "status" + (kind ? " status--" + kind : "");
    };
    return s;
  }

  /* ---------------------------------------------------------------- Jellyfin */

  function jellyfinGroup() {
    var cfg = Store.source("jellyfin");
    var g = group(
      "Jellyfin",
      "Eigener Medienserver. Der Schluessel steht in Jellyfin unter " +
      "Systemsteuerung, API-Schluessel. Die Adresse mit Schema angeben, " +
      "zum Beispiel https://jellyfin.benz-sw.de"
    );

    g.appendChild(toggle(
      "Jellyfin verwenden", "Erst einschalten, wenn Adresse, Schluessel und Benutzer stehen",
      function () { return Store.source("jellyfin").enabled === true; },
      function (v) { Store.setSource("jellyfin", { enabled: v }); }
    ));

    var fUrl = field("Serveradresse", cfg.url, null, function (v) {
      Store.setSource("jellyfin", { url: U.trimSlash(v) });
    });
    var fKey = field("API-Schluessel", cfg.apiKey, null, function (v) {
      Store.setSource("jellyfin", { apiKey: v });
    });
    var fUser = field("Benutzerkennung", cfg.userId,
      "Wird vom Verbindungstest ausgefuellt", function (v) {
        Store.setSource("jellyfin", { userId: v });
      });

    g.appendChild(fUrl);
    g.appendChild(fKey);
    g.appendChild(fUser);

    var st = statusLine();
    var acts = U.el("div", "set-acts");

    acts.appendChild(button("Verbindung pruefen", "", function () {
      var url = U.trimSlash(fUrl.__input.value.trim());
      var key = fKey.__input.value.trim();
      Store.setSource("jellyfin", { url: url, apiKey: key });

      if (!url || !key) {
        st.set("Adresse und Schluessel werden beide gebraucht.", "bad");
        return;
      }
      st.set("Verbinde ...");

      global.SourceJellyfin.users(url, key).then(function (users) {
        if (!users.length) {
          st.set("Verbindung steht, aber der Server meldet keine Benutzer.", "bad");
          return;
        }
        // Steht noch keine Kennung, wird der erste Benutzer uebernommen.
        var chosen = users.filter(function (u) { return u.id === fUser.__input.value.trim(); })[0] || users[0];
        fUser.__input.value = chosen.id;
        Store.setSource("jellyfin", { userId: chosen.id });

        var names = users.map(function (u) { return u.name; }).join(", ");
        st.set("Verbunden. Benutzer: " + names + ". Aktiv: " + chosen.name, "ok");
      }).catch(function (err) {
        st.set("Fehlgeschlagen: " + err.message +
               " (Adresse, Schluessel und Erreichbarkeit vom Fernseher aus pruefen)", "bad");
      });
    }));

    acts.appendChild(button("Benutzer wechseln", "btn--ghost", function () {
      var url = U.trimSlash(fUrl.__input.value.trim());
      var key = fKey.__input.value.trim();
      if (!url || !key) { st.set("Erst Adresse und Schluessel eintragen.", "bad"); return; }

      global.SourceJellyfin.users(url, key).then(function (users) {
        if (users.length < 2) { st.set("Der Server kennt nur einen Benutzer.", null); return; }
        var cur = fUser.__input.value.trim();
        var idx = 0, i;
        for (i = 0; i < users.length; i++) { if (users[i].id === cur) { idx = i + 1; } }
        var next = users[idx % users.length];
        fUser.__input.value = next.id;
        Store.setSource("jellyfin", { userId: next.id });
        st.set("Aktiver Benutzer: " + next.name, "ok");
      }).catch(function (err) { st.set("Fehlgeschlagen: " + err.message, "bad"); });
    }));

    g.appendChild(acts);
    g.appendChild(st);
    return g;
  }

  /* ---------------------------------------------------------------- Eigene Liste */

  function streamsGroup() {
    var cfg = Store.source("streams");
    var g = group(
      "Eigene Stream-Liste",
      "Adresse einer M3U-Playlist oder einer JSON-Liste. Gedacht fuer Material, " +
      "an dem du die Rechte haeltst: eigene Aufnahmen, eigene Dateien hinter einem " +
      "Webserver, frei lizenzierte Mediatheken."
    );

    g.appendChild(toggle(
      "Eigene Liste verwenden", null,
      function () { return Store.source("streams").enabled === true; },
      function (v) { Store.setSource("streams", { enabled: v }); }
    ));

    var fUrl = field("Adresse der Liste", cfg.url,
      "Endet ueblicherweise auf .m3u, .m3u8 oder .json", function (v) {
        Store.setSource("streams", { url: v });
      });
    g.appendChild(fUrl);

    var st = statusLine();
    var acts = U.el("div", "set-acts");
    acts.appendChild(button("Liste pruefen", "", function () {
      var url = fUrl.__input.value.trim();
      Store.setSource("streams", { url: url });
      if (!url) { st.set("Es ist keine Adresse eingetragen.", "bad"); return; }
      st.set("Lade ...");
      global.SourceStreams.probe(url).then(function (n) {
        st.set(n > 0 ? ("Gelesen: " + n + " Eintraege.") : "Die Liste ist leer.", n > 0 ? "ok" : "bad");
      }).catch(function (err) { st.set("Fehlgeschlagen: " + err.message, "bad"); });
    }));
    g.appendChild(acts);
    g.appendChild(st);
    return g;
  }

  /* ---------------------------------------------------------------- Rest */

  function demoGroup() {
    var g = group(
      "Demo-Bibliothek",
      "Sechs frei lizenzierte Filme, die mit der App ausgeliefert werden: " +
      "die Kurzfilme der Blender Foundation unter CC BY sowie zwei gemeinfreie Filme. " +
      "Gut geeignet, um die Wiedergabe ohne eigenen Server zu pruefen."
    );
    g.appendChild(toggle(
      "Demo-Bibliothek zeigen", null,
      function () { return Store.source("demo").enabled === true; },
      function (v) { Store.setSource("demo", { enabled: v }); }
    ));
    return g;
  }

  function prefsGroup() {
    var g = group("Wiedergabe", null);
    g.appendChild(toggle(
      "Merkpunkte setzen", "Angefangene Titel erscheinen unter Weiterschauen",
      function () { return Store.pref("resume") === true; },
      function (v) { Store.setPref("resume", v); }
    ));
    g.appendChild(toggle(
      "Fortschritt an Jellyfin melden", "Andere Geraete ziehen dann mit",
      function () { return Store.pref("reportToServer") === true; },
      function (v) { Store.setPref("reportToServer", v); }
    ));
    return g;
  }

  function actionsGroup() {
    var g = group("Bestand", null);
    var st = statusLine();
    var acts = U.el("div", "set-acts");

    acts.appendChild(button("Bestand neu laden", "", function () {
      st.set("Lade ...");
      global.ScreenHome.reload().then(function (d) {
        var n = global.Library.items.length;
        var probs = global.Library.problems;
        if (probs.length) {
          st.set(n + " Titel geladen. Probleme: " + probs.map(function (p) {
            return p.source + " (" + p.message + ")";
          }).join(", "), "bad");
        } else {
          st.set(n + " Titel geladen.", "ok");
        }
      }).catch(function (err) { st.set("Fehlgeschlagen: " + err.message, "bad"); });
    }));

    acts.appendChild(button("Alle Merkpunkte loeschen", "btn--ghost", function () {
      var list = global.Store.resumeList();
      list.forEach(function (p) { Store.clearProgress(p.id); });
      st.set(list.length + " Merkpunkte geloescht.", "ok");
      global.ScreenHome.refreshRows();
    }));

    acts.appendChild(button("Auf Werkszustand", "btn--danger", function () {
      Store.reset();
      st.set("Zurueckgesetzt. Bestand wird neu geladen.", "ok");
      global.ScreenHome.reload().then(function () { Settings.render(); });
    }));

    g.appendChild(acts);
    g.appendChild(st);

    if (!Store.writable) {
      var warn = statusLine();
      warn.set("Achtung: Der Speicher des Fernsehers ist nicht beschreibbar. " +
               "Einstellungen gelten nur bis zum Beenden der App.", "bad");
      g.appendChild(warn);
    }
    return g;
  }

  function aboutGroup() {
    var g = group("Ueber", null);
    var p = U.el("p", "set-group__note",
      "Kinoraum " + (global.App && global.App.version ? global.App.version : "") +
      " - Mediathek fuer eigene Quellen. Die App bringt selbst keine Inhalte mit " +
      "ausser den frei lizenzierten Demo-Titeln; alles Weitere kommt aus den " +
      "Quellen, die du oben eintraegst.");
    g.appendChild(p);
    return g;
  }

  /* ---------------------------------------------------------------- Schirm */

  var Settings = {
    id: "settings",
    el: "#screen-settings",

    init: function () {
      elScreen = U.$("#screen-settings");
      elBody = U.$("#settings-body");
    },

    render: function () {
      U.clear(elBody);
      elBody.appendChild(jellyfinGroup());
      elBody.appendChild(streamsGroup());
      elBody.appendChild(demoGroup());
      elBody.appendChild(prefsGroup());
      elBody.appendChild(actionsGroup());
      elBody.appendChild(aboutGroup());
    },

    enter: function () {
      elScreen.hidden = false;
      elScreen.scrollTop = 0;
      Settings.render();
      Nav.focusFirst(elBody);
      return Promise.resolve();
    },

    leave: function () { elScreen.hidden = true; }
  };

  return (global.ScreenSettings = Settings);
}(window));
