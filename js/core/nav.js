/* Fokus-Steuerung fuer die Fernbedienung.
   Statt fester Zeilen/Spalten-Tabellen wird raeumlich gerechnet: aus der Lage
   der Elemente auf dem Schirm ergibt sich der naechste Fokus. Das haelt auch
   dann, wenn Reihen unterschiedlich lang sind oder Karten nachgeladen werden.

   Anmeldung: jedes Element traegt data-focusable.
   Ein Container mit data-nav-section darf den Wechsel abfangen (siehe trap).

   Das Nachfuehren steht bewusst hier und nicht in einem Bildschirm: es galt
   frueher nur auf der Startseite, weshalb der Fokus auf Suche, Einstellungen
   und Detailblatt unsichtbar aus dem Bild lief. Jetzt fuehrt jeder scrollbare
   Vorfahre mit, egal auf welchem Schirm. */
(function (global) {
  "use strict";

  var U = global.U;

  var current = null;
  var scopeEl = null;        // begrenzt die Suche, solange eine Schicht offen ist
  var traps = {};            // Abschnittsname -> Funktion(dir, el) : true = erledigt
  var listeners = [];

  /* ---------------------------------------------------------------- Zustand */

  function visible(el) {
    if (!el || el.hasAttribute("data-nav-skip")) { return false; }
    // offsetParent faellt bei display:none weg - deckt auch [hidden]-Vorfahren ab.
    if (!el.offsetParent && el !== document.body) { return false; }
    if (scopeEl && !scopeEl.contains(el)) { return false; }
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function pool() {
    return U.$$("[data-focusable]", scopeEl || document).filter(visible);
  }

  function centerOf(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* ---------------------------------------------------------------- Auswahl

     Bewertet jeden Kandidaten in Blickrichtung. Klein ist besser.
     - Abstand entlang der Bewegungsachse zaehlt einfach.
     - Versatz quer dazu zaehlt dreifach, damit die Spalte gehalten wird.
     - Ueberlappen sich die Kanten quer zur Richtung, gibt es einen Bonus;
       so springt der Fokus in einer Reihe nicht diagonal weg. */

  function score(from, to, dir) {
    var a = from.getBoundingClientRect();
    var b = to.getBoundingClientRect();
    var ca = centerOf(a), cb = centerOf(b);

    var along, across, overlap;

    if (dir === "left" || dir === "right") {
      along = dir === "right" ? b.left - a.right : a.left - b.right;
      // Ein Stueck Toleranz, damit gleich hohe Nachbarkarten nicht ausfallen.
      if (along < -a.width * 0.5) { return Infinity; }
      if (dir === "right" && cb.x <= ca.x) { return Infinity; }
      if (dir === "left" && cb.x >= ca.x) { return Infinity; }
      across = Math.abs(cb.y - ca.y);
      overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    } else {
      along = dir === "down" ? b.top - a.bottom : a.top - b.bottom;
      if (along < -a.height * 0.5) { return Infinity; }
      if (dir === "down" && cb.y <= ca.y) { return Infinity; }
      if (dir === "up" && cb.y >= ca.y) { return Infinity; }
      across = Math.abs(cb.x - ca.x);
      overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    }

    return Math.max(along, 0) + across * 3 - (overlap > 0 ? 900 : 0);
  }

  function best(dir) {
    if (!current) { return pool()[0] || null; }
    var cands = pool();
    var win = null, ws = Infinity, i, s;
    for (i = 0; i < cands.length; i++) {
      if (cands[i] === current) { continue; }
      s = score(current, cands[i], dir);
      if (s < ws) { ws = s; win = cands[i]; }
    }
    return ws === Infinity ? null : win;
  }

  /* ---------------------------------------------------------------- Nachfuehren */

  function safePx() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--safe");
    return parseInt(v, 10) || 72;
  }

  /** Naechster Vorfahre, der ueberhaupt senkrecht scrollen kann. */
  function scroller(el) {
    var n = el.parentNode;
    while (n && n.nodeType === 1 && n !== document.body) {
      if (n.scrollHeight - n.clientHeight > 4) {
        var oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") { return n; }
      }
      n = n.parentNode;
    }
    return null;
  }

  /* Sanftes Nachfuehren von Hand: scroll-behavior:smooth gibt es erst ab
     Chromium 61, das Ziel ist aber Chromium 53. */
  var tweenId = null;
  function scrollTo(node, top) {
    if (tweenId) { cancelAnimationFrame(tweenId); tweenId = null; }
    var from = node.scrollTop;
    var max = node.scrollHeight - node.clientHeight;
    top = Math.max(0, Math.min(top, max));
    var delta = top - from;
    if (Math.abs(delta) < 2) { node.scrollTop = top; return; }
    var t0 = 0;

    function step(ts) {
      if (!t0) { t0 = ts; }
      var p = Math.min(1, (ts - t0) / 260);
      node.scrollTop = from + delta * (1 - Math.pow(1 - p, 3));
      if (p < 1) { tweenId = requestAnimationFrame(step); } else { tweenId = null; }
    }
    tweenId = requestAnimationFrame(step);
  }

  /** Waagerechte Reihe so verschieben, dass die Kachel frei steht.
      Der Stand haengt am Element selbst - so braucht es keine Buchfuehrung
      ausserhalb, und die Reihe darf jederzeit neu gebaut werden. */
  function revealInRow(card) {
    var track = card.parentNode;
    if (!track || !track.className || track.className.indexOf("row__track") === -1) { return; }
    var vp = track.parentNode;
    if (!vp) { return; }

    var safe = safePx();
    var lead = 40;
    var cur = parseFloat(track.getAttribute("data-shift") || "0") || 0;
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
    track.setAttribute("data-shift", target);
    track.style.transform = "translateX(" + (-target) + "px)";
  }

  /** Senkrecht nachfuehren, damit der Fokus nie unter der Bildkante steht. */
  function followVertically(el) {
    var box = scroller(el);
    if (!box) { return; }
    var r = el.getBoundingClientRect();
    var br = box.getBoundingClientRect();
    var head = 150;      // Kopfzeile freihalten
    var foot = 90;

    var oben = Math.max(br.top, 0) + head;
    var unten = Math.min(br.bottom, global.innerHeight) - foot;

    if (r.top < oben) {
      scrollTo(box, box.scrollTop + (r.top - oben) - 26);
    } else if (r.bottom > unten) {
      scrollTo(box, box.scrollTop + (r.bottom - unten) + 26);
    }
  }

  /* ---------------------------------------------------------------- Fokus */

  function set(el, why) {
    // Unsichtbare Ziele werden abgewiesen: sonst haelt der Fokus an einem
    // ausgeblendeten Element und die Fernbedienung wirkt tot.
    if (!el || el === current || !visible(el)) { return current; }
    if (current) { current.classList.remove("is-focused"); }
    current = el;
    el.classList.add("is-focused");

    // Textfelder brauchen echten DOM-Fokus, damit die Bildschirmtastatur
    // des Fernsehers ueberhaupt aufgeht.
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      try { el.focus(); } catch (e) { /* egal */ }
    } else if (document.activeElement && document.activeElement.blur) {
      try { document.activeElement.blur(); } catch (e) { /* egal */ }
    }

    if (why !== "pointer") {
      if (el.className && el.className.indexOf("card") !== -1) { revealInRow(el); }
      followVertically(el);
    }

    listeners.forEach(function (fn) { fn(el, why || "set"); });
    return el;
  }

  function sectionOf(el) {
    var n = el;
    while (n && n !== document.body) {
      if (n.hasAttribute && n.hasAttribute("data-nav-section")) {
        return n.getAttribute("data-nav-section");
      }
      n = n.parentNode;
    }
    return null;
  }

  var Nav = {
    get current() { return current; },

    /** Fokus setzen; ungueltige oder unsichtbare Ziele werden verworfen. */
    focus: function (el, why) { return set(el, why); },

    /** Ersten sinnvollen Fokus in einem Wurzelelement setzen. */
    focusFirst: function (root) {
      var list = U.$$("[data-focusable]", root || scopeEl || document).filter(visible);
      if (list.length) { set(list[0], "first"); }
      return list[0] || null;
    },

    /** Fokus loesen, ohne ein neues Ziel zu waehlen. */
    blur: function () {
      if (current) { current.classList.remove("is-focused"); }
      current = null;
    },

    /** Nach Umbau der Seite: haengt der Fokus im Nichts, neu greifen. */
    revalidate: function (root) {
      if (current && visible(current) && document.body.contains(current)) { return current; }
      if (current) { current.classList.remove("is-focused"); }
      current = null;
      return Nav.focusFirst(root);
    },

    /* Begrenzt die Suche auf einen Ausschnitt, solange eine Schicht darueber
       liegt (Player, Auswahlblatt). Ohne das faellt der Fokus in die
       verdeckte Startseite, wo der Nutzer ihn nicht sieht. */
    setScope: function (el) {
      scopeEl = el || null;
      if (current && !visible(current)) { Nav.revalidate(scopeEl); }
    },
    scope: function () { return scopeEl; },

    /** Abschnitt darf Richtungen selbst behandeln (z. B. Regler, Reihenende). */
    trap: function (section, fn) { traps[section] = fn; },
    untrap: function (section) { delete traps[section]; },

    onFocus: function (fn) { listeners.push(fn); },

    /** Eine Richtungstaste auswerten. Gibt true zurueck, wenn etwas passiert ist. */
    move: function (dir) {
      // Haengt der Fokus an einem entfernten Knoten, liefert getBoundingClientRect
      // lauter Nullen und die Suche findet nichts mehr - erst einfangen.
      if (current && (!document.body.contains(current) || !visible(current))) {
        Nav.revalidate(scopeEl);
        if (current) { return true; }
      }

      var sec = current ? sectionOf(current) : null;
      if (sec && traps[sec] && traps[sec](dir, current) === true) { return true; }
      var next = best(dir);
      if (!next) { return false; }
      set(next, dir);
      return true;
    },

    /** OK auf dem aktuellen Element ausloesen. */
    activate: function () {
      if (!current) { return false; }
      if (current.tagName === "INPUT") {
        try { current.focus(); } catch (e) { /* egal */ }
        return true;
      }
      current.click();
      return true;
    },

    isVisible: visible,
    sectionOf: sectionOf,
    revealInRow: revealInRow,
    followVertically: followVertically
  };

  /* Maus und Magic Remote: der Zeiger darf den Fokus mitnehmen. */
  document.addEventListener("mouseover", function (ev) {
    var n = ev.target;
    while (n && n !== document.body) {
      if (n.hasAttribute && n.hasAttribute("data-focusable")) {
        if (visible(n)) { set(n, "pointer"); }
        return;
      }
      n = n.parentNode;
    }
  }, true);

  return (global.Nav = Nav);
}(window));
