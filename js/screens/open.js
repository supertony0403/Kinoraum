/* "Adresse oeffnen" - eine Stream-Adresse eintippen und sofort abspielen.

   Auf dem Fernseher ist Tippen muehsam, deshalb:
   - Was einmal eingetragen wurde, laesst sich merken und steht danach als
     Kachel auf der Startseite.
   - Fehlt das Schema, wird https:// ergaenzt, statt eine Fehlermeldung zu
     zeigen - "beispiel.de/film.mp4" ist das, was Leute eintippen.
   - Die Adresse wird vor dem Abspielen geprueft, damit der Player nicht
     ins Leere laeuft und der Nutzer vor einem schwarzen Bild sitzt. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Store = global.Store;

  var elScreen, elBody;
  var lastUrl = "";
  var lastTitle = "";

  /* ---------------------------------------------------------------- Adresse */

  /** Ergaenzt ein fehlendes Schema und schneidet Leerzeichen weg. */
  function tidy(url) {
    var s = String(url || "").trim();
    if (!s) { return ""; }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) { s = "https://" + s; }
    return s;
  }

  function looksPlayable(url) {
    return /^https?:\/\/[^/\s]+\/?/i.test(url);
  }

  /* ---------------------------------------------------------------- Bausteine */

  function field(label, value, placeholder, note, onInput) {
    var wrap = U.el("div", "field");
    wrap.appendChild(U.el("label", "field__label", label));
    var input = U.el("input", "field__input");
    input.type = "text";
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.setAttribute("data-focusable", "");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.addEventListener("input", function () { onInput(input.value); });
    input.addEventListener("change", function () { onInput(input.value); });
    wrap.appendChild(input);
    if (note) { wrap.appendChild(U.el("p", "field__note", note)); }
    wrap.__input = input;
    return wrap;
  }

  function button(label, cls, onClick) {
    var b = U.el("button", "btn " + (cls || ""), label);
    b.setAttribute("data-focusable", "");
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------------------------------------------------------------- Aufbau */

  function render() {
    U.clear(elBody);

    var g = U.el("section", "set-group");
    g.setAttribute("data-nav-section", "open");
    g.appendChild(U.el("h3", "set-group__title", "Adresse abspielen"));
    g.appendChild(U.el("p", "set-group__note",
      "Adresse einer Videodatei oder eines Streams - MP4, MKV oder eine " +
      "m3u8-Playlist. Das Schema darf fehlen, https:// wird ergaenzt."));

    var fUrl = field("Adresse", lastUrl, "beispiel.de/film.mp4", null,
      function (v) { lastUrl = v; });
    var fTitle = field("Titel", lastTitle, "wird sonst aus der Adresse abgeleitet",
      "Nur fuer die Anzeige auf der Startseite", function (v) { lastTitle = v; });
    g.appendChild(fUrl);
    g.appendChild(fTitle);

    var st = U.el("p", "status");
    st.hidden = true;
    function say(text, kind) {
      st.hidden = false;
      st.textContent = text;
      st.className = "status" + (kind ? " status--" + kind : "");
    }

    /** Gemeinsamer Weg fuer beide Knoepfe. */
    function take() {
      var url = tidy(fUrl.__input.value);
      if (!url) { say("Es ist keine Adresse eingetragen.", "bad"); return null; }
      if (!looksPlayable(url)) {
        say("Das sieht nicht nach einer Web-Adresse aus: " + url, "bad");
        return null;
      }
      fUrl.__input.value = url;
      lastUrl = url;
      return url;
    }

    var acts = U.el("div", "set-acts");

    acts.appendChild(button("Jetzt abspielen", "btn--primary", function () {
      var url = take();
      if (!url) { return; }
      say("Adresse wird geprueft ...");
      // Erst anklopfen: lieber hier eine klare Meldung als ein schwarzes Bild.
      probe(url).then(function (info) {
        say(info, "ok");
        global.App.play(global.SourceLinks.itemFor(url, fTitle.__input.value.trim()), 0);
      }).catch(function () {
        /* Fremde Server erlauben dem Browser die Vorabfrage meist nicht (CORS).
           Das sagt nichts ueber die Adresse aus - das Abspielen selbst
           unterliegt der Regel nicht. Also neutral melden und starten. */
        say("Vorabpruefung nicht moeglich (der Server erlaubt sie nicht) - wird direkt abgespielt.");
        global.App.play(global.SourceLinks.itemFor(url, fTitle.__input.value.trim()), 0);
      });
    }));

    acts.appendChild(button("Merken", "", function () {
      var url = take();
      if (!url) { return; }
      var entry = Store.addLink(url, fTitle.__input.value.trim());
      if (!entry) { say("Konnte nicht gespeichert werden.", "bad"); return; }
      say("Gemerkt: " + (entry.title || global.SourceLinks.titleFromUrl(url)), "ok");
      fUrl.__input.value = "";
      fTitle.__input.value = "";
      lastUrl = "";
      lastTitle = "";
      global.App.reloadLibrary().then(function () { renderKeep(); });
    }));

    g.appendChild(acts);
    g.appendChild(st);
    elBody.appendChild(g);

    elBody.appendChild(savedGroup());
  }

  /** Neu zeichnen und dabei den Fokus im Bildschirm halten. */
  function renderKeep() {
    render();
    Nav.revalidate(elScreen);
    if (!Nav.current || !elScreen.contains(Nav.current)) { Nav.focusFirst(elBody); }
  }

  function savedGroup() {
    var links = Store.links();
    var g = U.el("section", "set-group");
    g.setAttribute("data-nav-section", "open-saved");
    g.appendChild(U.el("h3", "set-group__title", "Gemerkte Adressen"));

    if (!links.length) {
      g.appendChild(U.el("p", "set-group__note",
        "Noch nichts gemerkt. Gemerkte Adressen erscheinen hier und als eigene " +
        "Reihe auf der Startseite."));
      return g;
    }

    g.appendChild(U.el("p", "set-group__note",
      links.length + (links.length === 1 ? " Eintrag" : " Eintraege") +
      " - stehen auf der Startseite unter „Meine Adressen“."));

    links.forEach(function (l) {
      var row = U.el("div", "linkrow");

      var play = U.el("button", "linkrow__main");
      play.setAttribute("data-focusable", "");
      play.appendChild(U.el("span", "linkrow__title", l.title || global.SourceLinks.titleFromUrl(l.url)));
      play.appendChild(U.el("span", "linkrow__url", l.url));
      play.addEventListener("click", function () {
        global.App.play(global.SourceLinks.itemFor(l.url, l.title), 0);
      });

      var del = U.el("button", "btn btn--danger linkrow__del", "Entfernen");
      del.setAttribute("data-focusable", "");
      del.addEventListener("click", function () {
        Store.removeLink(l.url);
        global.App.toast("Entfernt");
        global.App.reloadLibrary().then(function () { renderKeep(); });
      });

      row.appendChild(play);
      row.appendChild(del);
      g.appendChild(row);
    });
    return g;
  }

  /* ---------------------------------------------------------------- Anklopfen
     HEAD zuerst; wer das nicht mag, bekommt einen winzigen Range-GET. */

  function probe(url) {
    return U.http({ method: "HEAD", url: url, json: false, timeout: 9000 })
      .then(function () { return "Adresse antwortet."; })
      .catch(function () {
        return U.http({
          method: "GET", url: url, json: false, timeout: 9000,
          headers: { Range: "bytes=0-1024" }
        }).then(function () { return "Adresse antwortet."; });
      });
  }

  /* ---------------------------------------------------------------- Bildschirm */

  var Open = {
    id: "open",
    el: "#screen-open",

    init: function () {
      elScreen = U.$("#screen-open");
      elBody = U.$("#open-body");

      /* Im Textfeld duerfen Links/Rechts den Cursor bewegen. */
      function trap(dir, el) {
        if (el && el.tagName === "INPUT" && (dir === "left" || dir === "right")) { return true; }
        return false;
      }
      Nav.trap("open", trap);
      Nav.trap("open-saved", trap);
    },

    enter: function () {
      elScreen.hidden = false;
      elScreen.scrollTop = 0;
      render();
      Nav.focusFirst(elBody);
      return Promise.resolve();
    },

    leave: function () { elScreen.hidden = true; }
  };

  return (global.ScreenOpen = Open);
}(window));
