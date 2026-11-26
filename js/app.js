/* KOMATI — logic chính: điều hướng, dashboard, hàng hóa, đơn hàng. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => DB.fmtMoney(n);
const todayStr = () => DB.todayStr();
function dstr(d) { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function dLabel(iso) { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
function moneyInput(v) { return DB.parseNum(v); }
// Tài khoản nhân viên (không phải Quản trị): ẩn số tiền lợi nhuận, ẩn nút hủy/trả hàng.
function isStaffUser() { const me = Auth.me(); return !!me && me.role !== "Quản trị"; }

/* ---------- Chống trùng lặp ---------- */
// Chuẩn hóa SĐT để so sánh: chỉ giữ chữ số, +84… → 0…
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
  return d;
}
function findCustomerByPhone(db, phone) {
  const n = normPhone(phone);
  if (!n) return null;
  return db.customers.find((c) => normPhone(c.phone) === n) || null;
}
function findProductByCode(db, code, excludeId) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;
  return db.products.find((p) => String(p.code || "").trim().toLowerCase() === c && p.id !== excludeId) || null;
}

/* ---------- Modal dùng chung ---------- */
function openModal(html, wide = false) {
  const m = $("#modal"), card = $("#modalCard");
  card.className = "modal-card" + (wide === "xl" ? " xl" : wide ? " wide" : "");
  card.innerHTML = html;
  m.hidden = false;
  return card;
}
function closeModal() { $("#modal").hidden = true; $("#modalCard").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
function confirmBox(title, text, okLabel = "Xóa") {
  return new Promise((resolve) => {
    const card = openModal(`<h3>${esc(title)}</h3><p style="color:#475569;line-height:1.5">${esc(text)}</p>
      <div class="modal-actions"><button class="btn btn-outline" id="cfCancel" type="button">Hủy</button>
      <button class="btn btn-danger" id="cfOk" type="button">${esc(okLabel)}</button></div>`);
    $("#cfCancel", card).onclick = () => { closeModal(); resolve(false); };
    $("#cfOk", card).onclick = () => { closeModal(); resolve(true); };
  });
}

/* ---------- Khởi động ---------- */
let currentView = "dashboard";
async function boot() {
  await DB.init();
  await Auth.ensureAdmin();
  const remembered = Auth.rememberedUser();
  if (remembered) $("#loginUser").value = remembered;
  const sess = Auth.restoreSession();
  if (sess) enterApp();
  else { $("#loginScreen").hidden = false; }
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("#loginUser").value, p = $("#loginPass").value;
  const err = $("#loginError");
  const btn = $("#loginForm button[type=submit]");
  // Hiện trạng thái đang xử lý để Sếp biết app đang làm việc (lần đăng nhập
  // đầu tải dữ liệu nên mất vài giây, trước đây nút im lặng nên tưởng là hỏng).
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Đang đăng nhập...";
  try {
    const res = await Auth.login(u, p);
    if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
    Auth.setRememberedUser(u.trim(), $("#loginRemember").checked);
    err.hidden = true;
    enterApp();
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
});
// Nút con mắt: hiện / ẩn mật khẩu đã gõ. Icon nét đơn giản như ảnh Sếp gửi.
const EYE_OPEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><line x1="4" y1="4" x2="20" y2="20"/></svg>';
$("#togglePass").addEventListener("click", () => {
  const input = $("#loginPass");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#togglePass").innerHTML = show ? EYE_OFF : EYE_OPEN;
  $("#togglePass").setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  input.focus();
});
function enterApp() {
  $("#loginScreen").hidden = true;
  $("#app").hidden = false;
  $("#currentUserLabel").textContent = Auth.me().name;
  applyPermissions();
  showView("dashboard");
  checkExpiry();
}
$("#logoutBtn").addEventListener("click", () => { Auth.logout(); location.reload(); });
function applyPermissions() {
  const map = { dashboard: "dashboard", products: "products", orders: "orders", customers: "customers", employees: "employees", cashbook: "cashbook", print: "print", pos: "pos" };
  $$(".nav-tab, .bn-tab").forEach((b) => {
    const v = b.dataset.view;
    if (v === "more") return;
    if (map[v] && !Auth.can(map[v])) b.style.display = "none"; else b.style.display = "";
  });
}

/* ---------- Điều hướng ---------- */
function showView(name) {
  if (name === "more") { openMoreMenu(); return; }
  const permMap = { dashboard: "dashboard", products: "products", orders: "orders", customers: "customers", employees: "employees", cashbook: "cashbook", print: "print", pos: "pos" };
  if (permMap[name] && !Auth.can(permMap[name])) { alert("Tài khoản này không có quyền xem mục này."); return; }
  currentView = name;
  $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
  $$(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".bn-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  ({ dashboard: renderDashboard, products: renderProducts, orders: renderOrders, customers: renderCustomers, employees: renderEmployees, cashbook: renderCashbook, print: renderPrintSettings, pos: renderPOS }[name] || (() => {}))();
  window.scrollTo({ top: 0 });
}
$("#topnav").addEventListener("click", (e) => { const b = e.target.closest(".nav-tab"); if (b) showView(b.dataset.view); });
$("#bottomnav").addEventListener("click", (e) => { const b = e.target.closest(".bn-tab"); if (b) showView(b.dataset.view); });
$("#posBtn").addEventListener("click", () => showView("pos"));
function openMoreMenu() {
  const items = [["employees", "👥 Nhân viên"], ["cashbook", "💰 Sổ quỹ"], ["print", "🖨️ In ấn"]];
  const card = openModal(`<h3>Mục khác</h3><div style="display:grid;gap:8px;margin-top:12px">
    ${items.filter(([v]) => Auth.can(v)).map(([v, l]) => `<button class="btn btn-outline" data-go="${v}" type="button" style="text-align:left">${l}</button>`).join("")}
    <button class="btn btn-outline" id="moreLogout" type="button" style="text-align:left"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAGFklEQVR4nO2dyYscVRjAf73M9ERlNFESxXgQTEJEk2iMJ8UoahYVIcnFKAgu8aIg3vwPBD148KB4EcUluAdUFEFQVGJwNA4ZXCIGIy6ghMmMzjjT3eXhex9V09bM9Db1vap5Pyi6U1tev9/b66ukFEXRMDANlAhkSQQMVZHMnzFOzLKlTCj5lpTK1ilY7gQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxgQBxlStE9BHkr+liQQ+RUZpaZsiCain7Cu7LWrZvKEIAkpIJj8ErAO+AI4Cx4FJpDYkqbhrIuKaYkYpiqIa8K9lInqgAjSAPcDrLcd+AcaAL4EjwChwgvSaogWxyf+FLSW1vNeAMiJgrfucAQYRMWvddrM7dwb4CRFxBBEzBvzGXClaOzLBJwFamjtBM2rWXT/gvs8CQy3nDgIb3LbP7TsN/AB8jUj5HPiGDCX4JKDTzE+iAcZV4DPgbuAKYCtwFXApcFHKdcPunK3AvUim3wm8THcFomN8EFBCSucTwHVIG5w2PymRHskdAauQzNJMO+G2N905ZwKXAJuBbcCVSE04N3GfKWAFsBsRkEnUuLUAzbBrgAd7vJe24zoqqhCPdP5GRkZHgefdeecBG4EtwD3A5e78TN+VsBagnIWIqCO1odfS12z51NqjNasB/Al84rYLEBF6bmb4IkCbjzLwB/Cw27dQZ9h019SBXcB9C9xfJ2DJIaY2fQ3gjO6T3hu+CEiW1NPAwQ6vPwe4v8NrIuJal+XYfw6+CEhSAWrEtaK15CoRkv460snmEl8ERC3fG0ima8daJl1CKXFuLvFlOVpLep24L2gCVwM73HdfCktfsRagJf9XpDRXgb+Qmexm4B3gXeAmRE7hJFgLaCIZP4LMQJ8C7kLa9PeQsXoTOISs6RROgrUAiGvBS8iS8nfAP8AjxH3AIPA2BZTggwClgmSspukV4A7i/qCQErIWUEYyLm0rJc4pI6uZrwH7E8dVwg5EwkCGaV8SshagQ8t2tml3zUHgRuAUMuSsAW8BO5EFNJ9qccdkVY21GTkAbEdGOe1mXAWYQASsQuSohD3IKCm3zVHWArYj7Xq3RIiQJtL8HAKuB8Z7TJ8ZWVfffq00RkjaJ5AH75U+3TdzsqoBulTwBvAz0pa3K7+KlPB9wCak+RpAmqRdwFfAtf1MbJZkLeBVt3XKTmReoJk/jmT+YURkWqRDLsi689KYnHYYQEY5+4EXiSdsE8hjw8PIUHU69eqckLWAhR5yqxytLVPAXuAF4qiHKeBW5MG7LkXnGp/G0K0PR/YiD8f1ydc0cBvwMQXJfPBDgDZJB4DnkFXQIeBJ4pnuDHA78BEFynywn8BoVMQ24Bm3bwsSNrIb+AA4H2l2PqRgmQ/2ApQ1xHGZw0i6RoFbEAHvU8DMB38E6LxAYz01OGvEHc/1UHMhfBFQavmuM1vtA+abuGn6fejLusIXAUkaxOHyi5V6PT65dMlZWnwRoCU4As5Ggqz0ceV8YSl6XQO4wZ3XzVrTfDGnmeCLAB0N1YHVwLNd3GOxp2Slli1KfM528ff1BV8EjCMS+rWqqf2I1iwdYbWGOTaQCOnVzBWSGdYCNP7zU+Ax4vD05HtcaWigrQZmrWFu/H9aqa4hb8xsAC5z20bgYmAlMtnrZyFoC2sBEGfWoz3c4wHg6cSfVwLrkQzehLygsQ64EBGRhu4/1UM6OsYHAYo+6eoEnZxpqa0j0XTfIzFF7TKJPKcYAR4nrllLjk8CuvnBGnZeddfPIiV5vnDzJhL+fhw4hrwPdgz4EXlZL/MYU58EdIP2ESeRWrAicWzC7f8WyehR9/2kO5aG1sLMOuK8vycMc1/UXo+8hjSGlPLfSc/M5Gzb8i36WhEELEZyROXbP1eQ+xe1kyR/S3L2nEln2i1FEpDL1dLcriIWhSDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAmCDAGP3/VQI2RFXisGyz13SWKREw9B8vn2BSHyT9WQAAAABJRU5ErkJggg==" class="logout-icon logout-icon-dark" alt=""> Đăng xuất</button></div>`);
  $$("[data-go]", card).forEach((b) => (b.onclick = () => { closeModal(); showView(b.dataset.go); }));
  $("#moreLogout", card).onclick = () => { Auth.logout(); location.reload(); };
}

/* ---------- Khoảng thời gian ---------- */
function periodRange(kind, customDate) {
  const now = new Date();
  const start = new Date(now), end = new Date(now);
  if (kind === "today") { /* mặc định hôm nay */ }
  else if (kind === "week") { const dow = (now.getDay() + 6) % 7; start.setDate(now.getDate() - dow); }
  else if (kind === "month") { start.setDate(1); }
  else if (kind === "custom" && customDate) { start.setTime(new Date(customDate).getTime()); end.setTime(new Date(customDate).getTime()); }
  return { from: dstr(start), to: dstr(end) };
}
function inRange(dateISO, from, to) { return dateISO >= from && dateISO <= to; }

/* ---------- DASHBOARD ---------- */
function orderStats(order) {
  let revenue = 0, cogs = 0;
  const db = DB.get();
  for (const it of order.items) {
    const p = db.products.find((x) => x.id === it.productId);
    revenue += it.price * it.qty - (it.discount || 0);
    cogs += (p ? p.costPrice : it.price * 0.8) * it.qty;
  }
  revenue = revenue - (order.discountValue || 0) + (order.shipping || 0);
  return { revenue, cogs, profit: revenue - cogs };
}
function renderDashboard() {
  const db = DB.get();
  const kind = $("#periodSelect").value;
  const custom = $("#periodDate").value;
  const { from, to } = periodRange(kind, custom);
  const orders = db.orders.filter((o) => inRange(o.date, from, to));
  const done = orders.filter((o) => o.status === "completed");
  const ret = orders.filter((o) => o.status !== "completed");
  let revenue = 0, profit = 0, returns = 0;
  for (const o of done) { const s = orderStats(o); revenue += s.revenue; profit += s.profit; }
  for (const o of ret) { const s = orderStats(o); returns += s.revenue; }
  $("#statRevenue").textContent = fmt(revenue) + "đ";
  $("#statRevenueSub").textContent = done.length + " hóa đơn · " + (kind === "today" ? "hôm nay" : `${dLabel(from)} → ${dLabel(to)}`);
  $("#statReturns").textContent = fmt(returns) + "đ";
  $("#statReturnsSub").textContent = ret.length + " đơn hủy / trả";
  const staff = isStaffUser();
  $("#statProfit").textContent = staff ? "*****" : fmt(profit) + "đ";
  $("#statProfitSub").textContent = staff ? "Chỉ quản trị viên mới xem được" : "Doanh thu − giá vốn";
  $("#statOrders").textContent = orders.length;
  $("#statOrdersSub").textContent = done.length + " hoàn thành · " + ret.length + " hủy/trả";

  // Biểu đồ doanh thu từng ngày trong tháng
  const [y, m] = (kind === "custom" && custom ? custom : todayStr()).split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  $("#revMonthLabel").textContent = `Tháng ${m}/${y}`;
  const byDay = {};
  for (const o of db.orders) {
    if (o.status !== "completed" || !o.date.startsWith(`${y}-${String(m).padStart(2, "0")}`)) continue;
    byDay[o.date] = (byDay[o.date] || 0) + orderStats(o).revenue;
  }
  const max = Math.max(1, ...Object.values(byDay));
  let html = "";
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const v = byDay[key] || 0;
    html += `<div class="bar-col"><span class="bar-val">${v ? (v >= 1e6 ? (v / 1e6).toFixed(1) + "tr" : Math.round(v / 1000) + "k") : ""}</span>
      <div class="bar" style="height:${Math.max(2, (v / max) * 130)}px"></div><span class="bar-lab">${d}</span></div>`;
  }
  $("#revChart").innerHTML = html;

  // Top 10 sản phẩm
  const prodAgg = {};
  for (const o of done) for (const it of o.items) {
    prodAgg[it.name] = (prodAgg[it.name] || 0) + it.price * it.qty - (it.discount || 0);
  }
  const topP = Object.entries(prodAgg).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxP = Math.max(1, ...(topP.map((x) => x[1])));
  $("#topProducts").innerHTML = topP.length ? topP.map(([n, v]) =>
    `<div class="rank-row"><span>${esc(n)}</span><b>${fmt(v)}đ</b><div class="rank-bar"><i style="width:${(v / maxP) * 100}%"></i></div></div>`).join("")
    : `<p class="muted">Chưa có dữ liệu bán hàng trong kỳ.</p>`;

  // Top 10 khách hàng
  const custAgg = {};
  for (const o of done) {
    const name = o.customerName || "Khách lẻ";
    custAgg[name] = (custAgg[name] || 0) + orderStats(o).revenue;
  }
  const topC = Object.entries(custAgg).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxC = Math.max(1, ...(topC.map((x) => x[1])));
  $("#topCustomers").innerHTML = topC.length ? topC.map(([n, v]) =>
    `<div class="rank-row"><span>${esc(n)}</span><b>${fmt(v)}đ</b><div class="rank-bar"><i style="width:${(v / maxC) * 100}%"></i></div></div>`).join("")
    : `<p class="muted">Chưa có dữ liệu bán hàng trong kỳ.</p>`;

  // Hoạt động gần đây
  $("#activityFeed").innerHTML = db.activity.slice(0, 12).map((a) =>
    `<div class="activity-item"><span class="ico">${a.icon}</span><div><div>${esc(a.text)}</div>
    <div class="time">${new Date(a.time).toLocaleString("vi-VN")}</div></div>
    ${a.amount != null ? `<span class="amt">${fmt(a.amount)}đ</span>` : ""}</div>`).join("")
    || `<p class="muted">Chưa có hoạt động nào.</p>`;
}
$("#periodSelect").addEventListener("change", (e) => {
  $("#periodDate").hidden = e.target.value !== "custom";
  if (e.target.value !== "custom") renderDashboard();
});
$("#periodDate").addEventListener("change", () => renderDashboard());

/* ---------- Cảnh báo hạn sử dụng ---------- */
function expiringProducts() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return DB.get().products.filter((p) => {
    if (!p.expiryDate || (p.stock || 0) <= 0) return false;
    const days = Math.round((new Date(p.expiryDate) - now) / 86400000);
    return days <= 30;
  }).map((p) => ({ ...p, daysLeft: Math.round((new Date(p.expiryDate) - now) / 86400000) }));
}
function checkExpiry() {
  const list = expiringProducts();
  const bell = $("#expiryCount");
  bell.hidden = !list.length; bell.textContent = list.length;
  const box = $("#expiryAlert");
  if (list.length) {
    box.hidden = false;
    box.innerHTML = `⚠️ <b>${list.length} mặt hàng sắp hết hạn sử dụng (còn ≤ 30 ngày):</b> ` +
      list.map((p) => `${esc(p.name)} — còn ${p.daysLeft} ngày (tồn ${p.stock} ${esc(p.unit)})`).join("; ") +
      `. Vui lòng thanh lý trước hạn.`;
  } else box.hidden = true;
}
$("#expiryBell").addEventListener("click", () => { showView("products"); });

