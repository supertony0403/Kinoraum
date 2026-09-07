/* Detailblatt: alles zu einem Titel plus die Schaltflaechen zum Abspielen.
   Bei Jellyfin-Serien werden die Folgen hier nachgeladen. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Cards = global.Cards,
      Library = global.Library, Store = global.Store;

  var elScreen, elBody;

  function factLine(item) {
    var f = [];
    if (item.year) { f.push(item.year); }
    if (item.runtime) { f.push(U.runtime(item.runtime)); }
    if ((item.genres || []).length) { f.push(item.genres.join(", ")); }
    if (item.sourceLabel) { f.push(item.sourceLabel); }
    return f.join("  ·  ");
  }

  function metaBlock(item) {
    var wrap = U.el("div", "meta");
    function add(label, value) {
      if (!value) { return; }
      var col = U.el("div");
      col.appendChild(U.el("b", null, label));
      col.appendChild(document.createTextNode(value));
      wrap.appendChild(col);
    }
    add("Quelle", item.sourceLabel);
    // Bei CC-Lizenzen ist die Namensnennung Pflicht, deshalb steht sie fest hier.
    add("Lizenz", item.license);
    add("Urheber", item.credit);
    return wrap;
  }

  function render(item) {
    U.clear(elBody);

    var art = U.el("div", "detail__art");
    if (item.backdrop) {
      var img = U.el("img");
      img.alt = "";
      img.onerror = function () { img.style.display = "none"; };
      img.src = item.backdrop;
      art.appendChild(img);
    } else {
      art.style.background = U.tintFor(item.title);
    }
    elBody.appendChild(art);

    var body = U.el("div", "detail__body");
    body.appendChild(U.el("h1", "detail__title", item.title));
    body.appendChild(U.el("p", "detail__facts", factLine(item)));

    if (item.overview) {
      body.appendChild(U.el("p", "detail__text", item.overview));
    }

    var acts = U.el("div", "detail__acts");
    acts.setAttribute("data-nav-section", "detail");

    var prog = Store.progressFor(item.id);
    var serverPos = item.serverPos || 0;
    var resumeAt = prog ? prog.pos : serverPos;

    if (resumeAt > 20) {
      var btnResume = U.el("button", "btn btn--primary", "Weiter ab " + U.hms(resumeAt));
      btnResume.setAttribute("data-focusable", "");
      btnResume.addEventListener("click", function () { global.App.play(item, resumeAt); });
      acts.appendChild(btnResume);

      var btnRestart = U.el("button", "btn", "Von vorn");
      btnRestart.setAttribute("data-focusable", "");
      btnRestart.addEventListener("click", function () { global.App.play(item, 0); });
      acts.appendChild(btnRestart);

      var btnForget = U.el("button", "btn btn--ghost", "Merkpunkt loeschen");
      btnForget.setAttribute("data-focusable", "");
      btnForget.addEventListener("click", function () {
        Store.clearProgress(item.id);
        global.App.toast("Merkpunkt geloescht");
        render(item);
        Nav.focusFirst(elBody);
      });
      acts.appendChild(btnForget);
    } else {
      var btnPlay = U.el("button", "btn btn--primary", "Abspielen");
      btnPlay.setAttribute("data-focusable", "");
      btnPlay.addEventListener("click", function () { global.App.play(item, 0); });
      acts.appendChild(btnPlay);
    }

    var btnBack = U.el("button", "btn btn--ghost", "Zurueck");
    btnBack.setAttribute("data-focusable", "");
    btnBack.addEventListener("click", function () { global.App.back(); });
    acts.appendChild(btnBack);

    body.appendChild(acts);
    body.appendChild(metaBlock(item));
    elBody.appendChild(body);

    // Serien: Folgen anhaengen, sobald sie da sind.
    if (item.source === "jellyfin" && item.kind === "Series") {
      var slot = U.el("div", "row");
      slot.setAttribute("data-nav-section", "row");
      slot.setAttribute("data-row-key", "episodes");
      var head = U.el("div", "row__head");
      head.appendChild(U.el("h2", "row__title", "Folgen"));
      var note = U.el("span", "row__note", "werden geladen");
      head.appendChild(note);
      slot.appendChild(head);
      var vp = U.el("div", "row__vp");
      var track = U.el("div", "row__track");
      vp.appendChild(track);
      slot.appendChild(vp);
      body.appendChild(slot);

      global.SourceJellyfin.episodes(item.jfId).then(function (eps) {
        note.textContent = eps.length + " Folgen";
        eps.forEach(function (ep) {
          track.appendChild(Cards.make(ep, {
            onSelect: function (x) { global.App.play(x, 0); }
          }));
        });
        Cards.hydrate(track);
      }).catch(function (err) {
        note.textContent = "konnten nicht geladen werden: " + err.message;
      });
    }
  }

  var Detail = {
    id: "detail",
    el: "#screen-detail",

    init: function () {
      elScreen = U.$("#screen-detail");
      elBody = U.$("#detail-body");
    },

    enter: function (params) {
      var item = Library.get(params.id);
      elScreen.hidden = false;
      elScreen.scrollTop = 0;

      if (!item) {
        U.clear(elBody);
        var e = U.el("div", "empty");
        e.appendChild(U.el("b", null, "Titel nicht gefunden"));
        e.appendChild(document.createTextNode("Der Eintrag steht nicht mehr im Bestand."));
        var b = U.el("button", "btn", "Zurueck");
        b.setAttribute("data-focusable", "");
        b.style.marginTop = "32px";
        b.addEventListener("click", function () { global.App.back(); });
        e.appendChild(document.createElement("br"));
        e.appendChild(b);
        elBody.appendChild(e);
        Nav.focusFirst(elBody);
        return Promise.resolve();
      }

      render(item);
      Nav.focusFirst(elBody);
      return Promise.resolve();
    },

    leave: function () {
      Cards.release(elBody);
      elScreen.hidden = true;
    }
  };

  return (global.ScreenDetail = Detail);
}(window));
