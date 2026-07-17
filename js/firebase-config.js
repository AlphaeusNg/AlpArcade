/**
 * Firebase config for AlpArcade global scoreboard (runtime, loaded by index.html).
 *
 * Infra (rules, indexes, deploy): ../firebase/README.md
 * CLI from repo root: npx firebase-tools deploy --only firestore:rules
 *
 * Setup (free Spark tier):
 * 1. https://console.firebase.google.com → project alparcade-cb87c (or yours)
 * 2. Authentication → Sign-in method → enable **Google**
 * 3. Authorized domains → alphaeusng.github.io + localhost + 127.0.0.1
 * 4. Publish rules from firebase/firestore.rules
 * 5. Indexes: firebase/firestore.indexes.json (or console link on first query)
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
