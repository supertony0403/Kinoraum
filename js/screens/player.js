/* Wiedergabe.

   Abspielweg:
   - MP4 geht direkt an das <video>-Element.
   - HLS laeuft ueber hls.js, sofern MediaSource vorhanden ist. Faellt das
     weg, bekommt das Element die m3u8 direkt - LG spielt HLS auch nativ,
     nur ohne Spur- und Qualitaetswahl.
   - Scheitert eine Adresse, wird die naechste aus item.streams versucht,
     bevor ein Fehler gemeldet wird. Bei Jellyfin ist das der Wechsel von
     der umgewandelten auf die direkte Fassung.

   Springen: schnelle Tastendruecke werden aufaddiert und erst nach kurzer
   Ruhe ausgefuehrt. Sonst setzt der Fernseher bei jedem Druck neu an und
   das Bild ruckelt sich durch den Film. */
(function (global) {
  "use strict";

  var U = global.U, Nav = global.Nav, Keys = global.Keys,
      Store = global.Store, Library = global.Library;

  var UI_HIDE_MS = 4200;
  var SAVE_EVERY_MS = 10000;
  var SEEK_STEP = 10;
  var SEEK_APPLY_MS = 420;

  var elRoot, video, elTitle, elSub, elBar, elFill, elBuf, elKnob,
      elCur, elDur, elToggle, elSpinner, elHint, elPanel;

  var item = null;
  var streams = [];
  var streamIx = 0;
  var hls = null;
  var startAt = 0;

  var uiTimer = null;
  var saveTimer = null;
  var seekPending = 0;
  var seekTimer = null;
  var hintTimer = null;
  var closing = false;

  /* Jeder Start bekommt eine Nummer. Wird der Player geschlossen, waehrend
     noch eine Anfrage laeuft, kommt deren Antwort spaeter zurueck und faende
     item === null vor. Vorher gab das eine JavaScript-Fehlermeldung als
     Klartext-Toast auf der Startseite und ein zweites close(). */
  var gen = 0;

  /* ---------------------------------------------------------------- Oberflaeche */

  function showUI() {
    elRoot.classList.add("is-ui");
    if (uiTimer) { clearTimeout(uiTimer); }
    uiTimer = setTimeout(function () {
      // Waehrend Pause oder offenem Blatt bleibt die Leiste stehen.
      if (video.paused || !elPanel.hidden) { showUI(); return; }
      elRoot.classList.remove("is-ui");
      Nav.blur();
    }, UI_HIDE_MS);
  }

  function uiVisible() { return elRoot.classList.contains("is-ui"); }

  function ensureFocus() {
    if (!Nav.current || !elRoot.contains(Nav.current)) {
      Nav.focus(elBar);
    }
  }

  function spinner(on) { elSpinner.hidden = !on; }

  function hint(text) {
    elHint.hidden = false;
    elHint.textContent = text;
    if (hintTimer) { clearTimeout(hintTimer); }
    hintTimer = setTimeout(function () { elHint.hidden = true; }, 900);
  }

  /* ---------------------------------------------------------------- Anzeige */

  function paint() {
    var d = video.duration;
    var t = video.currentTime;
    if (!isFinite(d) || d <= 0) {
      elCur.textContent = U.hms(t);
      elDur.textContent = "--:--";
      return;
    }
    var p = Math.max(0, Math.min(1, t / d));
    elFill.style.width = (p * 100) + "%";
    elKnob.style.left = (p * 100) + "%";
    elCur.textContent = U.hms(t);
    elDur.textContent = U.hms(d);

    try {
      if (video.buffered.length) {
        var end = video.buffered.end(video.buffered.length - 1);
        elBuf.style.width = Math.min(100, (end / d) * 100) + "%";
      }
    } catch (e) { /* buffered kann waehrend Umschalten werfen */ }
  }

  function paintToggle() {
    // Zeichen: Pause-Balken, wenn laeuft; Dreieck, wenn steht.
    elToggle.innerHTML = video.paused ? "&#9654;" : "&#10073;&#10073;";
  }

  /* ---------------------------------------------------------------- Merken */

  function save() {
    if (!item || !Store.pref("resume")) { return; }
    if (!isFinite(video.duration) || video.duration <= 0) { return; }
    Store.setProgress(item.id, video.currentTime, video.duration);
    Library.reportProgress(item, video.currentTime, video.paused);
  }

  /* ---------------------------------------------------------------- Laden */

  function teardown() {
    if (hls) {
      try { hls.destroy(); } catch (e) { /* egal */ }
      hls = null;
    }
    // Quelle wirklich loesen, sonst laedt der Fernseher im Hintergrund weiter.
    try {
      video.removeAttribute("src");
      while (video.firstChild) { video.removeChild(video.firstChild); }
      video.load();
    } catch (e) { /* egal */ }
  }

  function attachSubtitles() {
    (item.subtitles || []).forEach(function (s, i) {
      var tr = document.createElement("track");
      tr.kind = "subtitles";
      tr.label = s.label || ("Untertitel " + (i + 1));
      if (s.lang) { tr.srclang = s.lang; }
      tr.src = s.url;
      video.appendChild(tr);
    });
    // Standardmaessig aus - der Nutzer waehlt ueber "Spuren".
    setTimeout(function () {
      var t = video.textTracks, i;
      for (i = 0; i < t.length; i++) { t[i].mode = "disabled"; }
    }, 0);
  }

  function useNextStream(why) {
    if (!item) { return false; }        // Player laengst zu
    if (streamIx + 1 >= streams.length) {
      spinner(false);
      global.App.toast("Wiedergabe nicht moeglich: " + why, 6000);
      close();
      return false;
    }
    streamIx++;
    global.App.toast("Wechsle auf: " + streams[streamIx].label, 2600);
    play(streams[streamIx]);
    return true;
  }

  function play(stream) {
    if (!item) { return; }
    teardown();
    spinner(true);
    attachSubtitles();

    var isHls = stream.type === "hls" ||
                String(stream.url).split("?")[0].toLowerCase().indexOf(".m3u8") !== -1;

    if (isHls && global.Hls && global.Hls.isSupported()) {
      hls = new global.Hls({
        // Auf dem Fernseher lieber kleinere Puffer: Speicher ist knapp.
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        capLevelToPlayerSize: true,
        startPosition: startAt > 0 ? startAt : -1
      });

      hls.on(global.Hls.Events.ERROR, function (evt, data) {
        if (!data || !data.fatal) { return; }
        if (data.type === global.Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); return; } catch (e) { /* weiter unten */ }
        }
        if (data.type === global.Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch (e) { /* weiter unten */ }
        }
        useNextStream(data.details || "HLS-Fehler");
      });

      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(global.Hls.Events.MANIFEST_PARSED, function () { start(); });
    } else {
      video.src = stream.url;
      video.load();
      start();
    }
  }

  function start() {
    var go = video.play();
    if (go && go.catch) {
      go.catch(function () {
        /* Nur melden, wenn die Wiedergabe wirklich an einer fehlenden Geste
           haengt. Nach einem toten Strom ist die Absage die Folge des
           Ladefehlers - "Mit OK starten" waere dort eine falsche Faehrte. */
        if (!item || video.error) { return; }
        spinner(false);
        showUI();
        global.App.toast("Mit OK starten", 3000);
      });
    }
  }

  /* ---------------------------------------------------------------- Springen */

  function applySeek() {
    seekTimer = null;
    if (!seekPending) { return; }
    var d = video.duration;
    if (!isFinite(d) || d <= 0) { seekPending = 0; return; }
    var t = Math.max(0, Math.min(d - 1, video.currentTime + seekPending));
    seekPending = 0;
    try { video.currentTime = t; } catch (e) { /* egal */ }
  }

  function seekBy(sec) {
    var d = video.duration;
    if (!isFinite(d) || d <= 0) { return; }
    seekPending += sec;
    var preview = Math.max(0, Math.min(d, video.currentTime + seekPending));
    hint((seekPending > 0 ? "+" : "") + Math.round(seekPending) + " s  ·  " + U.hms(preview));
    if (seekTimer) { clearTimeout(seekTimer); }
    seekTimer = setTimeout(applySeek, SEEK_APPLY_MS);
    showUI();
  }

  function toggle() {
    if (video.paused) { start(); } else { video.pause(); }
    showUI();
  }

  /* ---------------------------------------------------------------- Blatt */

  function closePanel() {
    elPanel.hidden = true;
    U.clear(elPanel);
    Nav.setScope(elRoot);
    Nav.focus(elBar);
    showUI();
  }

  function openPanel(build) {
    U.clear(elPanel);
    elPanel.hidden = false;
    build(elPanel);
    // Solange das Blatt offen ist, bleibt der Fokus darin - sonst rutscht er
    // seitlich in die Steuerleiste dahinter, die der Nutzer gar nicht sieht.
    Nav.setScope(elPanel);
    var first = U.$("[data-focusable]", elPanel);
    if (first) { Nav.focus(first); }
    showUI();
  }

  function optionRow(label, on, onPick) {
    var b = U.el("button", "opt" + (on ? " opt--on" : ""), label);
    b.setAttribute("data-focusable", "");
    b.addEventListener("click", onPick);
    return b;
  }

  function panelTracks() {
    openPanel(function (root) {
      root.appendChild(U.el("h4", "panel__title", "Untertitel"));

      var tracks = video.textTracks;
      var anyOn = false, i;
      for (i = 0; i < tracks.length; i++) {
        if (tracks[i].mode === "showing") { anyOn = true; }
      }

      root.appendChild(optionRow("Aus", !anyOn, function () {
        var j;
        for (j = 0; j < video.textTracks.length; j++) { video.textTracks[j].mode = "disabled"; }
        panelTracks();
      }));

      for (i = 0; i < tracks.length; i++) {
        (function (ix) {
          root.appendChild(optionRow(
            tracks[ix].label || tracks[ix].language || ("Spur " + (ix + 1)),
            tracks[ix].mode === "showing",
            function () {
              var j;
              for (j = 0; j < video.textTracks.length; j++) {
                video.textTracks[j].mode = (j === ix) ? "showing" : "disabled";
              }
              panelTracks();
            }
          ));
        }(i));
      }

      if (!tracks.length) {
        root.appendChild(U.el("p", "field__note", "Dieser Titel bringt keine Untertitel mit."));
      }

      // Tonspuren nur, wenn hls.js sie kennt.
      if (hls && hls.audioTracks && hls.audioTracks.length > 1) {
        root.appendChild(U.el("h4", "panel__title", "Tonspur"));
        hls.audioTracks.forEach(function (a, ix) {
          root.appendChild(optionRow(a.name || a.lang || ("Ton " + (ix + 1)),
            hls.audioTrack === ix,
            function () { hls.audioTrack = ix; panelTracks(); }));
        });
      }

      if (streams.length > 1) {
        root.appendChild(U.el("h4", "panel__title", "Abspielweg"));
        streams.forEach(function (s, ix) {
          root.appendChild(optionRow(s.label, ix === streamIx, function () {
            if (ix === streamIx) { closePanel(); return; }
            streamIx = ix;
            startAt = video.currentTime;
            closePanel();
            play(streams[ix]);
          }));
        });
      }
    });
  }

  function panelQuality() {
    if (!hls || !hls.levels || hls.levels.length < 2) {
      global.App.toast("Fuer diesen Titel gibt es nur eine Qualitaetsstufe.", 2600);
      return;
    }
    openPanel(function (root) {
      root.appendChild(U.el("h4", "panel__title", "Qualitaet"));
      root.appendChild(optionRow("Automatisch", hls.autoLevelEnabled, function () {
        hls.currentLevel = -1;
        U.$("#p-quality").textContent = "Auto";
        closePanel();
      }));
      hls.levels.forEach(function (l, ix) {
        var label = (l.height ? l.height + "p" : "Stufe " + (ix + 1)) +
                    (l.bitrate ? "  ·  " + Math.round(l.bitrate / 1000) + " kbit/s" : "");
        root.appendChild(optionRow(label, !hls.autoLevelEnabled && hls.currentLevel === ix, function () {
          hls.currentLevel = ix;
          U.$("#p-quality").textContent = l.height ? l.height + "p" : "Stufe " + (ix + 1);
          closePanel();
        }));
      });
    });
  }

  /* ---------------------------------------------------------------- Oeffnen */

  function close() {
    if (closing) { return; }
    closing = true;
    gen++;                       // laufende Antworten laufen damit ins Leere
    save();
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    if (seekTimer) { clearTimeout(seekTimer); seekTimer = null; }
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    elHint.hidden = true;
    teardown();
    elPanel.hidden = true;
    U.clear(elPanel);
    elRoot.hidden = true;
    elRoot.classList.remove("is-ui");
    U.$("#chrome").classList.remove("chrome--off");
    item = null;
    closing = false;
    Nav.setScope(null);
    global.App.afterPlayback();
  }

  var Player = {
    id: "player",

    get open() { return item !== null; },

    init: function () {
      elRoot = U.$("#screen-player");
      video = U.$("#video");
      elTitle = U.$("#player-title");
      elSub = U.$("#player-sub");
      elBar = U.$("#bar");
      elFill = U.$("#bar-fill");
      elBuf = U.$("#bar-buf");
      elKnob = U.$("#bar-knob");
      elCur = U.$("#t-cur");
      elDur = U.$("#t-dur");
      elToggle = U.$("#p-toggle");
      elSpinner = U.$("#player-spinner");
      elHint = U.$("#seekhint");
      elPanel = U.$("#panel");

      elBar.setAttribute("data-focusable", "");

      U.$("#p-back10").addEventListener("click", function () { seekBy(-SEEK_STEP); });
      U.$("#p-fwd10").addEventListener("click", function () { seekBy(SEEK_STEP); });
      elToggle.addEventListener("click", toggle);
      U.$("#p-track").addEventListener("click", panelTracks);
      U.$("#p-quality").addEventListener("click", panelQuality);
      U.$("#p-stop").addEventListener("click", close);

      video.addEventListener("timeupdate", paint);
      video.addEventListener("progress", paint);
      video.addEventListener("durationchange", paint);
      video.addEventListener("play", function () { paintToggle(); spinner(false); });
      video.addEventListener("pause", function () { paintToggle(); save(); });
      video.addEventListener("waiting", function () { spinner(true); });
      video.addEventListener("playing", function () { spinner(false); paintToggle(); });
      video.addEventListener("seeked", function () { paint(); });

      video.addEventListener("loadedmetadata", function () {
        if (startAt > 0 && isFinite(video.duration) && startAt < video.duration - 5) {
          try { video.currentTime = startAt; } catch (e) { /* egal */ }
        }
        startAt = 0;
        paint();
      });

      video.addEventListener("ended", function () {
        if (item) { Store.clearProgress(item.id); }
        close();
      });

      video.addEventListener("error", function () {
        if (!item) { return; }          // verspaeteter Fehler nach dem Schliessen
        var code = video.error ? video.error.code : 0;
        var why = code === 4 ? "Format wird nicht unterstuetzt"
                : code === 2 ? "Netzwerkfehler"
                : code === 3 ? "Dekodierfehler"
                : "Unbekannter Fehler";
        useNextStream(why);
      });

      /* Links/Rechts auf dem Regler springt, statt den Fokus zu bewegen. */
      Nav.trap("player", function (dir, el) {
        if (el !== elBar) { return false; }
        if (dir === "left") { seekBy(-SEEK_STEP); return true; }
        if (dir === "right") { seekBy(SEEK_STEP); return true; }
        /* Nach unten waere raeumlich die Qualitaetsstufe am naechsten, weil
           der Regler ueber die ganze Breite laeuft. Erwartet wird aber die
           Wiedergabetaste - also fest dorthin. */
        if (dir === "down") { Nav.focus(elToggle, dir); return true; }
        return false;
      });
    },

    start: function (target, at) {
      var my = ++gen;
      item = target;
      startAt = at || 0;
      streamIx = 0;
      closing = false;

      elRoot.hidden = false;
      // Der Schirm darunter bleibt sichtbar; ohne Begrenzung faellt der Fokus
      // von der Steuerleiste in eine Kachel, die niemand sehen kann.
      Nav.setScope(elRoot);
      U.$("#chrome").classList.add("chrome--off");
      elTitle.textContent = target.title;
      var bits = [];
      if (target.year) { bits.push(target.year); }
      if (target.sourceLabel) { bits.push(target.sourceLabel); }
      if (target.license) { bits.push(target.license + (target.credit ? " · " + target.credit : "")); }
      elSub.textContent = bits.join("  ·  ");

      elFill.style.width = "0%";
      elBuf.style.width = "0%";
      U.$("#p-quality").textContent = "Auto";
      spinner(true);
      showUI();
      Nav.focus(elBar);

      Library.resolve(target).then(function (full) {
        if (my !== gen) { return; }     // inzwischen geschlossen oder neu gestartet
        streams = (full && full.streams) || [];
        if (!streams.length) {
          spinner(false);
          global.App.toast("Zu diesem Titel gibt es keine Abspieladresse.", 5000);
          close();
          return;
        }
        play(streams[0]);
        if (saveTimer) { clearInterval(saveTimer); }
        saveTimer = setInterval(save, SAVE_EVERY_MS);
      }).catch(function (err) {
        if (my !== gen) { return; }
        spinner(false);
        global.App.toast("Quelle antwortet nicht: " + err.message, 6000);
        close();
      });
    },

    close: close,

    /** Tastenbehandlung, solange der Player offen ist. */
    onKey: function (code) {
      // Blatt offen: Zurueck schliesst nur das Blatt.
      if (!elPanel.hidden && Keys.isBack(code)) { closePanel(); return true; }

      if (Keys.isBack(code)) { close(); return true; }

      if (code === Keys.PLAY) { if (video.paused) { start(); } showUI(); return true; }
      if (code === Keys.PAUSE) { video.pause(); showUI(); return true; }
      if (code === Keys.PLAY_PAUSE) { toggle(); return true; }
      if (code === Keys.STOP) { close(); return true; }
      if (code === Keys.FF) { seekBy(30); return true; }
      if (code === Keys.RW) { seekBy(-30); return true; }

      // Erster Druck holt nur die Leiste zurueck, ohne etwas auszuloesen.
      if (!uiVisible()) {
        showUI();
        ensureFocus();
        return true;
      }

      var dir = Keys.dirOf(code);
      if (dir) { showUI(); ensureFocus(); return Nav.move(dir) || true; }

      if (Keys.isOk(code)) {
        showUI();
        if (Nav.current === elBar) { toggle(); return true; }
        ensureFocus();
        return Nav.activate() || true;
      }
      return false;
    }
  };

  return (global.ScreenPlayer = Player);
}(window));
