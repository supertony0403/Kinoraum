/* Startseite: Buehne oben, darunter waagerechte Reihen.

   Das Nachfuehren des Fokus (senkrecht wie waagerecht) steht in core/nav.js
   und gilt damit fuer alle Schirme. Frueher lag es hier und griff nur auf
   der Startseite - auf Suche, Einstellungen und Detailblatt lief der Fokus
   deshalb unsichtbar aus dem Bild. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Cards = global.Cards, Library = global.Library;

  /* Deckel je Reihe. Eine IPTV-Liste bringt schnell tausende Eintraege mit;
     ungebremst entstehen zehntausende DOM-Knoten und der Fokus braucht pro
     Tastendruck ueber eine Sekunde. Was darueber liegt, bleibt ueber die
     Suche erreichbar - der Hinweis in der Reihenkopfzeile sagt das auch. */
  var MAX_PRO_REIHE = 60;

  var elScreen, elRows;
  var featured = null;
  var built = false;

  /* ---------------------------------------------------------------- Buehne */

  function setHero(item) {
    featured = item;
    var art = U.$("#hero-art");
    art.classList.remove("is-on");

    U.$("#hero-kicker").textContent = item.sourceLabel || "";
    U.$("#hero-title").textContent = item.title;

    var facts = [];
    if (item.year) { facts.push(item.year); }
    if (item.runtime) { facts.push(U.runtime(item.runtime)); }
    if ((item.genres || []).length) { facts.push(item.genres.slice(0, 3).join(", ")); }
    U.$("#hero-facts").textContent = facts.join("  ·  ");
    U.$("#hero-text").textContent = item.overview || "";

    var hero = U.$("#hero");
    // Farbflaeche als Grund - sie traegt die Buehne, wenn kein Bild taugt.
    hero.style.background = U.tintFor(item.title);
    hero.classList.add("hero--noart");

    if (item.backdrop) {
      art.onload = function () {
        // Kleine Vorschaubilder werden auf 1920 hochgezogen und sehen matschig
        // aus. Unter dieser Breite bleibt lieber die gezeichnete Flaeche stehen.
        if (art.naturalWidth < 720) {
          art.removeAttribute("src");
          return;
        }
        art.classList.add("is-on");
        hero.classList.remove("hero--noart");
      };
      art.onerror = function () { art.removeAttribute("src"); };
      art.src = item.backdrop;
    } else {
      art.removeAttribute("src");
    }
  }

  /* ---------------------------------------------------------------- Reihen */

  function buildRow(row) {
    var sec = U.el("section", "row");
    sec.setAttribute("data-nav-section", "row");
    sec.setAttribute("data-row-key", row.key);

    var gezeigt = row.items.slice(0, MAX_PRO_REIHE);

    var head = U.el("div", "row__head");
    head.appendChild(U.el("h2", "row__title", row.title));
    head.appendChild(U.el("span", "row__note",
      gezeigt.length < row.items.length
        ? gezeigt.length + " von " + row.items.length + " - Rest ueber die Suche"
        : row.items.length + " Titel"));
    sec.appendChild(head);

    var vp = U.el("div", "row__vp");
    var track = U.el("div", "row__track");

    gezeigt.forEach(function (it) {
      track.appendChild(Cards.make(it, {
        onSelect: function (x) { global.App.go("#/detail/" + encodeURIComponent(x.id)); }
      }));
    });

    vp.appendChild(track);
    sec.appendChild(vp);
    return sec;
  }

  /* ---------------------------------------------------------------- Aufbau */

  function emptyState() {
    var empty = U.el("div", "empty");
    empty.appendChild(U.el("b", null, "Noch keine Quelle eingerichtet"));
    empty.appendChild(document.createTextNode(
      "Unter Einstellungen laesst sich ein Jellyfin-Server verbinden oder eine eigene " +
      "Stream-Liste hinterlegen. Ueber „Adresse“ geht auch eine einzelne " +
      "Stream-Adresse. Die mitgelieferte Demo-Bibliothek kann dort wieder " +
      "eingeschaltet werden."));

    // Ohne fokussierbares Element haette dieser Schirm gar keinen Fokusring,
    // und der Nutzer haelt die App fuer abgestuerzt.
    var acts = U.el("div", "set-acts");
    acts.setAttribute("data-nav-section", "empty");
    acts.style.marginTop = "36px";

    var a = U.el("button", "btn btn--primary", "Zu den Einstellungen");
    a.setAttribute("data-focusable", "");
    a.addEventListener("click", function () { global.App.go("#/settings"); });
    acts.appendChild(a);

    var b = U.el("button", "btn", "Adresse abspielen");
    b.setAttribute("data-focusable", "");
    b.addEventListener("click", function () { global.App.go("#/open"); });
    acts.appendChild(b);

    empty.appendChild(acts);
    return empty;
  }

  function render(data) {
    // Ohne das Abmelden bleiben die alten Bilder samt Kachelbaum am
    // IntersectionObserver haengen - bei jedem Neuladen eine Kopie mehr.
    Cards.release(elRows);
    U.clear(elRows);

    if (!data.rows.length) {
      elRows.appendChild(emptyState());
      U.$("#hero").style.display = "none";
      built = true;                 // sonst laedt jeder Besuch den Bestand neu
      return;
    }

    U.$("#hero").style.display = "";
    data.rows.forEach(function (row) { elRows.appendChild(buildRow(row)); });

    // Aufmacher: erster Titel der ersten Reihe, die nicht "Weiterschauen" ist.
    var pick = null;
    data.rows.forEach(function (r) {
      if (pick || r.key === "resume") { return; }
      if (r.items.length) { pick = r.items[0]; }
    });
    setHero(pick || data.rows[0].items[0]);

    Cards.hydrate(elRows);
    built = true;
  }

  /* ---------------------------------------------------------------- Bildschirm */

  var Home = {
    id: "home",
    el: "#screen-home",

    init: function () {
      elScreen = U.$("#screen-home");
      elRows = U.$("#rows");

      U.$("#hero-play").addEventListener("click", function () {
        if (featured) { global.App.play(featured); }
      });
      U.$("#hero-info").addEventListener("click", function () {
        if (featured) { global.App.go("#/detail/" + encodeURIComponent(featured.id)); }
      });
    },

    /** Bestand neu holen und zeichnen. */
    reload: function () {
      return Library.load().then(function (data) {
        render(data);
        if (Library.problems.length) {
          global.App.toast(Library.problems.map(function (p) {
            return p.source + ": " + p.message;
          }).join("   ·   "), 6000);
        }
        return data;
      });
    },

    /** Nur die Reihen neu setzen - nach dem Abspielen fuer "Weiterschauen". */
    refreshRows: function () {
      if (!built) { return; }
      var keep = Nav.current ? Nav.current.getAttribute("data-id") : null;
      render({ rows: Library.rows() });
      if (!keep) { return; }

      // Bewusst kein querySelector mit eingesetzter Kennung: ein Backslash
      // oder Steuerzeichen aus einer Server-Kennung wuerfe dort SyntaxError
      // und risse das Auffrischen mit.
      var again = null;
      U.$$("[data-id]", elRows).forEach(function (n) {
        if (!again && n.getAttribute("data-id") === keep) { again = n; }
      });
      if (again) { Nav.focus(again, "restore"); }
    },

    enter: function () {
      elScreen.hidden = false;
      var p = built ? Promise.resolve() : Home.reload();
      return p.then(function () {
        if (!Nav.current || !elScreen.contains(Nav.current)) {
          if (!Nav.focus(U.$("#hero-play"))) { Nav.focusFirst(elScreen); }
        }
      });
    },

    leave: function () { elScreen.hidden = true; }
  };

  return (global.ScreenHome = Home);
}(window));
