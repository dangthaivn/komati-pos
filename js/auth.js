/* KOMATI — đăng nhập & phân quyền.
 * BẢO MẬT: mật khẩu KHÔNG BAO GIỜ lưu dạng text trong code hay localStorage.
 * - Chế độ Firebase: dùng Firebase Auth (mật khẩu lưu & băm phía Google).
 * - Chế độ demo (chưa nối Firebase): mật khẩu lưu dưới dạng SHA-256 + salt
 *   trong bản ghi nhân viên; tài khoản admin mặc định được tạo ở lần chạy đầu.
 * Màn hình đăng nhập: không gợi ý, không điền sẵn tên/mật khẩu; nút "Ghi nhớ"
 * chỉ lưu TÊN ĐĂNG NHẬP, mật khẩu luôn phải tự gõ lại. */
const Auth = (() => {
  const SESSION_KEY = "komati_session";
  const REMEMBER_KEY = "komati_remember_user";

  const PERMISSIONS = [
    { key: "dashboard", label: "Xem Tổng quan" },
    { key: "pos", label: "Bán hàng (POS)" },
    { key: "products", label: "Quản lý Hàng hóa" },
    { key: "orders", label: "Quản lý Đơn hàng" },
    { key: "customers", label: "Quản lý Khách hàng" },
    { key: "employees", label: "Quản lý Nhân viên" },
    { key: "cashbook", label: "Quản lý Sổ quỹ" },
    { key: "print", label: "Cài đặt In ấn" },
  ];
  const ROLE_PRESETS = {
    "Quản trị": PERMISSIONS.map((p) => p.key),
    "Thu ngân": ["dashboard", "pos", "orders", "customers", "cashbook"],
    "Bán hàng": ["dashboard", "pos", "products", "orders", "customers"],
    "Kho": ["dashboard", "products", "orders"],
  };

  let currentUser = null;

  async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function makeSalt() { return Math.random().toString(36).slice(2, 10); }
  async function hashPassword(password, salt) { return sha256(salt + "::" + password); }

  async function ensureAdmin() {
    // Chế độ Firebase: tài khoản admin được tạo trong Firebase Auth (xem firebase-config.js),
    // không tạo tài khoản demo ở đây.
    if (DB.isFirebase()) return;
    const db = DB.get();
    if (!db.employees.find((e) => e.username === "admin")) {
      const salt = makeSalt();
      db.employees.push({
        id: "emp_admin", username: "admin", name: "Quản trị viên",
        role: "Quản trị", permissions: ROLE_PRESETS["Quản trị"].slice(),
        salt, passwordHash: await hashPassword("123456", salt),
        phone: "", note: "Tài khoản quản lý mặc định — đổi mật khẩu ngay sau lần đăng nhập đầu.",
      });
      DB.save();
    }
  }

  async function loginDemo(username, password) {
    const db = DB.get();
    const base = username.split("@")[0];
    const emp = db.employees.find((e) => e.username === username)
      || db.employees.find((e) => e.username === base);
    if (!emp) return { ok: false, error: "Tên đăng nhập hoặc mật khẩu chưa đúng." };
    const hash = await hashPassword(password, emp.salt);
    if (hash !== emp.passwordHash) return { ok: false, error: "Tên đăng nhập hoặc mật khẩu chưa đúng." };
    return { ok: true, user: emp };
  }

  async function loginFirebase(username, password) {
    // Firebase Auth cần email. Sếp có thể gõ "admin" hoặc cả email "admin@komati.local":
    // nếu đã có @ thì dùng nguyên, chưa có thì tự thêm @komati.local.
    const email = username.includes("@") ? username.toLowerCase() : username.toLowerCase() + "@komati.local";
    const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
    // Đăng nhập xong mới được đọc Firestore: tải dữ liệu thật về trước khi
    // tìm hồ sơ nhân viên (trước đây app đọc Firestore ngay lúc khởi động,
    // khi chưa đăng nhập nên bị luật cấm và dữ liệu trống, gây lỗi đăng nhập).
    try {
      await DB.loadAfterLogin();
    } catch (e) {
      return { ok: false, error: "Đã đăng nhập nhưng không tải được dữ liệu cửa hàng. Kiểm tra mạng rồi thử lại." };
    }
    const db = DB.get();
    const base = username.split("@")[0];
    let emp = db.employees.find((e) => e.username === username)
      || db.employees.find((e) => e.username === base);
    if (!emp) {
      const isAdmin = base === "admin";
      emp = { id: cred.user.uid, username: base, name: isAdmin ? "Quản trị viên" : base, role: isAdmin ? "Quản trị" : "Bán hàng", permissions: (isAdmin ? ROLE_PRESETS["Quản trị"] : ROLE_PRESETS["Bán hàng"]).slice(), phone: "", note: "" };
      await DB.put("employees", emp);
    }
    return { ok: true, user: emp };
  }

  async function login(username, password) {
    username = (username || "").trim();
    if (!username || !password) return { ok: false, error: "Vui lòng nhập tên đăng nhập và mật khẩu." };
    // App đã nối Firebase nhưng thư viện Firebase chưa tải xong (mất mạng
    // thoáng qua): báo rõ để biết tải lại trang, thay vì lỗi chung chung.
    if (window.KOMATI_FIREBASE_CONFIG && window.KOMATI_FIREBASE_CONFIG.apiKey
      && window.KOMATI_FIREBASE_CONFIG.apiKey !== "PASTE_API_KEY_HERE"
      && typeof firebase === "undefined") {
      return { ok: false, error: "Không tải được dịch vụ đăng nhập. Kiểm tra mạng rồi tải lại trang." };
    }
    try {
      const res = DB.isFirebase() ? await loginFirebase(username, password) : await loginDemo(username, password);
      if (!res.ok) return res;
      currentUser = res.user;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: currentUser.username, ts: Date.now() }));
      return { ok: true, user: currentUser };
    } catch (e) {
      const code = e && e.code ? String(e.code) : "";
      const msg = {
        "auth/invalid-email": "Tên đăng nhập chưa đúng định dạng.",
        "auth/user-not-found": "Tên đăng nhập hoặc mật khẩu chưa đúng.",
        "auth/wrong-password": "Tên đăng nhập hoặc mật khẩu chưa đúng.",
        "auth/invalid-credential": "Tên đăng nhập hoặc mật khẩu chưa đúng.",
        "auth/user-disabled": "Tài khoản này đã bị khóa.",
        "auth/too-many-requests": "Đăng nhập sai quá nhiều lần. Thử lại sau ít phút.",
        "auth/network-request-failed": "Không có mạng. Kiểm tra kết nối rồi thử lại.",
      }[code];
      return { ok: false, error: msg || ("Không đăng nhập được" + (code ? " (" + code + ")" : "") + ". Kiểm tra lại thông tin hoặc mạng.") };
    }
  }
  function logout() {
    currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
    if (DB.isFirebase() && typeof firebase !== "undefined") firebase.auth().signOut().catch(() => {});
  }
  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const emp = DB.get().employees.find((e) => e.username === s.username);
      if (emp) { currentUser = emp; return emp; }
    } catch (e) { /* hết phiên */ }
    return null;
  }
  function me() { return currentUser; }
  function can(perm) { return !!currentUser && (currentUser.role === "Quản trị" || (currentUser.permissions || []).includes(perm)); }
  function rememberedUser() { try { return localStorage.getItem(REMEMBER_KEY) || ""; } catch (e) { return ""; } }
  function setRememberedUser(username, remember) {
    try { if (remember) localStorage.setItem(REMEMBER_KEY, username); else localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* bỏ qua */ }
  }
  async function setPassword(emp, newPassword) {
    if (DB.isFirebase() && typeof firebase !== "undefined" && firebase.auth().currentUser) {
      await firebase.auth().currentUser.updatePassword(newPassword);
      return;
    }
    const salt = makeSalt();
    emp.salt = salt;
    emp.passwordHash = await hashPassword(newPassword, salt);
    await DB.put("employees", emp);
  }

  return { PERMISSIONS, ROLE_PRESETS, ensureAdmin, login, logout, restoreSession, me, can, rememberedUser, setRememberedUser, setPassword };
})();
