/* KOMATI — tầng dữ liệu.
 * Chế độ DEMO (chưa có Firebase): dữ liệu lưu ở localStorage của trình duyệt.
 * Khi có firebase-config.js hợp lệ: dùng Firestore + Firebase Auth (xem js/auth.js).
 * Mọi màn hình chỉ gọi DB.* — đổi backend không cần sửa giao diện. */
const DB = (() => {
  const LS_KEY = "komati_demo_db_v1";
  const FIREBASE_READY = typeof window !== "undefined" && window.KOMATI_FIREBASE_CONFIG
    && window.KOMATI_FIREBASE_CONFIG.apiKey && window.KOMATI_FIREBASE_CONFIG.apiKey !== "PASTE_API_KEY_HERE";

  let store = null; // demo store (localStorage)
  let fs = null;    // firestore instance khi có Firebase

  const uid = (p = "id") => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const todayStr = (d = new Date()) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const fmtMoney = (n) => (Number(n) || 0).toLocaleString("vi-VN");
  const parseNum = (v) => { const n = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

  function seed() {
    const t = todayStr();
    const cats = [
      { id: "cat_trai", name: "Trái cây nhập khẩu" },
      { id: "cat_viet", name: "Trái cây Việt" },
      { id: "cat_gio", name: "Giỏ quà" },
      { id: "cat_khac", name: "Vật dụng" },
    ];
    const products = [
      { id: "sp_cherry_kg", code: "SP001972", name: "Quả Anh Đào (Cherry) Đỏ Royal Lynn (King Red) ÚC", categoryId: "cat_trai", costPrice: 640000, price: 775000, unit: "Kg", units: [{ name: "Thùng", factor: 5, price: 3875000 }], stock: 4.5, expiryDate: null, image: "" },
      { id: "sp_cherry_thung", code: "SP001973", name: "Quả Anh Đào (Cherry) Đỏ Royal Lynn (King Red) ÚC (Thùng)", categoryId: "cat_trai", costPrice: 3200000, price: 3875000, unit: "Thùng", units: [], stock: 0.9, expiryDate: null, image: "" },
      { id: "sp_quyt_hop", code: "SP001970", name: "Quả quýt tươi đóng 2kg/hộp", categoryId: "cat_viet", costPrice: 126000, price: 180000, unit: "Hộp", units: [{ name: "Kg", factor: 0.5, price: 90000 }], stock: 12.5, expiryDate: null, image: "" },
      { id: "sp_quyt_kg", code: "SP001969", name: "Quả quýt tươi đóng 2kg/hộp (Kg)", categoryId: "cat_viet", costPrice: 63214, price: 90000, unit: "Kg", units: [], stock: 20, expiryDate: null, image: "" },
      { id: "sp_nho", code: "SP001965", name: "Nho xanh không hạt Green Envy (Royalty) - Mỹ", categoryId: "cat_trai", costPrice: 162500, price: 210000, unit: "Kg", units: [], stock: 80, expiryDate: null, image: "" },
      { id: "sp_tao", code: "SP001959", name: "Táo quả tươi - 7kg/thùng", categoryId: "cat_trai", costPrice: 84000, price: 115000, unit: "Kg", units: [{ name: "Thùng", factor: 7, price: 805000 }], stock: 0, expiryDate: null, image: "" },
      { id: "sp_nho_tuoi", code: "SP001957", name: "Quả nho tươi đóng 1.5kg/hộp", categoryId: "cat_trai", costPrice: 115500, price: 165000, unit: "Hộp", units: [], stock: 0.01, expiryDate: null, image: "" },
      { id: "sp_gio550", code: "SP001962", name: "Giỏ quà trái cây 550", categoryId: "cat_gio", costPrice: 405356, price: 550000, unit: "Giỏ", units: [], stock: 0, expiryDate: null, image: "" },
      { id: "sp_gio1500", code: "SP001963", name: "Giỏ quà trái cây 1500", categoryId: "cat_gio", costPrice: 1100000, price: 1500000, unit: "Giỏ", units: [], stock: 3, expiryDate: null, image: "" },
      { id: "sp_tui", code: "SP001971", name: "Túi giấy kích thước 24x24x23", categoryId: "cat_khac", costPrice: 6480, price: 10000, unit: "Cái", units: [], stock: 540, expiryDate: null, image: "" },
    ];
    const customers = [
      { id: "kh_001", code: "KH1000046", name: "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN Á CHÂU", phone: "", address: "", note: "", debt: 0, totalBought: 550050 },
      { id: "kh_002", code: "KH1000045", name: "CÔNG TY TNHH MYTEAM VIETNAM", phone: "", address: "", note: "", debt: 0, totalBought: 800000 },
      { id: "kh_003", code: "KH1000042", name: "Công đoàn cơ sở Bảo hiểm xã hội thành phố Huế", phone: "", address: "", note: "", debt: 0, totalBought: 2200300 },
      { id: "kh_004", code: "KH1000040", name: "Trường Đại Học Y - Dược, Đại học Huế", phone: "", address: "", note: "", debt: 0, totalBought: 4800345 },
      { id: "kh_005", code: "KH1000034", name: "HỘ KINH DOANH MIHAN", phone: "", address: "", note: "", debt: 0, totalBought: 13401040 },
      { id: "kh_006", code: "KH1000033", name: "CÔNG TY TNHH SNOW BRICKS", phone: "", address: "", note: "", debt: 0, totalBought: 500000 },
    ];
    return {
      meta: { seededAt: t, version: 1 },
      settings: {
        storeName: "Cửa hàng Farm Plus", storeAddress: "13 Trần Quang Khải, TP Huế",
        storePhone: "0775 657585", logo: "", receiptFooter: "Cảm ơn quý khách đã ủng hộ Farm Plus!",
        receiptFontSize: 12, showLogo: true, showAddress: true,
      },
      categories: cats,
      products,
      customers,
      employees: [], // auth.js sẽ tạo tài khoản admin mặc định
      orders: [],
      cashEntries: [],
      stockIns: [],
      stockChecks: [],
      activity: [],
    };
  }

  function loadDemo() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { store = JSON.parse(raw); return; }
    } catch (e) { /* bỏ qua, tạo mới */ }
    store = seed();
    saveDemo();
  }
  function saveDemo() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* hết dung lượng */ }
  }

  // ---- Firestore (khi đã cấu hình) ----
  async function initFirebase() {
    if (!FIREBASE_READY || typeof firebase === "undefined") return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.KOMATI_FIREBASE_CONFIG);
      fs = firebase.firestore();
      return true;
    } catch (e) { console.warn("Firebase init lỗi:", e); return false; }
  }
  const COLS = ["settings", "categories", "products", "customers", "employees", "orders", "cashEntries", "stockIns", "stockChecks", "activity"];
  async function loadFromFirestore() {
    const data = { meta: { version: 1 } };
    for (const c of COLS) {
      if (c === "settings") {
        const doc = await fs.collection("settings").doc("store").get();
        data.settings = doc.exists ? doc.data() : seed().settings;
      } else {
        const snap = await fs.collection(c).get();
        data[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    }
    if (!data.products.length && !data.categories.length) {
      // Lần đầu nối Firebase: ghi dữ liệu mẫu (hàng hóa + khách hàng Farm Plus)
      // lên Firestore để dữ liệu tồn tại thật và đồng bộ giữa các máy.
      const s = seed();
      Object.assign(data, { categories: s.categories, products: s.products, customers: s.customers, settings: s.settings });
      await saveToFirestore("settings", s.settings);
      for (const c of s.categories) await saveToFirestore("categories", c);
      for (const p of s.products) await saveToFirestore("products", p);
      for (const c of s.customers) await saveToFirestore("customers", c);
    }
    return data;
  }
  async function saveToFirestore(coll, item) {
    if (coll === "settings") { await fs.collection("settings").doc("store").set(item); return; }
    await fs.collection(coll).doc(item.id).set(item);
  }
  async function deleteFromFirestore(coll, id) { await fs.collection(coll).doc(id).delete(); }

  // Cấu trúc rỗng dùng trước khi đăng nhập: Firestore cấm mọi truy cập khi
  // chưa xác thực, nên không thể đọc dữ liệu thật ở bước khởi động.
  function emptyShell() {
    return {
      meta: { version: 1 },
      settings: seed().settings,
      categories: [], products: [], customers: [], employees: [],
      orders: [], cashEntries: [], stockIns: [], stockChecks: [], activity: [],
    };
  }
  // Đợi Firebase Auth xác định xong trạng thái đăng nhập (tài khoản đã lưu
  // trên máy sẽ tự khôi phục; chưa đăng nhập thì trả về null sau tối đa 3 giây).
  function currentAuthUser() {
    return new Promise((resolve) => {
      try {
        if (typeof firebase === "undefined" || !firebase.auth) return resolve(null);
        const auth = firebase.auth();
        if (auth.currentUser) return resolve(auth.currentUser);
        let done = false;
        const finish = (u) => { if (!done) { done = true; clearTimeout(t); try { unsub(); } catch (e) {} resolve(u || null); } };
        const t = setTimeout(() => finish(auth.currentUser), 3000);
        const unsub = auth.onAuthStateChanged((u) => finish(u));
      } catch (e) { resolve(null); }
    });
  }

  // ---- API chung (giao diện chỉ gọi các hàm này) ----
  async function init() {
    const ok = await initFirebase();
    if (ok) {
      const user = await currentAuthUser();
      if (user) {
        try { store = await loadFromFirestore(); }
        catch (e) { console.warn("Không tải được dữ liệu Firestore:", e); store = emptyShell(); }
      } else {
        // Chưa đăng nhập: không đọc Firestore (luật cấm), dùng dữ liệu trống
        // tại chỗ để màn hình đăng nhập hoạt động; dữ liệu thật tải sau khi
        // đăng nhập xong (xem loadAfterLogin).
        store = emptyShell();
      }
    } else loadDemo();
    return { firebase: ok };
  }
  // Sau khi đăng nhập thành công mới được phép đọc/ghi Firestore: tải dữ liệu
  // thật về (và ghi dữ liệu mẫu nếu kho còn trống).
  async function loadAfterLogin() {
    if (!fs) return store;
    store = await loadFromFirestore();
    return store;
  }
  function get() { return store; }
  function save() { if (fs) { /* Firestore: ghi theo từng collection khi thay đổi (xem put/remove) */ } else saveDemo(); }
  async function put(coll, item) {
    const arr = store[coll];
    if (Array.isArray(arr)) {
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
    } else if (coll === "settings") store.settings = item;
    if (fs) await saveToFirestore(coll, item); else saveDemo();
  }
  async function remove(coll, id) {
    const arr = store[coll];
    if (Array.isArray(arr)) { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); }
    if (fs) await deleteFromFirestore(coll, id); else saveDemo();
  }
  function logActivity(text, amount, icon = "🧾", time = new Date()) {
    store.activity.unshift({ id: uid("ac"), text, amount, icon, time: time.toISOString() });
    store.activity = store.activity.slice(0, 60);
    if (!fs) saveDemo();
  }

  return { init, get, save, put, remove, logActivity, uid, todayStr, fmtMoney, parseNum, isFirebase: () => !!fs, loadAfterLogin };
})();
