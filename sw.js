/* KOMATI service worker — cache-first cho app shell.
 * QUAN TRỌNG: tăng số phiên bản CACHE sau MỖI lần deploy, nếu không
 * trình duyệt sẽ tiếp tục hiện giao diện cũ (bài học từ app chấm công). */
const CACHE = "komati-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./js/db.js",
  "./js/auth.js",
  "./js/app.js",
  "./js/pos.js",
  "./firebase-config.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Không cache dữ liệu Firebase / Google Fonts — luôn lấy mới.
  if (url.hostname.includes("firestore.googleapis.com") || url.hostname.includes("firebaseio.com") || url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
