/* Suche ueber den gesamten Bestand.
   Die Eingabe laeuft ueber ein echtes <input>: nur dann oeffnet der Fernseher
   seine Bildschirmtastatur. Deshalb bekommt das Feld bei OK den DOM-Fokus,
   und die Pfeiltasten muessen erst wieder herausfuehren - das erledigt der
   Abschnittsfaenger unten. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Cards = global.Cards, Library = global.Library;

  var elScreen, elField, elResults, elHint;
  var lastQuery = "";

  function render(list, query) {
    Cards.release(elResults);
    U.clear(elResults);

    if (query.length < 2) {
      elHint.textContent = "Mit der Fernbedienung tippen: OK auf dem Feld oeffnet die Bildschirmtastatur.";
      return;
    }
    if (!list.length) {
      elHint.textContent = "Nichts gefunden zu: " + query;
      return;
    }
    elHint.textContent = list.length + " Treffer";

    list.forEach(function (it) {
      elResults.appendChild(Cards.make(it, {
        onSelect: function (x) { global.App.go("#/detail/" + encodeURIComponent(x.id)); }
      }));
    });
    Cards.hydrate(elResults);
  }

  function run() {
    var q = elField.value || "";
    if (q === lastQuery) { return; }
    lastQuery = q;
    render(Library.search(q), q.trim());
  }

  var Search = {
    id: "search",
    el: "#screen-search",

    init: function () {
      elScreen = U.$("#screen-search");
      elField = U.$("#search-input");
      elResults = U.$("#search-results");
      elHint = U.$("#search-hint");

      var debounced = U.tick(run, 220);
      elField.addEventListener("input", debounced);
      elField.addEventListener("change", run);

      U.$("#search-clear").addEventListener("click", function () {
        elField.value = "";
        lastQuery = " ";       // erzwingt Neuzeichnen
        run();
        Nav.focus(elField);
      });

      /* Solange der Cursor im Feld steht, sollen Links/Rechts den Text
         bewegen und nicht den Fokus. Nur Ab fuehrt in die Trefferliste. */
      Nav.trap("search-input", function (dir, el) {
        if (el !== elField) { return false; }
        if (dir === "left" || dir === "right") { return true; }
        if (dir === "down") {
          var first = U.$("[data-focusable]", elResults);
          if (first) { Nav.focus(first, dir); return true; }
        }
        return false;
      });
    },

    enter: function () {
      elScreen.hidden = false;
      elScreen.scrollTop = 0;
      Nav.focus(elField);
      return Promise.resolve();
    },

    leave: function () {
      Cards.release(elResults);
      elScreen.hidden = true;
    }
  };

  return (global.ScreenSearch = Search);
}(window));
