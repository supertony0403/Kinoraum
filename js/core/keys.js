/* Tastencodes der LG-Fernbedienung.
   Die Pfeil- und OK-Codes sind Browser-Standard, alles darunter ist webOS.
   "Zurueck" ist 461 und kommt nur an, wenn appinfo.json
   disableBackHistoryAPI:true setzt - sonst frisst es die History-API. */
(function (global) {
  "use strict";

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
    OK: 13,
    BACK: 461,
    ESC: 27,

    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,

    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 179, STOP: 413,
    FF: 417, RW: 412,

    CH_UP: 33, CH_DOWN: 34,

    // Manche Modelle senden fuer OK zusaetzlich den Ziffernblock-Enter.
    NUM_ENTER: 108
  };

  K.isBack = function (code) { return code === K.BACK || code === K.ESC; };
  K.isOk = function (code) { return code === K.OK || code === K.NUM_ENTER; };

  K.dirOf = function (code) {
    if (code === K.LEFT) { return "left"; }
    if (code === K.RIGHT) { return "right"; }
    if (code === K.UP) { return "up"; }
    if (code === K.DOWN) { return "down"; }
    return null;
  };

  return (global.Keys = K);
}(window));
