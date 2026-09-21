/* Public Firebase client configuration only. Never put service-account keys here. */
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js",
);
const config = JSON.parse(
  new URL(self.location.href).searchParams.get("config"),
);
firebase.initializeApp(config);
firebase.messaging();
