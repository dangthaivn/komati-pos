/* KOMATI service worker — ưu tiên MẠNG cho app shell.
 * Mỗi lần mở app là thử tải bản mới từ máy chủ trước, chỉ dùng bản đã lưu
 * khi mất mạng — để bản mới lên máy trong vòng vài chục giây, không còn bị
 * kẹt ở bản cũ như thời cache-first (bài học từ app chấm công + KOMATI v18).
 * QUAN TRỌNG: tăng số phiên bản CACHE sau MỖI lần deploy. */
const CACHE = "komati-v29";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./js/template.js",
  "./js/db.js",
  "./js/auth.js",
  "./js/app.js",
  "./js/pos.js",
  "./js/vendor/html5-qrcode.min.js",
  "./firebase-config.js",
];
self.addEventListener("install", (e) => {
  // cache:"reload" — lúc cài bản mới luôn tải thẳng từ máy chủ, không dùng
  // bản cũ còn nằm trong bộ nhớ đệm của trình duyệt.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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
  // App shell: ưu tiên mạng (luôn lấy bản mới nhất khi có mạng), rớt mạng
  // thì dùng bản đã lưu để vẫn dùng offline được.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
