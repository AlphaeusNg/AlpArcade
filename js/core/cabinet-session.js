/**
 * Request-scoped lifecycle for lazy cabinet navigation.
 * A cancelled load may finish fetching, but it must never mount or clean up a
 * newer request after the player has returned to the lobby.
 */
(function (global) {
  "use strict";

  function create() {
    let nextToken = 0;
    let currentToken = 0;

    function begin() {
      if (currentToken) return null;
      currentToken = ++nextToken;
      return currentToken;
    }

    function isCurrent(token) {
      return !!token && token === currentToken;
    }

    function cancel() {
      currentToken = 0;
    }

    function finish(token) {
      if (!isCurrent(token)) return false;
      currentToken = 0;
      return true;
    }

    return Object.freeze({ begin, isCurrent, cancel, finish });
  }

  global.ArcadeCabinetSession = Object.freeze({ create });
})(window);
