/**
 * Firebase config for AlpArcade global scoreboard.
 *
 * Setup (free Spark tier):
 * 1. https://console.firebase.google.com → project alparcade (or yours)
 * 2. Authentication → Sign-in method → enable **Google** (Anonymous optional/unused)
 * 3. Authorized domains → alphaeusng.github.io + localhost
 * 4. Firestore → publish firestore.rules from this repo
 * 5. Create composite index: scores · game ASC + rankScore DESC
 *    (or open the link Firestore prints in the browser console on first per-game query)
 * 6. Set enabled: true below
 *
 * Writes require Google sign-in. Play stays fully local until the player
 * chooses "Save score" after a run.
 */
(function (global) {
  "use strict";

  global.ARCADE_FIREBASE_CONFIG = {
    enabled: true,
    apiKey: "AIzaSyAWNQ_-0BW8VEZWZ7NfYaAyHK-Dwr3U6WA",
    authDomain: "alparcade-cb87c.firebaseapp.com",
    projectId: "alparcade-cb87c",
    storageBucket: "alparcade-cb87c.firebasestorage.app",
    messagingSenderId: "89467004937",
    appId: "1:89467004937:web:3968ecc9048724e50370d8",
    measurementId: "G-FSH0T9P43C",
  };
})(window);
