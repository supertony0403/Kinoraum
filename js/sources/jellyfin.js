/* Jellyfin-Anbindung - der eigene Medienserver.
   Zugang ueber einen API-Schluessel (Jellyfin: Systemsteuerung > API-Schluessel).

   Zwei Wege, die Anmeldung mitzugeben:
   - Datenabfragen tragen den Kopf X-Emby-Token.
   - Das <video>-Element kann keine Koepfe setzen, deshalb haengt an der
     Abspieladresse api_key= als Parameter. Jellyfin akzeptiert beides. */
(function (global) {
  "use strict";

  var U = global.U;
  var TICKS = 10000000;            // Jellyfin zaehlt in 100-Nanosekunden-Schritten
  var DEVICE_ID = "kinoraum-webos";

  function cfg() { return global.Store.source("jellyfin"); }
  function base() { return U.trimSlash(cfg().url); }

  function headers() {
    var key = cfg().apiKey;
    return {
      "X-Emby-Token": key,
      "X-Emby-Authorization":
        'MediaBrowser Client="Kinoraum", Device="LG webOS", DeviceId="' +
        DEVICE_ID + '", Version="1.0.0", Token="' + key + '"',
      "Accept": "application/json"
    };
  }

  function api(path, params, opts) {
    opts = opts || {};
    return U.http({
      url: U.withQuery(base() + path, params || {}),
      method: opts.method || "GET",
      headers: headers(),
      body: opts.body,
      timeout: opts.timeout || 20000,
      json: opts.json
    });
  }

  /* ------------------------------------------------------------- Bilder */

  function img(id, kind, tag, size) {
    if (!tag) { return null; }
    return U.withQuery(base() + "/Items/" + id + "/Images/" + kind, {
      tag: tag,
      quality: 90,
      maxHeight: size,
      api_key: cfg().apiKey
    });
  }

  function posterOf(it) {
    var tags = it.ImageTags || {};
    return img(it.Id, "Primary", tags.Primary, 600);
  }

  function backdropOf(it) {
    var bd = it.BackdropImageTags || [];
    if (bd.length) {
      return U.withQuery(base() + "/Items/" + it.Id + "/Images/Backdrop/0", {
        tag: bd[0], quality: 88, maxWidth: 1920, api_key: cfg().apiKey
      });
    }
    // Serienfolgen tragen das Hintergrundbild der Serie.
    if (it.ParentBackdropItemId && (it.ParentBackdropImageTags || []).length) {
      return U.withQuery(base() + "/Items/" + it.ParentBackdropItemId + "/Images/Backdrop/0", {
        tag: it.ParentBackdropImageTags[0], quality: 88, maxWidth: 1920, api_key: cfg().apiKey
      });
    }
    return posterOf(it);
  }

  /* ------------------------------------------------------------- Abbildung */

  function toItem(it) {
    var mins = it.RunTimeTicks ? Math.round(it.RunTimeTicks / TICKS / 60) : null;
    var title = it.Name;
    if (it.Type === "Episode" && it.SeriesName) {
      title = it.SeriesName + " - " + (it.ParentIndexNumber || 0) + "x" +
              U.pad2(it.IndexNumber || 0) + " " + it.Name;
    }
    return {
      id: "jellyfin:" + it.Id,
      jfId: it.Id,
      source: "jellyfin",
      sourceLabel: "Jellyfin",
      kind: it.Type,
      title: title,
      year: it.ProductionYear || null,
      runtime: mins,
      overview: it.Overview || "",
      genres: it.Genres || [],
      poster: posterOf(it),
      backdrop: backdropOf(it),
      license: "",
      credit: "",
      streams: [],                 // wird erst bei resolve() geholt
      subtitles: [],
      serverPos: it.UserData && it.UserData.PlaybackPositionTicks
        ? Math.floor(it.UserData.PlaybackPositionTicks / TICKS) : 0
    };
  }

  var FIELDS = "Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,ParentBackdropItemId,ParentBackdropImageTags";

  /* ------------------------------------------------------------- Quelle */

  var JF = {
    id: "jellyfin",
    label: "Jellyfin",

    enabled: function () {
      var c = cfg();
      return c.enabled === true && !!c.url && !!c.apiKey && !!c.userId;
    },

    /** Nutzerliste holen - dient dem Einrichten und dem Verbindungstest. */
    users: function (url, apiKey) {
      return U.http({
        url: U.trimSlash(url) + "/Users",
        headers: {
          "X-Emby-Token": apiKey,
          "X-Emby-Authorization":
            'MediaBrowser Client="Kinoraum", Device="LG webOS", DeviceId="' +
            DEVICE_ID + '", Version="1.0.0", Token="' + apiKey + '"',
          "Accept": "application/json"
        },
        timeout: 15000
      }).then(function (list) {
        if (!Array.isArray(list)) { throw new Error("Unerwartete Antwort"); }
        return list.map(function (u) { return { id: u.Id, name: u.Name }; });
      });
    },

    list: function () {
      var uid = cfg().userId;
      return api("/Users/" + uid + "/Items", {
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        Fields: FIELDS,
        SortBy: "SortName",
        SortOrder: "Ascending",
        // Deckel gegen sehr grosse Bibliotheken: der Fernseher soll die Liste
        // in einem Rutsch verarbeiten koennen.
        Limit: 600,
        EnableTotalRecordCount: false
      }).then(function (res) {
        var items = (res && res.Items) || [];
        return items.map(toItem);
      });
    },

    /** Angefangene Titel direkt vom Server - schlaegt den lokalen Merkpunkt. */
    resume: function () {
      var uid = cfg().userId;
      return api("/Users/" + uid + "/Items/Resume", {
        Limit: 20, Fields: FIELDS, MediaTypes: "Video", EnableTotalRecordCount: false
      }).then(function (res) {
        return ((res && res.Items) || []).map(toItem);
      }).catch(function () { return []; });
    },

    /** Zuletzt hinzugefuegt. */
    latest: function () {
      var uid = cfg().userId;
      return api("/Users/" + uid + "/Items/Latest", {
        Limit: 20, Fields: FIELDS, IncludeItemTypes: "Movie,Episode"
      }).then(function (list) {
        return (Array.isArray(list) ? list : []).map(toItem);
      }).catch(function () { return []; });
    },

    /** Fuer Serien: die abspielbaren Folgen nachladen. */
    episodes: function (seriesId) {
      var uid = cfg().userId;
      return api("/Shows/" + seriesId + "/Episodes", {
        userId: uid, Fields: FIELDS
      }).then(function (res) {
        return ((res && res.Items) || []).map(toItem);
      });
    },

    /** Abspieladressen bestimmen. HLS zuerst: der Server passt notfalls um. */
    resolve: function (item) {
      var key = cfg().apiKey;
      var id = item.jfId;

      return api("/Items/" + id + "/PlaybackInfo", { UserId: cfg().userId })
        .then(function (info) {
          var ms = (info && info.MediaSources && info.MediaSources[0]) || null;
          return ms;
        })
        .catch(function () { return null; })
        .then(function (ms) {
          var streams = [];
          var subs = [];
          var msId = ms ? ms.Id : id;

          // Umgepackter HLS-Strom: laeuft auch, wenn der Fernseher den
          // Originalcodec nicht kann.
          streams.push({
            label: "Automatisch",
            type: "hls",
            url: U.withQuery(base() + "/Videos/" + id + "/master.m3u8", {
              api_key: key,
              MediaSourceId: msId,
              VideoCodec: "h264",
              AudioCodec: "aac,mp3",
              TranscodingContainer: "ts",
              TranscodingProtocol: "hls",
              DeviceId: DEVICE_ID
            })
          });

          // Direkter Strom ohne Umbau - beste Qualitaet, wenn der Codec passt.
          if (!ms || ms.SupportsDirectStream !== false) {
            streams.push({
              label: "Direkt (ohne Umwandlung)",
              type: "mp4",
              url: U.withQuery(base() + "/Videos/" + id + "/stream", {
                api_key: key, Static: "true", MediaSourceId: msId, DeviceId: DEVICE_ID
              })
            });
          }

          if (ms && Array.isArray(ms.MediaStreams)) {
            ms.MediaStreams.forEach(function (s) {
              if (s.Type !== "Subtitle" || !s.IsTextSubtitleStream) { return; }
              subs.push({
                label: s.DisplayTitle || s.Language || "Untertitel",
                lang: s.Language || "",
                url: U.withQuery(
                  base() + "/Videos/" + id + "/" + msId + "/Subtitles/" + s.Index + "/Stream.vtt",
                  { api_key: key }
                )
              });
            });
          }

          item.streams = streams;
          item.subtitles = subs;
          return item;
        });
    },

    /** Fortschritt an den Server melden, damit andere Geraete gleichziehen. */
    report: function (item, pos, paused) {
      if (!JF.enabled() || !global.Store.pref("reportToServer")) { return; }
      if (!item || !item.jfId) { return; }
      api("/Sessions/Playing/Progress", null, {
        method: "POST",
        json: false,
        timeout: 8000,
        body: JSON.stringify({
          ItemId: item.jfId,
          PositionTicks: Math.floor(pos * TICKS),
          IsPaused: !!paused,
          PlayMethod: "Transcode",
          CanSeek: true
        })
      }).catch(function () { /* Meldung ist Beiwerk, Wiedergabe laeuft weiter */ });
    }
  };

  global.SourceJellyfin = JF;
  return JF;
}(window));
