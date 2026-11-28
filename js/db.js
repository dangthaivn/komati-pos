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
  // Giới hạn thời gian chờ một tác vụ mạng: quá hạn thì báo lỗi rõ ràng thay vì
  // treo mãi (đăng nhập từng bị kẹt ở "Đang đăng nhập..." khi mạng chập chờn).
  function withTimeout(promise, ms, message) {
    let t;
    const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message || ("Hết thời gian chờ sau " + ms / 1000 + " giây."))), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  function seed() {
    const t = todayStr();
    const cats = [
      { id: "cat_trai", name: "Trái cây nhập khẩu" },
      { id: "cat_viet", name: "Trái cây Việt" },
      { id: "cat_gio", name: "Giỏ quà" },
      { id: "cat_combo", name: "Combo - đóng gói" },
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

  // ---- Lô hàng (dùng cho kiểm kho theo lô & trừ kho FEFO) ----
  // Mỗi sản phẩm có danh sách lô: {id, code, expiryDate, qty}. Tồn kho =
  // tổng số lượng các lô. Sản phẩm cũ chưa có lô thì gom toàn bộ tồn hiện
  // tại thành 1 lô duy nhất.
  function ensureLots(p) {
    if (!p) return p;
    if (!Array.isArray(p.lots)) {
      p.lots = ((p.stock || 0) > 0 || p.expiryDate)
        ? [{ id: uid("lo"), code: "Lô 1", expiryDate: p.expiryDate || null, qty: p.stock || 0 }]
        : [];
    }
    return p;
  }
  function recalcStock(p) {
    // Tồn kho = tổng các lô; hạn sử dụng của sản phẩm = HSD sớm nhất còn hàng.
    if (Array.isArray(p.lots) && p.lots.length) {
      p.stock = p.lots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
      const exps = p.lots.filter((l) => (parseFloat(l.qty) || 0) > 0 && l.expiryDate).map((l) => l.expiryDate).sort();
      p.expiryDate = exps.length ? exps[0] : null;
    }
    return p;
  }
  // Trừ kho theo lô hết hạn trước (FEFO): bán lô sắp hết hạn trước.
  function deductFromLots(p, qty) {
    if (!Array.isArray(p.lots) || !p.lots.length) { p.stock = (p.stock || 0) - qty; return; }
    let left = qty;
    const sorted = p.lots.slice().sort((a, b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999")));
    for (const lot of sorted) {
      if (left <= 0) break;
      const take = Math.min(parseFloat(lot.qty) || 0, left);
      lot.qty = (parseFloat(lot.qty) || 0) - take;
      left -= take;
    }
    recalcStock(p);
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
    // Đọc song song cho nhanh (trước đây đọc tuần tự từng collection nên
    // lần đăng nhập đầu mất hàng chục giây).
    const [settingsDoc, seedMarker, ...snaps] = await withTimeout(Promise.all([
      fs.collection("settings").doc("store").get(),
      fs.collection("settings").doc("seed").get(),
      ...COLS.filter((c) => c !== "settings").map((c) => fs.collection(c).get()),
    ]), 15000, "Tải dữ liệu cửa hàng quá lâu. Kiểm tra mạng rồi thử lại.");
    COLS.filter((c) => c !== "settings").forEach((c, i) => {
      data[c] = snaps[i].docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    data.settings = settingsDoc.exists ? settingsDoc.data() : seed().settings;
    if (!seedMarker.exists) {
      // Lần đầu nối Firebase (hoặc lần ghi mẫu trước bị ngắt giữa chừng, ví dụ
      // tải lại trang lúc đang đăng nhập lần đầu): chỉ ghi thêm những mục mẫu
      // còn thiếu, rồi đánh dấu đã ghi xong để lần sau không ghi lại — kể cả
      // khi Sếp đã xóa hàng mẫu.
      const s = seed();
      s.products.forEach(ensureLots);
      const jobs = [];
      if (!settingsDoc.exists) jobs.push(saveToFirestore("settings", s.settings));
      const missing = (coll, items) => items.filter((it) => !data[coll].some((x) => x.id === it.id));
      for (const c of missing("categories", s.categories)) { data.categories.push(c); jobs.push(saveToFirestore("categories", c)); }
      for (const p of missing("products", s.products)) { data.products.push(p); jobs.push(saveToFirestore("products", p)); }
      for (const cu of missing("customers", s.customers)) { data.customers.push(cu); jobs.push(saveToFirestore("customers", cu)); }
      jobs.push(fs.collection("settings").doc("seed").set({ done: true, at: new Date().toISOString() }));
      await Promise.all(jobs);
    }
    data.products.forEach(ensureLots);
    await backfillActivity(data);
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
    if (store && Array.isArray(store.products)) store.products.forEach(ensureLots);
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
  // Nhật ký cửa hàng (Hoạt động gần đây ở Tổng quan): mỗi mục ghi vào
  // Firestore để tải lại trang / đổi máy vẫn còn. Trước đây hàm này chỉ
  // ghi vào bộ nhớ trong phiên nên nhật ký luôn trống sau khi tải lại —
  // đó là lý do Sếp thấy "Chưa có hoạt động nào."
  function logActivity(text, amount, icon = "🧾", time = new Date()) {
    const entry = { id: uid("ac"), text, amount, icon, time: time.toISOString() };
    store.activity.unshift(entry);
    const dropped = store.activity.splice(60);
    if (fs) {
      saveToFirestore("activity", entry).catch((e) => console.warn("Không ghi được nhật ký:", e));
      dropped.forEach((d) => deleteFromFirestore("activity", d.id).catch(() => {}));
    } else saveDemo();
  }
  // Lần đầu sau khi sửa: nhật ký trên Firestore còn trống (trước đây không
  // ghi) nhưng cửa hàng đã có dữ liệu thật — dựng lại nhật ký từ đơn hàng,
  // phiếu thu/chi, nhập kho, kiểm kho. Chỉ chạy khi nhật ký đang trống.
  async function backfillActivity(data) {
    if (!fs || (data.activity && data.activity.length)) return;
    const entries = [];
    const push = (text, amount, icon, time) => {
      const t = time ? new Date(time) : null;
      if (!t || isNaN(t.getTime())) return;
      entries.push({ id: uid("ac"), text, amount, icon, time: t.toISOString() });
    };
    const byId = (coll, id) => (data[coll] || []).find((x) => x.id === id);
    const at = (x) => x.time || (x.date ? x.date + "T00:00:00" : null);
    const orderRevenue = (o) => (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.qty || 0) - (it.discount || 0), 0) - (o.discountValue || 0) + (o.shipping || 0);
    for (const o of data.orders || []) {
      const rev = orderRevenue(o);
      if (o.status === "returned") push(`Trả hàng hóa đơn ${o.code}`, rev, "↩️", at(o));
      else if (o.status === "cancelled") push(`Hủy hóa đơn ${o.code}`, rev, "🗑️", at(o));
      else push(`Bán đơn hàng ${o.code} cho ${o.customerName || "Khách lẻ"}`, rev, "🛒", at(o));
    }
    // Phiếu tự sinh theo đơn hàng / nhập kho / trả hàng đã có dòng nhật ký
    // riêng từ dữ liệu gốc nên bỏ qua ở đây để khỏi ghi trùng.
    const AUTO_CATS = ["Bán hàng", "Bán hàng ghi nợ", "Hoàn tiền trả hàng", "Mua hàng"];
    for (const x of data.cashEntries || []) {
      if (AUTO_CATS.includes(x.category)) continue;
      if (x.category === "Khách trả nợ") {
        const c = x.customerId ? byId("customers", x.customerId) : null;
        push(`${c ? c.name : (x.person || "Khách hàng")} trả nợ`, x.amount, "💵", at(x));
      } else if (x.category === "Thu tiền khách trả") {
        push(`${x.person || "Khách hàng"} trả nợ`, x.amount, "💵", at(x));
      } else if (x.type === "in") push(`Phiếu thu ${x.category}${x.note ? " — " + x.note : ""}`, x.amount, "💵", at(x));
      else push(`Phiếu chi ${x.category}${x.note ? " — " + x.note : ""}`, x.amount, "💸", at(x));
    }
    for (const s of data.stockIns || []) {
      const p = s.productId ? byId("products", s.productId) : null;
      const unit = p && p.unit ? " " + p.unit : "";
      push(`Nhập kho ${s.qty}${unit} ${s.name}`, (s.qty || 0) * (s.cost || 0), "📥", at(s));
    }
    for (const r of data.stockChecks || []) {
      const changed = (r.items || []).filter((it) => (it.diff || 0) !== 0).length;
      push(`Kiểm kho ${r.code}: ${(r.items || []).length} dòng kiểm, ${changed} dòng đổi số lượng`, r.totalDiff || 0, "📋", at(r));
    }
    // Bỏ trùng (cùng nội dung + cùng thời điểm), xếp mới nhất trước, giữ tối đa 60.
    const seen = new Set();
    const list = entries
      .filter((e) => { const k = e.text + "|" + e.time; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => String(b.time).localeCompare(String(a.time)))
      .slice(0, 60);
    if (!list.length) return;
    data.activity = list;
    await Promise.all(list.map((e) => saveToFirestore("activity", e).catch(() => {})));
  }

  return { init, get, save, put, remove, logActivity, uid, todayStr, fmtMoney, parseNum, isFirebase: () => !!fs, loadAfterLogin, ensureLots, recalcStock, deductFromLots, withTimeout };
})();
