/* Startseite: Buehne oben, darunter waagerechte Reihen.

   Die Reihen werden per transform verschoben statt per scrollLeft. Auf
   schwachen Panels ist das der einzige Weg, der ruhig laeuft, weil die
   Verschiebung auf der GPU bleibt und kein Neuzeichnen ausloest. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Cards = global.Cards, Library = global.Library;

  var elScreen, elRows, elHero;
  var offsets = {};              // Reihenschluessel -> aktuelle Verschiebung
  var featured = null;
  var built = false;

  function safePx() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--safe");
    return parseInt(v, 10) || 72;
  }

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

    var head = U.el("div", "row__head");
    head.appendChild(U.el("h2", "row__title", row.title));
    head.appendChild(U.el("span", "row__note", row.items.length + " Titel"));
    sec.appendChild(head);

    var vp = U.el("div", "row__vp");
    var track = U.el("div", "row__track");

    row.items.forEach(function (it) {
      track.appendChild(Cards.make(it, {
        onSelect: function (x) { global.App.go("#/detail/" + encodeURIComponent(x.id)); }
      }));
    });

    vp.appendChild(track);
    sec.appendChild(vp);
    offsets[row.key] = 0;
    return sec;
  }

  /** Verschiebt die Spur nur so weit, dass die Kachel frei steht. */
  function reveal(card) {
    var track = card.parentNode;
    var vp = track.parentNode;
    var sec = vp.parentNode;
    var key = sec.getAttribute("data-row-key");
    if (!key) { return; }

    var safe = safePx();
    var lead = 40;
    var cur = offsets[key] || 0;
    var vpW = vp.clientWidth;
    var maxShift = Math.max(0, track.scrollWidth - vpW);

    var left = card.offsetLeft;
    var w = card.offsetWidth;
    var visL = left - cur;
    var visR = visL + w;
    var target = cur;

    if (visR > vpW - safe) {
      target = left + w - vpW + safe + lead;
    } else if (visL < safe) {
      target = left - safe - lead;
    }

    target = Math.max(0, Math.min(target, maxShift));
    if (target === cur) { return; }
    offsets[key] = target;
    track.style.transform = "translateX(" + (-target) + "px)";
  }

  /* Sanftes senkrechtes Nachfuehren. scroll-behavior:smooth gibt es erst ab
     Chromium 61, deshalb hier von Hand. */
  var tweenId = null;
  function scrollTo(node, top) {
    if (tweenId) { cancelAnimationFrame(tweenId); tweenId = null; }
    var from = node.scrollTop;
    var delta = top - from;
    if (Math.abs(delta) < 2) { node.scrollTop = top; return; }
    var t0 = 0;
    var dur = 260;

    function step(ts) {
      if (!t0) { t0 = ts; }
      var p = Math.min(1, (ts - t0) / dur);
      // weiches Ausklingen
      var e = 1 - Math.pow(1 - p, 3);
      node.scrollTop = from + delta * e;
      if (p < 1) { tweenId = requestAnimationFrame(step); } else { tweenId = null; }
    }
    tweenId = requestAnimationFrame(step);
  }

  function followVertically(el) {
    var r = el.getBoundingClientRect();
    var vh = global.innerHeight;
    var head = 150;              // Kopfzeile freihalten
    var foot = 90;
    var top = elScreen.scrollTop;

    if (r.top < head) {
      scrollTo(elScreen, top + r.top - head - 26);
    } else if (r.bottom > vh - foot) {
      scrollTo(elScreen, top + (r.bottom - (vh - foot)) + 26);
    }
  }

  /* ---------------------------------------------------------------- Aufbau */

  function render(data) {
    U.clear(elRows);
    offsets = {};

    if (!data.rows.length) {
      var empty = U.el("div", "empty");
      var strong = U.el("b", null, "Noch keine Quelle eingerichtet");
      empty.appendChild(strong);
      empty.appendChild(document.createTextNode(
        "Unter Einstellungen laesst sich ein Jellyfin-Server verbinden oder eine eigene " +
        "Stream-Liste hinterlegen. Die mitgelieferte Demo-Bibliothek kann dort ebenfalls " +
        "wieder eingeschaltet werden."
      ));
      elRows.appendChild(empty);
      U.$("#hero").style.display = "none";
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
      elHero = U.$("#hero");

      U.$("#hero-play").addEventListener("click", function () {
        if (featured) { global.App.play(featured); }
      });
      U.$("#hero-info").addEventListener("click", function () {
        if (featured) { global.App.go("#/detail/" + encodeURIComponent(featured.id)); }
      });

      Nav.onFocus(function (el, why) {
        if (why === "pointer" || !elScreen || elScreen.hidden) { return; }
        if (!elScreen.contains(el)) { return; }
        if (el.classList.contains("card")) { reveal(el); }
        followVertically(el);
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
      if (keep) {
        var again = U.$('[data-id="' + keep.replace(/"/g, '\\"') + '"]', elRows);
        if (again) { Nav.focus(again, "restore"); reveal(again); }
      }
    },

    enter: function () {
      elScreen.hidden = false;
      var p = built ? Promise.resolve() : Home.reload();
      return p.then(function () {
        if (!Nav.current || !elScreen.contains(Nav.current)) {
          Nav.focus(U.$("#hero-play")) || Nav.focusFirst(elScreen);
        }
      });
    },

    leave: function () { elScreen.hidden = true; }
  };

  return (global.ScreenHome = Home);
}(window));
