/**
 * Firebase config for AlpArcade global scoreboard.
 *
 * Setup (free Spark tier):
 * 1. https://console.firebase.google.com → Create project
 * 2. Build → Firestore Database → Create (start in test mode, then paste firestore.rules)
 * 3. Build → Authentication → Sign-in method → enable Anonymous
 * 4. Project settings → Your apps → Web → copy config below
 * 5. Set enabled: true and commit
 *
 * Until enabled is true, the arcade stays fully local (localStorage only).
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
    measurementId: "G-FSH0T9P43C"
  };
})(window);