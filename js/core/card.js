/* Kachel-Fabrik. Eine Bauart fuer Startseite und Suche.

   Bilder werden verzoegert geholt: eine grosse Bibliothek darf beim Aufbau
   nicht hunderte Anfragen ausloesen. Wo IntersectionObserver fehlt
   (sehr alte webOS-Staende), werden die ersten Kacheln direkt geladen. */
(function (global) {
  "use strict";

  var U = global.U;
  var EAGER = 24;                 // Notloesung ohne Observer
  var observer = null;

  function ensureObserver() {
    if (observer || typeof global.IntersectionObserver !== "function") { return observer; }
    observer = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        load(e.target);
        observer.unobserve(e.target);
      });
    }, { root: null, rootMargin: "300px 600px", threshold: 0.01 });
    return observer;
  }

  function load(img) {
    var src = img.getAttribute("data-src");
    if (!src || img.getAttribute("data-loading") === "1") { return; }
    img.setAttribute("data-loading", "1");
    img.onload = function () { img.classList.add("is-on"); };
    img.onerror = function () {
      // Bild fehlt oder ist gesperrt: die Farbflaeche darunter bleibt stehen.
      img.removeAttribute("src");
    };
    img.src = src;
  }

  var Cards = {
    /** @param item Bibliothekseintrag
        @param opts {onSelect, badge, eager} */
    make: function (item, opts) {
      opts = opts || {};

      var btn = U.el("button", "card");
      btn.setAttribute("data-focusable", "");
      btn.setAttribute("data-id", item.id);
      btn.setAttribute("title", item.title);

      var art = U.el("span", "card__art");

      var fb = U.el("span", "card__fallback");
      fb.style.background = U.tintFor(item.title);
      fb.appendChild(U.el("span", null, item.title));
      art.appendChild(fb);

      if (item.poster) {
        var img = U.el("img", "card__img");
        img.alt = "";
        img.setAttribute("data-src", item.poster);
        art.appendChild(img);
      }

      if (opts.badge !== false && item.sourceLabel) {
        art.appendChild(U.el("span", "card__badge", item.sourceLabel));
      }

      if (item.progress > 0) {
        var bar = U.el("span", "card__prog");
        var fill = U.el("i");
        fill.style.width = Math.round(item.progress * 100) + "%";
        bar.appendChild(fill);
        art.appendChild(bar);
      }

      btn.appendChild(art);

      var cap = U.el("span", "card__cap");
      cap.appendChild(U.el("span", "card__name", item.title));

      var facts = [];
      if (item.year) { facts.push(item.year); }
      if (item.runtime) { facts.push(U.runtime(item.runtime)); }
      if (facts.length) { cap.appendChild(U.el("span", "card__sub", facts.join(" · "))); }
      btn.appendChild(cap);

      if (opts.onSelect) {
        btn.addEventListener("click", function () { opts.onSelect(item); });
      }
      return btn;
    },

    /** Bilder eines frisch gebauten Bereichs zum Nachladen anmelden. */
    hydrate: function (root) {
      var imgs = U.$$("img[data-src]", root);
      var ob = ensureObserver();
      if (!ob) {
        imgs.slice(0, EAGER).forEach(load);
        return;
      }
      imgs.forEach(function (img) { ob.observe(img); });
    },

    /** Beim Verlassen eines Bereichs abmelden, damit der Beobachter
        nicht auf entfernten Knoten sitzen bleibt. */
    release: function (root) {
      if (!observer) { return; }
      U.$$("img[data-src]", root).forEach(function (img) {
        try { observer.unobserve(img); } catch (e) { /* egal */ }
      });
    },

    loadNow: load
  };

  return (global.Cards = Cards);
}(window));