/* ---------- HÀNG HÓA ---------- */
let productSel = new Set();
function filteredProducts() {
  const db = DB.get();
  const q = $("#productSearch").value.trim().toLowerCase();
  const cat = $("#productCategoryFilter").value;
  return db.products.filter((p) =>
    (!cat || p.categoryId === cat) &&
    (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
}
function renderProducts() {
  const db = DB.get();
  const sel = $("#productCategoryFilter");
  const cur = sel.value;
  sel.innerHTML = `<option value="">Tất cả nhóm hàng</option>` + db.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  sel.value = cur;
  const list = filteredProducts();
  $("#productCount").textContent = `${list.length} mặt hàng · Tổng tồn: ${fmt(list.reduce((s, p) => s + p.stock * p.costPrice, 0))}đ (theo giá vốn)`;
  const exp = expiringProducts();
  $("#productTable").innerHTML = list.map((p) => {
    const cat = db.categories.find((c) => c.id === p.categoryId);
    const isExp = exp.find((e) => e.id === p.id);
    return `<tr>
      <td class="cb"><input type="checkbox" class="row-check" data-id="${p.id}" ${productSel.has(p.id) ? "checked" : ""}></td>
      <td>${esc(p.code)}</td>
      <td><div style="display:flex;gap:8px;align-items:center"><span class="thumb">${p.image ? `<img src="${p.image}" alt="">` : "🖼️"}</span>
        <span><span class="pname">${esc(p.name)}</span><br><span class="psub">${esc(p.unit)}${p.units.length ? " · +" + p.units.map((u) => u.name).join(", ") : ""}</span></span></div></td>
      <td>${esc(cat ? cat.name : "")}</td>
      <td class="num">${fmt(p.price)}</td><td class="num">${fmt(p.costPrice)}</td>
      <td class="num">${p.stock} ${esc(p.unit)}</td>
      <td>${p.expiryDate ? `<span class="badge ${isExp ? "badge-amber" : "badge-green"}">${dLabel(p.expiryDate)}${isExp ? " · còn " + isExp.daysLeft + " ngày" : ""}</span>` : `<span class="muted">—</span>`}</td>
      <td style="white-space:nowrap">
        <button class="link-btn" data-act="stockin" data-id="${p.id}" type="button">Nhập hàng</button>
        <button class="link-btn" data-act="edit" data-id="${p.id}" type="button">Sửa</button>
        <button class="link-btn" data-act="del" data-id="${p.id}" type="button" style="color:var(--red)">Xóa</button>
      </td></tr>`;
  }).join("") || `<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">Chưa có hàng hóa nào khớp tìm kiếm.</td></tr>`;
  updateBulkBar("products", productSel, "mặt hàng");
}
function updateBulkBar(kind, set, label) {
  const bar = $("#bulkBar" + kind[0].toUpperCase() + kind.slice(1));
  const txt = $("#bulk" + kind[0].toUpperCase() + kind.slice(1) + "Text");
  if (!bar) return;
  bar.hidden = set.size === 0;
  if (txt) txt.textContent = `Đã chọn ${set.size} ${label}`;
}
$("#productSearch").addEventListener("input", () => renderProducts());
$("#productCategoryFilter").addEventListener("change", () => renderProducts());
$("#productTable").addEventListener("click", async (e) => {
  const cb = e.target.closest(".row-check");
  if (cb) { cb.checked ? productSel.add(cb.dataset.id) : productSel.delete(cb.dataset.id); updateBulkBar("products", productSel, "mặt hàng"); return; }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const p = DB.get().products.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  if (btn.dataset.act === "edit") openProductForm(p);
  if (btn.dataset.act === "stockin") openStockIn(p);
  if (btn.dataset.act === "del") {
    if (await confirmBox("Xóa hàng hóa", `Xóa "${p.name}" khỏi cửa hàng?`)) {
      await DB.remove("products", p.id); productSel.delete(p.id); renderProducts();
    }
  }
});
$("#checkAllProducts").addEventListener("change", (e) => {
  productSel = new Set(e.target.checked ? filteredProducts().map((p) => p.id) : []);
  renderProducts();
});
$("#bulkDeleteProducts").addEventListener("click", async () => {
  if (!productSel.size) return;
  if (await confirmBox("Xóa hàng hóa", `Xóa ${productSel.size} mặt hàng đã chọn?`)) {
    for (const id of [...productSel]) await DB.remove("products", id);
    productSel.clear(); renderProducts();
  }
});

function productFormHTML(p) {
  const db = DB.get();
  return `<h3>${p ? "Sửa hàng hóa" : "Tạo hàng hóa mới"}</h3>
  <form id="productForm">
    <div class="form-row">
      <label>Mã hàng<input name="code" type="text" value="${esc(p?.code || "")}" placeholder="Để trống để tự sinh"></label>
      <label>Nhóm hàng
        <span style="display:flex;gap:6px"><select name="categoryId" style="flex:1">${db.categories.map((c) => `<option value="${c.id}" ${p?.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
        <button type="button" class="btn btn-outline" id="addCategoryBtn" title="Thêm nhóm mới">+</button></span>
      </label>
    </div>
    <div id="pfDupWarn"></div>
    <label>Tên hàng<input name="name" type="text" required value="${esc(p?.name || "")}"></label>
    <label>Ảnh hàng hóa
      <span class="file-row"><input type="file" id="productImageInput" accept="image/*" hidden>
      <button type="button" class="btn btn-outline" id="productImageBtn">Chọn ảnh</button>
      <span id="productImageName" class="muted">${p?.image ? "Đã có ảnh" : "Chưa có ảnh"}</span></span>
      <input type="hidden" name="image" value="">
    </label>
    <div class="form-row">
      <label>Giá vốn<input name="costPrice" type="number" min="0" required value="${p?.costPrice ?? ""}"></label>
      <label>Giá bán<input name="price" type="number" min="0" required value="${p?.price ?? ""}"></label>
    </div>
    <div class="form-row">
      <label>Đơn vị tính cơ bản<input name="unit" type="text" required value="${esc(p?.unit || "Cái")}"></label>
      <label>Tồn kho hiện tại<input name="stock" type="number" min="0" step="0.01" value="${p?.stock ?? 0}"></label>
    </div>
    <div class="units-box">
      <label style="font-weight:700">Đơn vị tính phụ</label>
      <p class="muted" style="margin:2px 0 8px">VD: Thùng = 20 Kg, giá tự nhân theo giá bán (30.000đ × 20 = 600.000đ). Đơn vị sau số lượng tự lấy theo Đơn vị tính cơ bản.</p>
      <div class="unit-row unit-head"><span>Tên gọi</span><span>Số lượng</span><span>Số tiền</span><span></span></div>
      <div id="pfUnits"></div>
      <button type="button" class="btn btn-outline btn-sm" id="pfAddUnit">＋ Thêm đơn vị phụ</button>
    </div>
    <div class="lots-box">
      <label style="font-weight:700">Lô hàng &amp; hạn sử dụng</label>
      <p class="muted" style="margin:2px 0 8px">Mỗi lần nhập hàng thêm 1 lô (mã lô, hạn sử dụng, số lượng). Tồn kho = tổng số lượng các lô. Khi bán, app trừ lô sắp hết hạn trước.</p>
      <table class="tbl" style="min-width:0"><thead><tr><th>Mã lô</th><th>Hạn sử dụng</th><th class="num">Số lượng</th><th></th></tr></thead>
      <tbody id="pfLots"></tbody></table>
      <div class="form-row" style="margin-top:8px">
        <label>Mã lô mới<input id="pfLotCode" type="text" placeholder="VD: Lô 26/12"></label>
        <label>HSD<input id="pfLotExp" type="date"></label>
        <label>Số lượng<input id="pfLotQty" type="number" min="0" step="0.01"></label>
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="pfAddLot">＋ Thêm lô</button>
      <p class="muted" id="pfLotTotal" style="margin:8px 0 0"></p>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" id="pfCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu hàng hóa</button>
    </div>
  </form>`;
}
function openProductForm(p) {
  const card = openModal(productFormHTML(p), true);
  let imageData = p?.image || "";
  let formLots = (p?.lots || []).map((l) => ({ ...l }));
  const unitVal = () => (card.querySelector('[name="unit"]')?.value || "Cái");
  function drawLots() {
    $("#pfLots", card).innerHTML = formLots.map((l, i) => `<tr><td>${esc(l.code)}</td><td>${l.expiryDate ? dLabel(l.expiryDate) : "—"}</td><td class="num">${l.qty}</td><td><button type="button" class="btn btn-ghost btn-sm" data-lotrm="${i}" style="color:var(--red)">✕</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Chưa có lô nào — hàng không theo dõi hạn sử dụng.</td></tr>`;
    const total = formLots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
    $("#pfLotTotal", card).textContent = `Tồn kho = tổng các lô: ${total} ${unitVal()}`;
    const stockInput = card.querySelector('[name="stock"]');
    stockInput.disabled = formLots.length > 0;
    if (formLots.length) stockInput.value = total;
  }
  drawLots();
  // --- Đơn vị tính phụ: 3 ô Tên gọi / Số lượng / Số tiền (tiền tự nhân) ---
  let formUnits = (p?.units || []).map((u) => ({ ...u }));
  const basePrice = () => moneyInput(card.querySelector('[name="price"]')?.value);
  function drawUnits() {
    const baseUnit = unitVal();
    $("#pfUnits", card).innerHTML = formUnits.map((u, i) => `<div class="unit-row">
      <input type="text" class="pu-name" data-i="${i}" placeholder="Tên gọi (VD: Thùng)" value="${esc(u.name)}">
      <span class="unit-qty-wrap"><input type="number" class="pu-factor" data-i="${i}" min="0" step="0.01" placeholder="Số lượng" value="${u.factor ?? ""}"><span class="unit-label">${esc(baseUnit)}</span></span>
      <input type="text" class="pu-price" data-i="${i}" readonly value="${fmt(Math.round((basePrice() || 0) * (parseFloat(u.factor) || 0)))}">
      <button type="button" class="btn btn-ghost btn-sm" data-unitrm="${i}" style="color:var(--red)">✕</button>
    </div>`).join("") || `<p class="muted">Chưa có đơn vị phụ.</p>`;
  }
  function syncUnitPrices() {
    // Giá đơn vị phụ = giá bán × số lượng (tự nhân).
    formUnits.forEach((u, i) => {
      const price = Math.round((basePrice() || 0) * (parseFloat(u.factor) || 0));
      u.price = price;
      const inp = card.querySelector(`.pu-price[data-i="${i}"]`);
      if (inp) inp.value = fmt(price);
    });
  }
  drawUnits();
  $("#pfUnits", card).addEventListener("input", (e) => {
    const nm = e.target.closest(".pu-name");
    if (nm) { formUnits[+nm.dataset.i].name = nm.value; return; }
    const fc = e.target.closest(".pu-factor");
    if (fc) {
      const u = formUnits[+fc.dataset.i];
      u.factor = parseFloat(fc.value) || 0;
      const price = Math.round((basePrice() || 0) * u.factor);
      u.price = price;
      const inp = card.querySelector(`.pu-price[data-i="${fc.dataset.i}"]`);
      if (inp) inp.value = fmt(price);
    }
  });
  $("#pfUnits", card).addEventListener("click", (e) => {
    const b = e.target.closest("[data-unitrm]");
    if (!b) return;
    formUnits.splice(+b.dataset.unitrm, 1);
    drawUnits();
  });
  $("#pfAddUnit", card).onclick = () => { formUnits.push({ name: "", factor: 0, price: 0 }); drawUnits(); };
  card.querySelector('[name="price"]').addEventListener("input", syncUnitPrices);
  $("#pfLots", card).addEventListener("click", (e) => {
    const b = e.target.closest("[data-lotrm]");
    if (!b) return;
    formLots.splice(+b.dataset.lotrm, 1);
    drawLots();
  });
  $("#pfAddLot", card).onclick = () => {
    const code = $("#pfLotCode", card).value.trim();
    const exp = $("#pfLotExp", card).value || null;
    const qty = parseFloat($("#pfLotQty", card).value) || 0;
    if (!code) { alert("Nhập mã lô (VD: Lô 26/12)."); return; }
    if (qty <= 0) { alert("Nhập số lượng lô lớn hơn 0."); return; }
    formLots.push({ id: DB.uid("lo"), code, expiryDate: exp, qty });
    $("#pfLotCode", card).value = ""; $("#pfLotExp", card).value = ""; $("#pfLotQty", card).value = "";
    drawLots();
  };
  card.querySelector('[name="unit"]').addEventListener("input", () => { drawLots(); drawUnits(); });
  // Cảnh báo trùng mã hàng / mã vạch ngay khi gõ xong (quét mã vạch cũng vậy).
  const codeInput = card.querySelector('[name="code"]');
  const showCodeDup = () => {
    const dup = findProductByCode(DB.get(), codeInput.value, p?.id);
    $("#pfDupWarn", card).innerHTML = dup ? `<div class="alert alert-warn">Mã <b>${esc(codeInput.value.trim())}</b> đã có mặt hàng: <b>${esc(dup.name)}</b> — giá bán ${fmt(dup.price)}đ, tồn ${dup.stock} ${esc(dup.unit)}.<br>Quét mã vạch trùng sẽ hiện mặt hàng đã lưu, không tạo trùng.</div>
    <div style="margin-top:8px"><button type="button" class="btn btn-outline" id="pfOpenDup">Mở mặt hàng này</button></div>` : "";
    const b = $("#pfOpenDup", card);
    if (b) b.onclick = () => { closeModal(); openProductForm(dup); };
  };
  codeInput.addEventListener("change", showCodeDup);
  $("#productImageBtn", card).onclick = () => $("#productImageInput", card).click();
  $("#productImageInput", card).onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { imageData = r.result; $("#productImageName", card).textContent = f.name; };
    r.readAsDataURL(f);
  };
  $("#addCategoryBtn", card).onclick = async () => {
    const name = prompt("Tên nhóm hàng mới:");
    if (!name || !name.trim()) return;
    const cat = { id: DB.uid("cat"), name: name.trim() };
    await DB.put("categories", cat);
    const sel = card.querySelector('[name="categoryId"]');
    sel.innerHTML += `<option value="${cat.id}" selected>${esc(cat.name)}</option>`;
    sel.value = cat.id;
  };
  $("#pfCancel", card).onclick = () => closeModal();
  $("#productForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const baseP = moneyInput(fd.get("price"));
    const units = formUnits.filter((u) => (u.name || "").trim()).map((u) => ({
      name: u.name.trim(),
      factor: parseFloat(u.factor) || 1,
      // Số tiền đơn vị phụ tự nhân theo giá bán × số lượng.
      price: Math.round(baseP * (parseFloat(u.factor) || 0)),
    }));
    const db = DB.get();
    let code = (fd.get("code") || "").trim();
    if (!code) {
      // Tự sinh mã chưa từng dùng (tránh trùng khi đã xóa hàng trước đó).
      let n = db.products.length + 1;
      do { code = "SP" + String(n).padStart(6, "0"); n++; } while (db.products.some((x) => x.code === code));
    }
    const dup = findProductByCode(db, code, p?.id);
    if (dup) { showCodeDup(); alert("Mã hàng này đã tồn tại. Mở mặt hàng đã lưu để sửa thay vì tạo mới."); return; }
    const lots = formLots.map((l) => ({ ...l }));
    const stock = lots.length ? lots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0) : (parseFloat(fd.get("stock")) || 0);
    const exps = lots.filter((l) => (parseFloat(l.qty) || 0) > 0 && l.expiryDate).map((l) => l.expiryDate).sort();
    const item = {
      id: p?.id || DB.uid("sp"),
      code,
      name: fd.get("name").trim(),
      categoryId: fd.get("categoryId"),
      image: imageData,
      costPrice: moneyInput(fd.get("costPrice")),
      price: moneyInput(fd.get("price")),
      unit: fd.get("unit").trim(),
      units,
      lots,
      stock,
      expiryDate: exps.length ? exps[0] : null,
    };
    await DB.put("products", item);
    closeModal(); renderProducts();
  };
}
$("#addProductBtn").addEventListener("click", () => openProductForm(null));

function openStockIn(p) {
  const card = openModal(`<h3>Nhập hàng — ${esc(p.name)}</h3>
    <form id="stockInForm">
      <label>Số lượng nhập (${esc(p.unit)})<input name="qty" type="number" min="0.01" step="0.01" required></label>
      <label>Giá nhập mỗi ${esc(p.unit)}<input name="cost" type="number" min="0" value="${p.costPrice}"></label>
      <label>Ghi chú<input name="note" type="text" placeholder="VD: Nhập từ nhà cung cấp…"></label>
      <p class="muted">Nhập hàng sẽ tăng tồn kho và ghi 1 phiếu chi mua hàng vào Sổ quỹ.</p>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="siCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Nhập kho</button></div>
    </form>`);
  $("#siCancel", card).onclick = () => closeModal();
  $("#stockInForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qty = parseFloat(fd.get("qty")), cost = moneyInput(fd.get("cost"));
    p.stock = (p.stock || 0) + qty;
    await DB.put("products", p);
    const entry = { id: DB.uid("pc"), code: "PC" + Date.now().toString().slice(-6), date: todayStr(), time: new Date().toISOString(), type: "out", category: "Mua hàng", amount: qty * cost, person: "Nhà cung cấp", note: `Nhập ${qty} ${p.unit} ${p.name}${fd.get("note") ? " — " + fd.get("note") : ""}` };
    await DB.put("cashEntries", entry);
    await DB.put("stockIns", { id: DB.uid("si"), productId: p.id, name: p.name, qty, cost, date: todayStr(), time: new Date().toISOString(), note: fd.get("note") || "" });
    DB.logActivity(`Nhập kho ${qty} ${p.unit} ${p.name}`, qty * cost, "📥");
    closeModal(); renderProducts();
  };
}

/* ---------- Import / Xuất file hàng hóa ---------- */
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function xlsxAvailable() { return typeof XLSX !== "undefined"; }

// Chuẩn hóa tên cột để đối chiếu: bỏ dấu, viết thường, bỏ ký tự lạ.
function normHeader(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findCol(headers, candidates) {
  const normed = headers.map(normHeader);
  for (const c of candidates) {
    const i = normed.indexOf(normHeader(c));
    if (i >= 0) return i;
  }
  // Tiêu đề có thêm chú thích trong ngoặc, VD "Hạn sử dụng (yyyy-mm-dd)".
  for (const c of candidates) {
    const nc = normHeader(c);
    if (nc.length < 4) continue;
    const i = normed.findIndex((h) => h.startsWith(nc));
    if (i >= 0) return i;
  }
  return -1;
}
// Đọc CSV kể cả ô chứa dấu phẩy trong dấu ngoặc kép.
function parseCsvText(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// Xuất toàn bộ hàng hóa hiện tại ra Excel (cũng là file mẫu để nhập lại).
function productExportRows() {
  const db = DB.get();
  const head = ["Mã hàng", "Tên hàng hóa", "Đơn vị tính", "Nhóm hàng", "Link ảnh sản phẩm", "Giá bán", "Giá vốn", "Tồn kho", "Hạn sử dụng"];
  const catName = (id) => (db.categories.find((c) => c.id === id) || {}).name || "";
  const rows = db.products.map((p) => [p.code, p.name, p.unit, catName(p.categoryId), p.image || "", p.price || 0, p.costPrice || 0, p.stock || 0, p.expiryDate || ""]);
  return [head, ...rows];
}
function downloadProductsExcel() {
  const rows = productExportRows();
  const stamp = todayStr();
  if (xlsxAvailable()) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "HangHoa");
    XLSX.writeFile(wb, `hang-hoa-${stamp}.xlsx`);
  } else {
    downloadBlob(new Blob(["﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }), `hang-hoa-${stamp}.csv`);
  }
}
$("#templateProductsBtn").addEventListener("click", downloadProductsExcel);

// Cửa sổ Import file: chọn file, tải file hàng hóa hiện tại, xem kết quả.
function openImportModal() {
  openModal(`<h3>⬆ Nhập hàng hóa từ Excel</h3>
    <p class="muted">Chọn file Excel (.xlsx) hoặc CSV có các cột: <b>Mã hàng, Tên hàng hóa, Đơn vị tính, Nhóm hàng, Link ảnh sản phẩm, Giá bán, Giá vốn, Tồn kho, Hạn sử dụng</b> (thứ tự cột tùy ý, không cần đúng thứ tự). Mặt hàng trùng <b>Mã hàng</b> sẽ được cập nhật thông tin thay vì tạo mới.</p>
    <input type="file" id="impFile" accept=".xlsx,.xls,.csv" style="display:none">
    <div class="modal-actions" style="justify-content:flex-start">
      <button id="impPickBtn" class="btn btn-primary" type="button">📂 Chọn file để nhập</button>
      <button id="impExportBtn" class="btn btn-outline" type="button">⬇ File excel mẫu</button>
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Đóng</button>
    </div>
    <div id="impResult" class="muted" style="margin-top:12px"></div>`);
  $("#impPickBtn").addEventListener("click", () => $("#impFile").click());
  $("#impExportBtn").addEventListener("click", downloadProductsExcel);
  $("#impFile").addEventListener("change", handleProductImport);
}
$("#importProductsBtn").addEventListener("click", openImportModal);

async function handleProductImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const res = $("#impResult");
  const fail = (msg) => { if (res) res.innerHTML = `<span style="color:var(--red)">${esc(msg)}</span>`; e.target.value = ""; };
  let rows = [];
  try {
    if (/\.xlsx?$/i.test(f.name)) {
      if (!xlsxAvailable()) { fail("Không tải được thư viện đọc file Excel. Kiểm tra mạng rồi thử lại."); return; }
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    } else {
      rows = parseCsvText(await f.text());
    }
  } catch (err) { fail("Không đọc được file. Hãy dùng file Excel theo mẫu của KOMATI."); return; }
  if (!rows.length) { fail("File trống, không có dữ liệu."); return; }
  const headers = rows[0].map((h) => String(h ?? ""));
  // Đọc theo TÊN cột nên file có thứ tự cột nào cũng nhập đúng.
  const col = {
    code: findCol(headers, ["Mã hàng", "Mã"]),
    name: findCol(headers, ["Tên hàng hóa", "Tên hàng", "Tên"]),
    unit: findCol(headers, ["Đơn vị tính", "Đơn vị"]),
    cat: findCol(headers, ["Nhóm hàng", "Nhóm"]),
    image: findCol(headers, ["Link ảnh sản phẩm", "Link ảnh", "Ảnh", "Hình ảnh"]),
    price: findCol(headers, ["Giá bán"]),
    cost: findCol(headers, ["Giá vốn"]),
    stock: findCol(headers, ["Tồn kho", "Tồn"]),
    expiry: findCol(headers, ["Hạn sử dụng"]),
  };
  if (col.name < 0) { fail("Không tìm thấy cột Tên hàng hóa trong file. Kiểm tra lại tiêu đề cột."); return; }
  const db = DB.get();
  let added = 0, updated = 0, skipped = 0, autoN = db.products.length + 1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const val = (idx) => idx >= 0 ? String(r[idx] ?? "").trim() : "";
    const name = val(col.name);
    if (!name) { skipped++; continue; }
    const code = val(col.code) || ("SP" + String(autoN++).padStart(6, "0"));
    const catName = val(col.cat) || "Chưa phân loại";
    let cat = db.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (!cat) { cat = { id: DB.uid("cat"), name: catName }; await DB.put("categories", cat); }
    const unit = val(col.unit) || "Cái";
    const price = moneyInput(col.price >= 0 ? r[col.price] : 0);
    const cost = moneyInput(col.cost >= 0 ? r[col.cost] : 0);
    const stock = moneyInput(col.stock >= 0 ? r[col.stock] : 0);
    const expiry = val(col.expiry) || null;
    const image = val(col.image);
    const existing = db.products.find((p) => p.code.toLowerCase() === code.toLowerCase());
    if (existing) {
      existing.name = name; existing.unit = unit; existing.categoryId = cat.id;
      existing.price = price; existing.costPrice = cost; existing.image = image;
      existing.expiryDate = expiry;
      // Chỉ cập nhật tồn kho khi mặt hàng chưa quản lý theo lô (lô quản lý tồn riêng).
      if (!(existing.lots && existing.lots.length)) existing.stock = stock;
      await DB.put("products", existing);
      updated++;
    } else {
      await DB.put("products", {
        id: DB.uid("sp"), code, name, categoryId: cat.id,
        costPrice: cost, price, unit, units: [], stock,
        expiryDate: expiry, image,
      });
      added++;
    }
  }
  e.target.value = "";
  if (res) res.innerHTML = `Đã nhập xong: <b>${added} mặt hàng mới</b>, <b>${updated} mặt hàng cập nhật</b>${skipped ? `, ${skipped} dòng bỏ qua (thiếu tên hàng)` : ""}.`;
  renderProducts();
}

/* ---------- Quản lý Nhóm hàng ---------- */
function openCategoryModal() {
  const db = DB.get();
  const count = (id) => db.products.filter((p) => p.categoryId === id).length;
  openModal(`<h3>🗂 Nhóm hàng</h3>
    <p class="muted">Thêm, đổi tên hoặc xóa nhóm hàng. Nhóm đang có hàng hóa thì không xóa được.</p>
    <div class="toolbar" style="margin-top:10px">
      <input id="catNewName" type="text" placeholder="Tên nhóm hàng mới…" autocomplete="off" style="flex:1">
      <button id="catAddBtn" class="btn btn-primary" type="button">+ Thêm nhóm</button>
    </div>
    <div id="catList">${db.categories.map((c) => `<div class="rank-row"><span>${esc(c.name)} <span class="muted">(${count(c.id)} mặt hàng)</span></span><span style="white-space:nowrap">
      <button class="link-btn" data-act="rename" data-id="${c.id}" type="button">Đổi tên</button>
      <button class="link-btn" data-act="del" data-id="${c.id}" type="button" style="color:var(--red)">Xóa</button></span></div>`).join("") || `<p class="muted">Chưa có nhóm hàng nào.</p>`}</div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeModal()">Đóng</button></div>`);
  $("#catAddBtn").addEventListener("click", async () => {
    const name = $("#catNewName").value.trim();
    if (!name) { alert("Nhập tên nhóm hàng."); return; }
    if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) { alert(`Nhóm "${name}" đã có rồi.`); return; }
    await DB.put("categories", { id: DB.uid("cat"), name });
    closeModal(); openCategoryModal(); renderProducts();
  });
  $("#catList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const c = db.categories.find((x) => x.id === btn.dataset.id); if (!c) return;
    if (btn.dataset.act === "rename") {
      const name = prompt("Tên nhóm hàng mới:", c.name);
      if (name === null) return;
      const nn = name.trim();
      if (!nn) { alert("Tên nhóm không được để trống."); return; }
      if (db.categories.some((x) => x.id !== c.id && x.name.toLowerCase() === nn.toLowerCase())) { alert(`Nhóm "${nn}" đã có rồi.`); return; }
      c.name = nn; await DB.put("categories", c);
      closeModal(); openCategoryModal(); renderProducts();
    }
    if (btn.dataset.act === "del") {
      const n = count(c.id);
      if (n > 0) { alert(`Nhóm "${c.name}" đang có ${n} mặt hàng, không xóa được. Chuyển các mặt hàng sang nhóm khác trước.`); return; }
      if (await confirmBox("Xóa nhóm hàng", `Xóa nhóm "${c.name}"?`)) {
        await DB.remove("categories", c.id);
        closeModal(); openCategoryModal(); renderProducts();
      }
    }
  });
}
$("#categoryManageBtn").addEventListener("click", openCategoryModal);

/* ---------- ĐƠN HÀNG ---------- */
let orderSel = new Set();
function renderOrders() {
  const db = DB.get();
  const kind = $("#orderPeriodSelect").value;
  const custom = $("#orderPeriodDate").value;
  const { from, to } = periodRange(kind, custom);
  const list = db.orders.filter((o) => inRange(o.date, from, to)).sort((a, b) => b.time.localeCompare(a.time));
  const staff = isStaffUser();
  $("#checkAllOrders").style.display = staff ? "none" : "";
  $("#orderTable").innerHTML = list.map((o) => {
    const s = orderStats(o);
    const badge = o.status === "completed" ? `<span class="badge badge-green">Hoàn thành</span>`
      : o.status === "returned" ? `<span class="badge badge-amber">Đã trả hàng</span>` : `<span class="badge badge-red">Đã hủy</span>`;
    return `<tr>
      <td class="cb">${staff ? "" : `<input type="checkbox" class="row-check" data-id="${o.id}" ${orderSel.has(o.id) ? "checked" : ""}>`}</td>
      <td><b>${esc(o.code)}</b></td>
      <td>${dLabel(o.date)} ${new Date(o.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${esc(o.customerName || "Khách lẻ")}</td>
      <td class="num">${fmt(s.revenue)}đ</td>
      <td>${o.payment === "cash" ? "Tiền mặt" : o.payment === "transfer" ? "Chuyển khoản" : "Ghi nợ"}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap"><button class="link-btn" data-act="view" data-id="${o.id}" type="button">Xem</button>
      ${o.status === "completed" && !staff ? `<button class="link-btn" data-act="return" data-id="${o.id}" type="button" style="color:var(--amber)">Hủy/Trả hàng</button>` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Chưa có hóa đơn nào trong kỳ.</td></tr>`;
  updateBulkBar("orders", orderSel, "hóa đơn");
}
$("#orderPeriodSelect").addEventListener("change", (e) => {
  $("#orderPeriodDate").hidden = e.target.value !== "custom";
  if (e.target.value !== "custom") renderOrders();
});
$("#orderPeriodDate").addEventListener("change", () => renderOrders());
$("#orderTable").addEventListener("click", async (e) => {
  const cb = e.target.closest(".row-check");
  if (cb) { cb.checked ? orderSel.add(cb.dataset.id) : orderSel.delete(cb.dataset.id); updateBulkBar("orders", orderSel, "hóa đơn"); return; }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const o = DB.get().orders.find((x) => x.id === btn.dataset.id);
  if (!o) return;
  if (btn.dataset.act === "view") openOrderDetail(o);
  if (btn.dataset.act === "return") {
    if (await confirmBox("Hủy / Trả hàng", `Hủy hóa đơn ${o.code} và trả lại hàng vào kho? Số tiền đã thu sẽ được hoàn lại.`)) {
      await returnOrder(o); renderOrders();
    }
  }
});
$("#checkAllOrders").addEventListener("change", (e) => {
  const kind = $("#orderPeriodSelect").value;
  const { from, to } = periodRange(kind, $("#orderPeriodDate").value);
  orderSel = new Set(e.target.checked ? DB.get().orders.filter((o) => inRange(o.date, from, to)).map((o) => o.id) : []);
  renderOrders();
});
$("#bulkDeleteOrders").addEventListener("click", async () => {
  if (!orderSel.size) return;
  if (await confirmBox("Xóa hóa đơn", `Xóa ${orderSel.size} hóa đơn đã chọn? Hàng của hóa đơn đã hoàn thành sẽ được trả lại kho, tiền đã thu sẽ được hoàn lại.`)) {
    for (const id of [...orderSel]) {
      const o = DB.get().orders.find((x) => x.id === id);
      if (o && o.status === "completed") await reverseOrderEffects(o);
      await DB.remove("orders", id);
    }
    orderSel.clear(); renderOrders();
  }
});
function openOrderDetail(o) {
  const db = DB.get();
  const s = orderStats(o);
  const staff = isStaffUser();
  const card = openModal(`<h3>Hóa đơn ${esc(o.code)}</h3>
    <p class="muted">${dLabel(o.date)} · ${esc(o.customerName || "Khách lẻ")} · ${o.payment === "cash" ? "Tiền mặt" : o.payment === "transfer" ? "Chuyển khoản" : "Ghi nợ"} · ${o.status === "completed" ? "Hoàn thành" : o.status === "returned" ? "Đã trả hàng" : "Đã hủy"}</p>
    <table class="tbl" style="min-width:0"><thead><tr><th>Sản phẩm</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
    <tbody>${o.items.map((it) => `<tr><td>${esc(it.name)}${it.discount ? `<br><span class="psub">Giảm ${fmt(it.discount)}đ</span>` : ""}</td><td class="num">${it.qty} ${esc(it.unit)}</td><td class="num">${fmt(it.price)}</td><td class="num">${fmt(it.price * it.qty - (it.discount || 0))}</td></tr>`).join("")}</tbody></table>
    <div class="pos-summary" style="margin-top:12px">
      <div class="row"><span>Giảm giá hóa đơn</span><span>−${fmt(o.discountValue || 0)}đ</span></div>
      <div class="row"><span>Thu khác (ship)</span><span>${fmt(o.shipping || 0)}đ</span></div>
      <div class="row total"><span>Tổng tiền</span><span>${fmt(s.revenue)}đ</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="odClose" type="button">Đóng</button>
      <button class="btn btn-outline" id="odPrint" type="button">🖨️ In lại</button>
      ${o.status === "completed" && !staff ? `<button class="btn btn-danger" id="odReturn" type="button">Hủy / Trả hàng</button>` : ""}
    </div>`, true);
  $("#odClose", card).onclick = () => closeModal();
  $("#odPrint", card).onclick = () => { printOrder(o); };
  const retBtn = $("#odReturn", card);
  if (retBtn) retBtn.onclick = async () => {
    if (await confirmBox("Hủy / Trả hàng", `Hủy hóa đơn ${o.code} và trả lại hàng vào kho?`)) {
      await returnOrder(o); closeModal(); renderOrders();
    }
  };
}
/* Hoàn tác ảnh hưởng của 1 đơn đã hoàn thành: trả kho + hoàn tiền/nợ. */
async function reverseOrderEffects(o) {
  const db = DB.get();
  for (const it of o.items) {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) { p.stock = (p.stock || 0) + it.qty; await DB.put("products", p); }
  }
  const s = orderStats(o);
  if (o.payment === "cash" || o.payment === "transfer") {
    await DB.put("cashEntries", { id: DB.uid("pc"), code: "PC" + Date.now().toString().slice(-6), date: todayStr(), time: new Date().toISOString(), type: "out", category: "Hoàn tiền trả hàng", amount: s.revenue, person: o.customerName || "Khách lẻ", note: `Hoàn tiền hóa đơn ${o.code}`, orderId: o.id });
  } else if (o.payment === "debt" && o.customerId) {
    const c = db.customers.find((x) => x.id === o.customerId);
    if (c) { c.debt = Math.max(0, (c.debt || 0) - s.revenue); await DB.put("customers", c); }
  }
}
async function returnOrder(o) {
  await reverseOrderEffects(o);
  o.status = "returned";
  await DB.put("orders", o);
  DB.logActivity(`Trả hàng hóa đơn ${o.code}`, orderStats(o).revenue, "↩️");
}

/* ---------- KHÁCH HÀNG & CÔNG NỢ ---------- */
let customerSel = new Set();
function renderCustomers() {
  const db = DB.get();
  const q = $("#customerSearch").value.trim().toLowerCase();
  const list = db.customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.address || "").toLowerCase().includes(q));
  const totalDebt = db.customers.reduce((s, c) => s + (c.debt || 0), 0);
  $("#totalDebt").textContent = fmt(totalDebt) + "đ";
  $("#totalDebtSub").textContent = "tổng số tiền khách còn nợ cửa hàng";
  $("#debtCustomerCount").textContent = db.customers.filter((c) => (c.debt || 0) > 0).length;
  $("#customerTable").innerHTML = list.map((c) => `<tr>
    <td class="cb"><input type="checkbox" class="row-check" data-id="${c.id}" ${customerSel.has(c.id) ? "checked" : ""}></td>
    <td>${esc(c.code)}</td>
    <td><span class="pname">${esc(c.name)}</span><br><span class="psub">${esc(c.address || "")}</span></td>
    <td>${esc(c.phone || "—")}</td>
    <td class="num" style="color:${(c.debt || 0) > 0 ? "var(--red)" : "inherit"};font-weight:700">${fmt(c.debt || 0)}</td>
    <td class="num">${fmt(c.totalBought || 0)}</td>
    <td style="white-space:nowrap">
      <button class="link-btn" data-act="pay" data-id="${c.id}" type="button">Trả nợ</button>
      <button class="link-btn" data-act="edit" data-id="${c.id}" type="button">Sửa</button>
      <button class="link-btn" data-act="del" data-id="${c.id}" type="button" style="color:var(--red)">Xóa</button>
    </td></tr>`).join("") || `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Chưa có khách hàng nào.</td></tr>`;
  updateBulkBar("customers", customerSel, "khách hàng");
}
$("#customerSearch").addEventListener("input", () => renderCustomers());
$("#customerTable").addEventListener("click", async (e) => {
  const cb = e.target.closest(".row-check");
  if (cb) { cb.checked ? customerSel.add(cb.dataset.id) : customerSel.delete(cb.dataset.id); updateBulkBar("customers", customerSel, "khách hàng"); return; }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const c = DB.get().customers.find((x) => x.id === btn.dataset.id);
  if (!c) return;
  if (btn.dataset.act === "edit") openCustomerForm(c);
  if (btn.dataset.act === "pay") openDebtPayment(c);
  if (btn.dataset.act === "del") {
    if ((c.debt || 0) > 0 && !(await confirmBox("Khách còn nợ", `${c.name} đang nợ ${fmt(c.debt)}đ. Xóa khách sẽ mất luôn khoản nợ này. Vẫn xóa?`))) return;
    if ((c.debt || 0) <= 0 && !(await confirmBox("Xóa khách hàng", `Xóa "${c.name}"?`))) return;
    await DB.remove("customers", c.id); customerSel.delete(c.id); renderCustomers();
  }
});
$("#checkAllCustomers").addEventListener("change", (e) => {
  const q = $("#customerSearch").value.trim().toLowerCase();
  customerSel = new Set(e.target.checked ? DB.get().customers.filter((c) => !q || c.name.toLowerCase().includes(q)).map((c) => c.id) : []);
  renderCustomers();
});
$("#bulkDeleteCustomers").addEventListener("click", async () => {
  if (!customerSel.size) return;
  if (await confirmBox("Xóa khách hàng", `Xóa ${customerSel.size} khách hàng đã chọn? Các khoản nợ của họ cũng sẽ bị xóa theo.`)) {
    for (const id of [...customerSel]) await DB.remove("customers", id);
    customerSel.clear(); renderCustomers();
  }
});
function openCustomerForm(c) {
  const card = openModal(`<h3>${c ? "Sửa khách hàng" : "Thêm khách hàng mới"}</h3>
    <form id="customerForm">
      <label>Tên khách hàng<input name="name" type="text" required value="${esc(c?.name || "")}"></label>
      <div class="form-row">
        <label>Số điện thoại<input name="phone" type="tel" value="${esc(c?.phone || "")}"></label>
        <label>Mã khách hàng<input name="code" type="text" value="${esc(c?.code || "")}" placeholder="Để trống để tự sinh"></label>
      </div>
      <label>Địa chỉ<input name="address" type="text" value="${esc(c?.address || "")}"></label>
      <label>Ghi chú<textarea name="note" rows="2">${esc(c?.note || "")}</textarea></label>
      <div id="cuDupWarn"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="cuCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu khách hàng</button></div>
    </form>`);
  $("#cuCancel", card).onclick = () => closeModal();
  // Cảnh báo trùng SĐT với khách đã lưu — hiện khách cũ ra để khỏi tạo trùng.
  const phoneInput = card.querySelector('[name="phone"]');
  const showPhoneDup = () => {
    const dup = findCustomerByPhone(DB.get(), phoneInput.value);
    const other = dup && dup.id !== c?.id ? dup : null;
    $("#cuDupWarn", card).innerHTML = other ? `<div class="alert alert-warn">SĐT này đã có khách hàng: <b>${esc(other.name)}</b>${other.phone ? " — " + esc(other.phone) : ""}${(other.debt || 0) > 0 ? ` · đang nợ ${fmt(other.debt)}đ` : ""}.<br>Mở khách đã lưu thay vì tạo mới.</div>
    <div style="margin-top:8px"><button type="button" class="btn btn-outline" id="cuOpenDup">Mở khách này</button></div>` : "";
    const b = $("#cuOpenDup", card);
    if (b) b.onclick = () => { closeModal(); openCustomerForm(other); };
  };
  phoneInput.addEventListener("change", showPhoneDup);
  $("#customerForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const db = DB.get();
    const dup = findCustomerByPhone(db, fd.get("phone"));
    if (dup && dup.id !== c?.id) { showPhoneDup(); alert("Số điện thoại này đã có khách hàng. Mở khách đã lưu để sửa thay vì tạo mới."); return; }
    const item = {
      id: c?.id || DB.uid("kh"),
      code: (fd.get("code") || "").trim() || ("KH" + String(1000000 + db.customers.length + 1)),
      name: fd.get("name").trim(), phone: fd.get("phone").trim(),
      address: fd.get("address").trim(), note: fd.get("note").trim(),
      debt: c?.debt || 0, totalBought: c?.totalBought || 0,
    };
    await DB.put("customers", item);
    closeModal(); renderCustomers();
  };
}
$("#addCustomerBtn").addEventListener("click", () => openCustomerForm(null));
function openDebtPayment(c) {
  const card = openModal(`<h3>Phiếu thu trả nợ — ${esc(c.name)}</h3>
    <p class="muted">Công nợ hiện tại: <b style="color:var(--red)">${fmt(c.debt || 0)}đ</b></p>
    <form id="debtForm">
      <label>Số tiền khách trả<input name="amount" type="number" min="1" max="${c.debt || 0}" required value="${c.debt || 0}"></label>
      <label>Ngày trả<input name="date" type="date" value="${todayStr()}"></label>
      <label>Ghi chú<input name="note" type="text" placeholder="VD: Trả nợ tiền hàng tháng 11"></label>
      <p class="muted">Phiếu này sẽ đồng thời ghi vào Sổ quỹ (mục thu).</p>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="dbCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Tạo phiếu thu</button></div>
    </form>`);
  $("#dbCancel", card).onclick = () => closeModal();
  $("#debtForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = moneyInput(fd.get("amount"));
    if (amount <= 0 || amount > (c.debt || 0)) { alert("Số tiền trả không hợp lệ."); return; }
    c.debt = (c.debt || 0) - amount;
    await DB.put("customers", c);
    await DB.put("cashEntries", { id: DB.uid("pt"), code: "PT" + Date.now().toString().slice(-6), date: fd.get("date") || todayStr(), time: new Date().toISOString(), type: "in", category: "Thu tiền khách trả", amount, person: c.name, note: fd.get("note") || `Thu nợ ${c.code}`, customerId: c.id });
    DB.logActivity(`${c.name} trả nợ`, amount, "💵");
    closeModal(); renderCustomers();
  };
}
$("#importCustomersBtn").addEventListener("click", () => $("#customerFileInput").click());
$("#customerFileInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const db = DB.get();
  let rows = [];
  try {
    if (xlsxAvailable() && /\.xlsx?$/i.test(f.name)) {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    } else {
      const text = await f.text();
      rows = text.split(/\r?\n/).map((l) => l.split(",").map((s) => s.replace(/^"|"$/g, "").trim()));
    }
  } catch (err) { alert("Không đọc được file."); e.target.value = ""; return; }
  let added = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue;
    await DB.put("customers", { id: DB.uid("kh"), code: String(r[1] || "").trim() || ("KH" + String(1000000 + db.customers.length + 1)), name: String(r[0]).trim(), phone: String(r[2] || "").trim(), address: String(r[3] || "").trim(), note: "", debt: moneyInput(r[4]), totalBought: 0 });
    added++;
  }
  e.target.value = "";
  alert(`Đã tải lên ${added} khách hàng.`);
  renderCustomers();
});

/* ---------- NHÂN VIÊN ---------- */
function renderEmployees() {
  const db = DB.get();
  $("#employeeTable").innerHTML = db.employees.map((e) => `<tr>
    <td><b>${esc(e.username)}</b></td><td>${esc(e.name)}</td><td>${esc(e.role)}</td>
    <td>${(e.permissions || []).map((k) => { const p = Auth.PERMISSIONS.find((x) => x.key === k); return p ? `<span class="badge badge-blue">${esc(p.label)}</span>` : ""; }).join(" ") || `<span class="muted">—</span>`}</td>
    <td style="white-space:nowrap">
      <button class="link-btn" data-act="edit" data-id="${e.id}" type="button">Sửa</button>
      <button class="link-btn" data-act="pass" data-id="${e.id}" type="button">Đổi mật khẩu</button>
      ${e.username !== "admin" ? `<button class="link-btn" data-act="del" data-id="${e.id}" type="button" style="color:var(--red)">Xóa</button>` : ""}
    </td></tr>`).join("");
}
$("#employeeTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const emp = DB.get().employees.find((x) => x.id === btn.dataset.id);
  if (!emp) return;
  if (btn.dataset.act === "edit") openEmployeeForm(emp);
  if (btn.dataset.act === "pass") openChangePassword(emp);
  if (btn.dataset.act === "del") {
    if (await confirmBox("Xóa nhân viên", `Xóa nhân viên "${emp.name}" (${emp.username})?`)) {
      await DB.remove("employees", emp.id); renderEmployees();
    }
  }
});
function openEmployeeForm(emp) {
  const perms = emp?.permissions || [];
  // Ô mật khẩu có icon con mắt giống màn hình đăng nhập.
  const pwField = (required) => `<label>Mật khẩu
    <span class="password-wrap">
      <input name="password" type="password" ${required ? "required" : ""} minlength="6" autocomplete="new-password" ${emp ? 'placeholder="Để trống nếu không đổi"' : ""}>
      <button class="eye-btn" type="button" data-eye title="Hiện / ẩn mật khẩu" aria-label="Hiện mật khẩu">${EYE_OPEN}</button>
    </span>
  </label>`;
  const card = openModal(`<h3>${emp ? "Sửa nhân viên" : "Thêm nhân viên mới"}</h3>
    <form id="employeeForm">
      <div class="form-row">
        <label>Tên nhân viên<input name="name" type="text" required value="${esc(emp?.name || "")}"></label>
        <label>Tên đăng nhập<input name="username" type="text" required value="${esc(emp?.username || "")}" ${emp ? "disabled" : ""} autocomplete="off"></label>
      </div>
      ${emp ? `<div class="form-row">
        <label>Vai trò
          <select name="role" id="empRole">
            ${Object.keys(Auth.ROLE_PRESETS).map((r) => `<option ${emp?.role === r ? "selected" : ""}>${r}</option>`).join("")}
          </select>
        </label>
        ${pwField(false)}
      </div>` : `${pwField(true)}
      <label>Vai trò
        <select name="role" id="empRole">
          ${Object.keys(Auth.ROLE_PRESETS).map((r) => `<option ${emp?.role === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </label>`}
      <p style="font-weight:600;margin:14px 0 4px">Quyền cho nhân viên</p>
      <div class="perm-grid">
        ${Auth.PERMISSIONS.map((p) => `<label><input type="checkbox" name="perm" value="${p.key}" ${perms.includes(p.key) ? "checked" : ""}> ${esc(p.label)}</label>`).join("")}
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="emCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu nhân viên</button></div>
    </form>`, true);
  // Nút con mắt trong cửa sổ nhân viên (giống màn hình đăng nhập).
  $$("[data-eye]", card).forEach((btn) => (btn.onclick = () => {
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? EYE_OFF : EYE_OPEN;
    btn.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    input.focus();
  }));
  $("#empRole", card).onchange = (e) => {
    const preset = Auth.ROLE_PRESETS[e.target.value] || [];
    $$('input[name="perm"]', card).forEach((cb) => (cb.checked = preset.includes(cb.value)));
  };
  $("#emCancel", card).onclick = () => closeModal();
  $("#employeeForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const permissions = $$('input[name="perm"]:checked', card).map((cb) => cb.value);
    if (emp) {
      emp.name = fd.get("name").trim();
      emp.role = fd.get("role");
      emp.permissions = permissions;
      await DB.put("employees", emp);
      // Sửa nhân viên: nếu có nhập mật khẩu mới thì đổi luôn (để trống = không đổi).
      const pw = (fd.get("password") || "").trim();
      if (pw) {
        const res = await Auth.setPassword(emp, pw);
        if (!res.ok) alert(res.message || "Không đổi được mật khẩu. Thử lại sau.");
        else alert(res.created ? "Đã tạo tài khoản đăng nhập cho nhân viên này. Nhân viên đăng nhập được bằng mật khẩu mới." : "Đã đổi mật khẩu.");
      }
    } else {
      const username = fd.get("username").trim();
      if (DB.get().employees.find((x) => x.username === username)) { alert("Tên đăng nhập này đã có người dùng."); return; }
      const item = { id: DB.uid("emp"), username, name: fd.get("name").trim(), role: fd.get("role"), permissions, phone: "", note: "" };
      await DB.put("employees", item);
      // Chế độ Firebase: tạo luôn tài khoản đăng nhập (username@komati.local)
      // để nhân viên đăng nhập được; chế độ demo thì lưu mật khẩu đã băm.
      if (DB.isFirebase()) {
        const acc = await Auth.createLoginAccount(username, fd.get("password"));
        if (!acc.ok) alert(`Đã lưu hồ sơ nhân viên "${username}" nhưng chưa tạo được tài khoản đăng nhập (${acc.message || "lỗi không rõ"}). Nhân viên chưa đăng nhập được — mở "Đổi mật khẩu" của nhân viên này để tạo lại.`);
      } else {
        await Auth.setPassword(item, fd.get("password"));
      }
    }
    closeModal(); renderEmployees();
  };
}
$("#addEmployeeBtn").addEventListener("click", () => openEmployeeForm(null));
function openChangePassword(emp) {
  const card = openModal(`<h3>Đổi mật khẩu — ${esc(emp.name)}</h3>
    <form id="passForm">
      <label>Mật khẩu mới<input name="p1" type="password" required minlength="6" autocomplete="new-password"></label>
      <label>Nhập lại mật khẩu mới<input name="p2" type="password" required minlength="6" autocomplete="new-password"></label>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="pwCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Đổi mật khẩu</button></div>
    </form>`);
  $("#pwCancel", card).onclick = () => closeModal();
  $("#passForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("p1") !== fd.get("p2")) { alert("Hai mật khẩu nhập chưa khớp."); return; }
    const res = await Auth.setPassword(emp, fd.get("p1"));
    if (!res.ok) { alert(res.message || "Không đổi được mật khẩu. Thử lại sau."); return; }
    closeModal();
    alert(res.created ? "Đã tạo tài khoản đăng nhập cho nhân viên này. Nhân viên đăng nhập được bằng mật khẩu mới." : "Đã đổi mật khẩu.");
  };
}

/* ---------- SỔ QUỸ ---------- */
function renderCashbook() {
  const db = DB.get();
  const date = $("#cashDate").value || todayStr();
  $("#cashDate").value = date;
  const entries = db.cashEntries.filter((x) => x.date === date);
  const opening = entries.filter((x) => x.category === "Quỹ đầu ngày").reduce((s, x) => s + x.amount, 0);
  const cashSales = db.orders.filter((o) => o.date === date && o.status === "completed" && o.payment === "cash").reduce((s, o) => s + orderStats(o).revenue, 0);
  // Phiếu "Bán hàng" tiền mặt đã được tính trong cashSales nên loại khỏi tổng phiếu thu để khỏi tính 2 lần.
  // Phiếu "Bán hàng ghi nợ" cũng vậy: đơn ghi nợ đã được tính trong nonCashOrders.
  const entriesInExSales = entries.filter((x) => x.type === "in" && x.category !== "Bán hàng" && x.category !== "Bán hàng ghi nợ");
  const nonCashOrders = db.orders.filter((o) => o.date === date && o.status === "completed" && o.payment !== "cash").reduce((s, o) => s + orderStats(o).revenue, 0);
  const totalIn = cashSales + entriesInExSales.reduce((s, x) => s + x.amount, 0) + nonCashOrders;
  const totalOut = entries.filter((x) => x.type === "out").reduce((s, x) => s + x.amount, 0);
  const cashOnHand = opening + cashSales + entriesInExSales.reduce((s, x) => s + x.amount, 0) - totalOut;
  $("#cashOpening").textContent = fmt(opening) + "đ";
  $("#cashOpeningDate").textContent = dLabel(date);
  $("#cashIn").textContent = fmt(totalIn) + "đ";
  $("#cashOut").textContent = fmt(totalOut) + "đ";
  $("#cashOnHand").textContent = fmt(cashOnHand) + "đ";
  $("#cashTable").innerHTML = entries.sort((a, b) => (b.time || "").localeCompare(a.time || "")).map((x) => `<tr>
    <td><b>${esc(x.code)}</b></td>
    <td>${dLabel(x.date)} ${x.time ? new Date(x.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
    <td>${esc(x.category)}</td>
    <td>${esc(x.person || "—")}</td>
    <td class="num" style="color:${x.type === "in" ? "var(--green)" : "var(--red)"};font-weight:700">${x.type === "in" ? "+" : "−"}${fmt(x.amount)}</td>
    <td><button class="link-btn" data-del="${x.id}" type="button" style="color:var(--red)">Xóa</button></td></tr>`).join("")
    || `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Chưa có phiếu thu / chi trong ngày này.</td></tr>`;
}
$("#cashDate").addEventListener("change", () => renderCashbook());
$("#cashTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  if (await confirmBox("Xóa phiếu", "Xóa phiếu thu / chi này? Số liệu công nợ khách hàng (nếu có) không tự đổi lại.")) {
    await DB.remove("cashEntries", btn.dataset.del);
    renderCashbook();
  }
});
function openCashVoucher(type) {
  const db = DB.get();
  let cvCustomerId = null;
  const card = openModal(`<h3>${type === "in" ? "Phiếu thu" : "Phiếu chi"}</h3>
    <form id="cashForm">
      <label>Số tiền<input name="amount" type="number" min="1" required></label>
      <label>${type === "in" ? "Loại thu" : "Loại chi"}
        <select name="category" id="cvCategory">
          ${type === "in"
    ? `<option>Khách trả nợ</option><option>Thu khác</option>`
    : `<option>Mua vật dụng</option><option>Giao ca</option><option>Chi khác</option>`}
        </select>
      </label>
      ${type === "in" ? `<div id="cvCustRow">
        <label>Khách hàng (nếu là thu nợ)</label>
        <div class="pos-cust">
          <input id="cvCustSearch" type="text" placeholder="🔍 Tìm khách hàng (tên, SĐT, địa chỉ)…" autocomplete="off">
          <div id="cvCustResults" class="pos-cust-results" hidden></div>
        </div>
        <div id="cvCustPicked"></div>
      </div>` : ""}
      <label>Người nộp / nhận<input name="person" type="text"></label>
      <label>Ngày<input name="date" type="date" value="${todayStr()}"></label>
      <label>Ghi chú<input name="note" type="text"></label>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="cvCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Tạo phiếu</button></div>
    </form>`);
  // Phiếu thu: tìm khách hàng theo tên / SĐT / mã / địa chỉ (như ô tìm khách ở POS),
  // chỉ hiện khi loại thu là "Khách trả nợ".
  if (type === "in") {
    const search = $("#cvCustSearch", card), box = $("#cvCustResults", card);
    const renderPicked = () => {
      const picked = $("#cvCustPicked", card);
      const c = cvCustomerId ? DB.get().customers.find((x) => x.id === cvCustomerId) : null;
      picked.innerHTML = c ? `<div class="pos-cust-picked"><span>${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}${(c.debt || 0) > 0 ? `<span class="debt">(nợ ${fmt(c.debt)}đ)</span>` : ""}</span><button type="button" id="cvCustClear" class="link-btn">✕</button></div>` : "";
      const clr = $("#cvCustClear", card);
      if (clr) clr.onclick = () => { cvCustomerId = null; renderPicked(); };
    };
    const syncRow = () => {
      const show = $("#cvCategory", card).value === "Khách trả nợ";
      $("#cvCustRow", card).hidden = !show;
      if (!show) { cvCustomerId = null; renderPicked(); }
    };
    $("#cvCategory", card).addEventListener("change", syncRow);
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { box.hidden = true; box.innerHTML = ""; return; }
      const list = DB.get().customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.code || "").toLowerCase().includes(q) || (c.address || "").toLowerCase().includes(q)).slice(0, 6);
      box.innerHTML = list.map((c) => `<button type="button" data-cid="${c.id}">${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}${(c.debt || 0) > 0 ? ` <span style="color:var(--red)">(nợ ${fmt(c.debt)}đ)</span>` : ""}${c.address ? `<br><span class="muted" style="font-size:12.5px">${esc(c.address)}</span>` : ""}</button>`).join("")
        || `<button type="button" disabled>Không tìm thấy khách hàng</button>`;
      box.hidden = false;
      $$("[data-cid]", box).forEach((b) => (b.onclick = () => { cvCustomerId = b.dataset.cid; box.hidden = true; search.value = ""; renderPicked(); }));
    });
    card.addEventListener("click", (e) => { if (!e.target.closest(".pos-cust")) box.hidden = true; });
    syncRow();
  }
  $("#cvCancel", card).onclick = () => closeModal();
  $("#cashForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = moneyInput(fd.get("amount"));
    const customerId = type === "in" ? cvCustomerId : null;
    const category = fd.get("category");
    await DB.put("cashEntries", { id: DB.uid(type === "in" ? "pt" : "pc"), code: (type === "in" ? "PT" : "PC") + Date.now().toString().slice(-6), date: fd.get("date") || todayStr(), time: new Date().toISOString(), type, category, amount, person: fd.get("person").trim(), note: fd.get("note").trim(), customerId });
    if (type === "in" && customerId && category === "Khách trả nợ") {
      const c = DB.get().customers.find((x) => x.id === customerId);
      if (c) { c.debt = Math.max(0, (c.debt || 0) - amount); await DB.put("customers", c); }
    }
    closeModal(); renderCashbook();
  };
}
$("#addReceiptBtn").addEventListener("click", () => openCashVoucher("in"));
$("#addPaymentBtn").addEventListener("click", () => openCashVoucher("out"));

/* ---------- IN ẤN ---------- */
function renderPrintSettings() {
  const s = DB.get().settings;
  $("#setStoreName").value = s.storeName || "";
  $("#setStoreAddress").value = s.storeAddress || "";
  $("#setStorePhone").value = s.storePhone || "";
  $("#setReceiptFooter").value = s.receiptFooter || "";
  $("#setReceiptFontSize").value = String(s.receiptFontSize || 12);
  $("#setShowLogo").checked = !!s.showLogo;
  $("#setShowAddress").checked = !!s.showAddress;
  const prev = $("#storeLogoPreview");
  if (s.logo) { prev.src = s.logo; prev.hidden = false; } else prev.hidden = true;
  renderReceiptPreview();
}
let pendingLogo = null;
$("#uploadLogoBtn").addEventListener("click", () => $("#setStoreLogo").click());
$("#setStoreLogo").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { pendingLogo = r.result; const p = $("#storeLogoPreview"); p.src = pendingLogo; p.hidden = false; renderReceiptPreview(); };
  r.readAsDataURL(f);
});
function sampleOrderForPreview() {
  return {
    code: "HD000001", date: todayStr(), time: new Date().toISOString(), customerName: "Khách lẻ",
    items: [
      { productId: "x", name: "Quả Anh Đào (Cherry) Đỏ Royal Lynn ÚC", unit: "Kg", qty: 2, price: 775000, discount: 0 },
      { productId: "y", name: "Quả quýt tươi đóng 2kg/hộp", unit: "Hộp", qty: 1, price: 180000, discount: 10000 },
    ],
    discountValue: 20000, shipping: 15000, payment: "cash", status: "completed",
  };
}
function buildReceiptHTML(o) {
  const s = DB.get().settings;
  const st = orderStats(o);
  const fs = s.receiptFontSize || 12;
  return `<div class="receipt" style="font-size:${fs}px">
    ${s.showLogo && s.logo ? `<div class="c"><img src="${s.logo}" style="max-width:48mm;max-height:20mm" alt=""></div>` : ""}
    <h4>${esc(s.storeName || "KOMATI")}</h4>
    ${s.showAddress ? `<div class="c">${esc(s.storeAddress || "")}<br>ĐT: ${esc(s.storePhone || "")}</div>` : ""}
    <hr>
    <div class="c"><b>HÓA ĐƠN BÁN HÀNG</b><br>${esc(o.code)} — ${dLabel(o.date)} ${new Date(o.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>
    <div>Khách hàng: ${esc(o.customerName || "Khách lẻ")}</div>
    <hr>
    <table><thead><tr><th>Mặt hàng</th><th>SL</th><th>Giá</th><th>TT</th></tr></thead>
    <tbody>${o.items.map((it) => `<tr><td>${esc(it.name)}${it.discount ? `<br><small>Giảm ${fmt(it.discount)}đ</small>` : ""}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.price * it.qty - (it.discount || 0))}</td></tr>`).join("")}</tbody></table>
    <hr>
    <div class="r"><span>Giảm giá HĐ</span><span>−${fmt(o.discountValue || 0)}</span></div>
    <div class="r"><span>Thu khác (ship)</span><span>${fmt(o.shipping || 0)}</span></div>
    <div class="r" style="font-weight:700;font-size:1.15em"><span>TỔNG TIỀN</span><span>${fmt(st.revenue)}đ</span></div>
    <div class="r"><span>Thanh toán</span><span>${o.payment === "cash" ? "Tiền mặt" : o.payment === "transfer" ? "Chuyển khoản" : "Ghi nợ"}</span></div>
    <hr>
    <div class="c">${esc(s.receiptFooter || "")}</div>
  </div>`;
}
function renderReceiptPreview() {
  const s = DB.get().settings;
  if (pendingLogo) s.logo = pendingLogo;
  s.receiptFontSize = parseInt($("#setReceiptFontSize").value) || 12;
  s.showLogo = $("#setShowLogo").checked;
  s.showAddress = $("#setShowAddress").checked;
  $("#receiptPreview").innerHTML = buildReceiptHTML(sampleOrderForPreview());
}
["setReceiptFontSize", "setShowLogo", "setShowAddress"].forEach((id) => $("#" + id).addEventListener("change", renderReceiptPreview));
$("#savePrintSettings").addEventListener("click", async () => {
  const s = DB.get().settings;
  s.storeName = $("#setStoreName").value.trim();
  s.storeAddress = $("#setStoreAddress").value.trim();
  s.storePhone = $("#setStorePhone").value.trim();
  s.receiptFooter = $("#setReceiptFooter").value.trim();
  s.receiptFontSize = parseInt($("#setReceiptFontSize").value) || 12;
  s.showLogo = $("#setShowLogo").checked;
  s.showAddress = $("#setShowAddress").checked;
  if (pendingLogo) { s.logo = pendingLogo; pendingLogo = null; }
  await DB.put("settings", s);
  renderReceiptPreview();
  alert("Đã lưu cài đặt in.");
});
$("#printTestBtn").addEventListener("click", () => printOrder(sampleOrderForPreview()));
function printOrder(o) {
  const el = $("#receiptPrint");
  el.innerHTML = buildReceiptHTML(o);
  el.hidden = false;
  setTimeout(() => { window.print(); setTimeout(() => { el.hidden = true; }, 500); }, 100);
}

boot();

/* ---------- KIỂM KHO (theo từng lô hàng) ---------- */
function openStockCheck() {
  const db = DB.get();
  const history = (db.stockChecks || []).slice().sort((a, b) => (b.time || "").localeCompare(a.time || "")).slice(0, 5);
  const card = openModal(`<h3>📋 Kiểm kho</h3>
    <p class="muted">Chọn các mặt hàng còn tồn để kiểm. Nhập số lượng đếm thực tế — tồn kho sẽ được cập nhật theo số đếm. Hàng có hạn sử dụng được kiểm theo từng lô: chọn đúng lô cần kiểm (VD: Bánh trứng có 2 lô HSD 26/12/2026 và 26/10/2027 thì đếm riêng từng lô). Nút <b>Hết hàng</b> đưa số lượng lô đó về 0.</p>
    <div class="toolbar" style="margin-top:10px">
      <input id="scSearch" type="search" placeholder="Tìm theo mã, tên hàng, mã lô…" autocomplete="off">
      <select id="scCategoryFilter"><option value="">Tất cả nhóm hàng</option>${db.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <label class="check" style="margin:0"><input id="scOnlyStock" type="checkbox" checked> Chỉ hiện hàng còn tồn</label>
    </div>
    <label class="check"><input id="scCheckAll" type="checkbox"> Chọn tất cả mặt hàng đang hiện</label>
    <div style="max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table class="tbl" style="min-width:0"><thead><tr><th class="cb"></th><th>Sản phẩm / Lô hàng</th><th class="num">Tồn hệ thống</th><th class="num">Đếm thực tế</th><th class="num">Chênh lệch</th><th></th></tr></thead>
      <tbody id="scTable"></tbody></table>
    </div>
    <p id="scSummary" class="muted" style="margin:10px 0 0"></p>
    ${history.length ? `<h3 style="margin-top:16px">Lịch sử kiểm kho gần đây</h3>
    <div>${history.map((h) => `<div class="rank-row"><span>${new Date(h.time).toLocaleString("vi-VN")} — ${h.code}</span><b>${h.items.length} dòng kiểm · chênh lệch ${fmt(h.totalDiff)} </b></div>`).join("")}</div>` : ""}
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" id="scCancel">Hủy</button>
      <button type="button" class="btn btn-primary" id="scSave">Lưu kiểm kho</button>
    </div>`, "xl");

  // Tích chọn do admin tự quyết: lọc/tìm kiếm KHÔNG tự tích hàng loạt,
  // chỉ có ô "Chọn tất cả" mới tích hàng loạt các dòng đang hiện.
  const scSel = new Set(); // khóa "productId|lotId"
  let scCat = "";
  function lotRows(p) {
    const lots = p.lots || [];
    if (!lots.length) {
      return `<tr data-pid="${p.id}" data-lot="">
      <td class="cb"><input type="checkbox" class="sc-check" data-id="${p.id}" data-lot="" ${scSel.has(p.id + "|") ? "checked" : ""}></td>
      <td><span class="pname">${esc(p.name)}</span><br><span class="psub">${esc(p.code)} · ${esc(p.unit)}</span></td>
      <td class="num" data-sys="${p.stock}">${p.stock} ${esc(p.unit)}</td>
      <td class="num"><input type="number" class="mini-input sc-counted" data-id="${p.id}" data-lot="" min="0" step="0.01" value="${p.stock}" style="width:80px;text-align:right"></td>
      <td class="num sc-diff" data-id="${p.id}" data-lot="">0</td>
      <td><button type="button" class="btn btn-outline btn-sm sc-zero" data-id="${p.id}" data-lot="">Hết hàng</button></td>
    </tr>`;
    }
    const head = `<tr class="sc-prod" data-pid="${p.id}"><td></td><td colspan="5"><span class="pname">${esc(p.name)}</span> <span class="psub">${esc(p.code)} · ${esc(p.unit)} · tồn tổng ${p.stock}</span></td></tr>`;
    return head + lots.map((l) => `<tr class="sc-lot" data-pid="${p.id}" data-lot="${l.id}">
      <td class="cb"><input type="checkbox" class="sc-check" data-id="${p.id}" data-lot="${l.id}" ${scSel.has(p.id + "|" + l.id) ? "checked" : ""}></td>
      <td>↳ <b>${esc(l.code)}</b><br><span class="psub">HSD: ${l.expiryDate ? dLabel(l.expiryDate) : "không có"}</span></td>
      <td class="num" data-sys="${l.qty}">${l.qty} ${esc(p.unit)}</td>
      <td class="num"><input type="number" class="mini-input sc-counted" data-id="${p.id}" data-lot="${l.id}" min="0" step="0.01" value="${l.qty}" style="width:80px;text-align:right"></td>
      <td class="num sc-diff" data-id="${p.id}" data-lot="${l.id}">0</td>
      <td><button type="button" class="btn btn-outline btn-sm sc-zero" data-id="${p.id}" data-lot="${l.id}">Hết hàng</button></td>
    </tr>`).join("");
  }
  function drawRows() {
    const q = $("#scSearch", card).value.trim().toLowerCase();
    const onlyStock = $("#scOnlyStock", card).checked;
    const list = db.products.filter((p) =>
      (!scCat || p.categoryId === scCat) &&
      (!onlyStock || (p.stock || 0) > 0) &&
      (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
        (p.lots || []).some((l) => (l.code || "").toLowerCase().includes(q))));
    $("#scTable", card).innerHTML = list.map(lotRows).join("") || `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">Không có mặt hàng nào khớp.</td></tr>`;
    // Đồng bộ ô "Chọn tất cả": chỉ tích khi mọi dòng đang hiện đều đã tích.
    const boxes = $$(".sc-check", card);
    $("#scCheckAll", card).checked = boxes.length > 0 && boxes.every((cb) => cb.checked);
    updateSummary();
  }
  function updateSummary() {
    let n = 0, diff = 0;
    $$(".sc-check:checked", card).forEach((cb) => {
      const row = cb.closest("tr");
      const sys = parseFloat(row.querySelector("[data-sys]").dataset.sys) || 0;
      const counted = parseFloat(row.querySelector(".sc-counted").value) || 0;
      const d = Math.round((counted - sys) * 100) / 100;
      const cell = row.querySelector(".sc-diff");
      cell.textContent = (d > 0 ? "+" : "") + d;
      cell.style.color = d === 0 ? "inherit" : d > 0 ? "var(--green)" : "var(--red)";
      n++;
      diff += d;
    });
    $$(".sc-check:not(:checked)", card).forEach((cb) => {
      const row = cb.closest("tr");
      const cell = row.querySelector(".sc-diff");
      cell.textContent = "—"; cell.style.color = "inherit";
    });
    $("#scSummary", card).textContent = `Đã chọn ${n} dòng kiểm · Tổng chênh lệch: ${diff > 0 ? "+" : ""}${Math.round(diff * 100) / 100} (đơn vị tính từng mặt hàng)`;
  }
  drawRows();
  $("#scSearch", card).addEventListener("input", drawRows);
  $("#scOnlyStock", card).addEventListener("change", drawRows);
  $("#scCategoryFilter", card).addEventListener("change", (e) => { scCat = e.target.value; drawRows(); });
  $("#scCheckAll", card).addEventListener("change", (e) => {
    $$(".sc-check", card).forEach((cb) => {
      cb.checked = e.target.checked;
      const key = cb.dataset.id + "|" + (cb.dataset.lot || "");
      e.target.checked ? scSel.add(key) : scSel.delete(key);
    });
    updateSummary();
  });
  $("#scTable", card).addEventListener("input", (e) => { if (e.target.classList.contains("sc-counted")) updateSummary(); });
  $("#scTable", card).addEventListener("change", (e) => {
    if (!e.target.classList.contains("sc-check")) return;
    const key = e.target.dataset.id + "|" + (e.target.dataset.lot || "");
    e.target.checked ? scSel.add(key) : scSel.delete(key);
    const boxes = $$(".sc-check", card);
    $("#scCheckAll", card).checked = boxes.length > 0 && boxes.every((cb) => cb.checked);
    updateSummary();
  });
  $("#scTable", card).addEventListener("click", (e) => {
    const z = e.target.closest(".sc-zero");
    if (!z) return;
    const row = z.closest("tr");
    const input = row.querySelector(".sc-counted");
    input.value = 0;
    const cb = row.querySelector(".sc-check");
    cb.checked = true;
    scSel.add(cb.dataset.id + "|" + (cb.dataset.lot || ""));
    updateSummary();
  });
  $("#scCancel", card).onclick = () => closeModal();
  $("#scSave", card).onclick = async () => {
    const items = [];
    let changed = 0;
    const touched = new Map();
    for (const cb of $$(".sc-check:checked", card)) {
      const row = cb.closest("tr");
      const p = db.products.find((x) => x.id === cb.dataset.id);
      if (!p) continue;
      const counted = parseFloat(row.querySelector(".sc-counted").value) || 0;
      const lotId = cb.dataset.lot || "";
      if (lotId) {
        const lot = (p.lots || []).find((l) => l.id === lotId);
        if (!lot) continue;
        const sys = parseFloat(lot.qty) || 0;
        items.push({ productId: p.id, name: p.name, unit: p.unit, lotId, lotCode: lot.code, expiryDate: lot.expiryDate || null, systemQty: sys, countedQty: counted, diff: Math.round((counted - sys) * 100) / 100 });
        if (counted !== sys) { lot.qty = counted; changed++; touched.set(p.id, p); }
      } else {
        const sys = p.stock || 0;
        items.push({ productId: p.id, name: p.name, unit: p.unit, lotId: "", lotCode: "", expiryDate: p.expiryDate || null, systemQty: sys, countedQty: counted, diff: Math.round((counted - sys) * 100) / 100 });
        if (counted !== sys) { p.stock = counted; changed++; touched.set(p.id, p); }
      }
    }
    if (!items.length) { alert("Chưa chọn mặt hàng nào để kiểm."); return; }
    for (const p of touched.values()) { DB.recalcStock(p); await DB.put("products", p); }
    const totalDiff = items.reduce((s, it) => s + it.diff, 0);
    const rec = {
      id: DB.uid("kk"), code: "KK" + Date.now().toString().slice(-6),
      date: todayStr(), time: new Date().toISOString(),
      items, totalDiff, createdBy: Auth.me() ? Auth.me().username : "",
    };
    await DB.put("stockChecks", rec);
    DB.logActivity(`Kiểm kho ${rec.code}: ${items.length} dòng kiểm, ${changed} dòng đổi số lượng`, totalDiff, "📋");
    closeModal();
    renderProducts();
    alert(`Đã lưu bản kiểm kho ${rec.code}.\nĐã kiểm ${items.length} dòng, ${changed} dòng thay đổi số lượng.`);
  };
}
$("#stockCheckBtn").addEventListener("click", openStockCheck);
