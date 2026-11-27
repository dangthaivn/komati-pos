/* KOMATI — màn hình Bán hàng (POS). */
let posCart = []; // {productId, name, unit, qty, price, costPrice, discount, unitOptions}
let posCustomer = null;
let posPayment = "cash"; // cash | transfer | debt
let posDiscountType = "amount"; // amount (VNĐ) | percent (%)
// Khách đưa có đang do nhân viên tự nhập số khác với Tổng tiền không.
let posPaidManual = false;
// Số lượng hiển thị tối đa 3 số lẻ (VD 2.366 Kg), bỏ số 0 thừa.
const fmtQty = (q) => { const n = parseFloat((+q || 0).toFixed(3)); return isNaN(n) ? 0 : n; };

// ----- Bán hàng trên điện thoại: 2 màn hình riêng -----
// "pick": chỉ hiện phần tìm kiếm + danh sách hàng hóa.
// "bill": chỉ hiện hóa đơn, phía trên có thanh tìm kiếm để quay lại thêm hàng.
// Máy tính giữ nguyên bố cục 2 cột cạnh nhau.
let posMobileView = "pick";
const isMobilePos = () => window.matchMedia("(max-width: 960px)").matches;
function setPosMobileView(v) {
  posMobileView = v;
  const sec = $("#view-pos");
  sec.classList.toggle("pos-m-bill", v === "bill");
  sec.classList.toggle("pos-m-pick", v === "pick");
  window.scrollTo({ top: 0 });
}

function renderPosCustomer() {
  const picked = $("#posCustPicked"), input = $("#posCustSearch");
  if (posCustomer) {
    picked.hidden = false;
    $("#posCustName").textContent = posCustomer.name;
    $("#posCustPhone").textContent = posCustomer.phone ? " — " + posCustomer.phone : "";
    $("#posCustDebt").textContent = (posCustomer.debt || 0) > 0 ? `Nợ ${fmt(posCustomer.debt)}đ` : "";
    input.value = "";
    input.placeholder = posCustomer.name + (posCustomer.phone ? " — " + posCustomer.phone : "");
  } else {
    picked.hidden = true;
    input.placeholder = "🔍 Tìm khách hàng (tên, SĐT, địa chỉ)…";
  }
}
function setPosPayment(p) {
  posPayment = p;
  $$("#posPayBoxes .pay-box").forEach((b) => b.classList.toggle("selected", b.dataset.pay === p));
  const t = posTotals();
  // Tiền mặt: Khách đưa mặc định bằng Tổng tiền. Chuyển khoản: đủ tiền.
  // Ghi nợ: khách chưa đưa tiền. Chuyển khoản / Ghi nợ thì ẩn dòng Khách đưa.
  if (p === "cash") { posPaidManual = false; $("#posPaid").value = t.total; }
  if (p === "transfer") $("#posPaid").value = t.total;
  if (p === "debt") $("#posPaid").value = 0;
  const isCash = p === "cash";
  $("#posPaidRow").hidden = !isCash;
  $("#posChangeRow").hidden = !isCash;
  $("#posPaidSuggest").hidden = !isCash;
  updatePosTotals();
}

function newOrderCode() {
  const d = new Date();
  const base = "HD" + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const n = DB.get().orders.filter((o) => o.code.startsWith(base)).length + 1;
  return base + String(n).padStart(3, "0");
}
function renderPOS() {
  $("#posOrderCode").textContent = newOrderCode();
  renderPosCustomer();
  const db = DB.get();
  const q = $("#posSearch").value.trim().toLowerCase();
  const cat = $("#posCategoryFilter").value;
  const sel = $("#posCategoryFilter");
  const cur = sel.value;
  sel.innerHTML = `<option value="">Tất cả nhóm</option>` + db.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  sel.value = cur || cat;
  const list = db.products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) =>
      (!sel.value || p.categoryId === sel.value) &&
      (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
    .sort((a, b) => {
      // Còn hàng lên trước; trong mỗi nhóm thì mới nhất trước, theo thời
      // gian nhập/tạo hàng. Mặt hàng cũ chưa có createdAt thì lấy theo
      // thứ tự thêm vào (mới thêm nằm cuối mảng).
      const sa = (a.p.stock || 0) > 0 ? 0 : 1;
      const sb = (b.p.stock || 0) > 0 ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ta = a.p.createdAt || "";
      const tb = b.p.createdAt || "";
      if (ta !== tb) return tb.localeCompare(ta);
      return b.i - a.i;
    })
    .map(({ p }) => p);
  $("#posGrid").innerHTML = list.map((p) => {
    const out = (p.stock || 0) <= 0;
    return `<button class="pos-item${out ? " out" : ""}" data-id="${p.id}" type="button">
    <span class="thumb">${p.image ? `<img src="${p.image}" alt="">` : "🖼️"}</span>
    <span class="pinfo">
      <span class="pname">${esc(p.name)}</span>
      <span class="pcode">Mã: ${esc(p.code)}</span>
      <span class="pprice">${fmt(p.price)}đ</span>
      ${out ? `<span class="pstock" style="color:var(--red);font-weight:700">Hết hàng</span>` : `<span class="pstock">Tồn: ${p.stock} ${esc(p.unit)}</span>`}
    </span>
  </button>`; }).join("") || `<p class="muted" style="grid-column:1/-1">Không có mặt hàng nào khớp tìm kiếm.</p>`;
  renderPosCart();
}
function renderPosCart() {
  const box = $("#posLines");
  box.innerHTML = posCart.map((it, i) => `<div class="pos-line">
    <div class="ln-top"><span><b>${esc(it.name)}</b><br><span class="muted">${fmt(it.price)}đ / ${esc(it.unit)}</span></span>
    <b>${fmt(Math.max(0, it.price * it.qty - (it.discount || 0)))}đ</b></div>
    <div class="ln-ctl">
      <span class="qty-group">
        <button class="qty-btn" data-i="${i}" data-d="-1" type="button">−</button>
        <input class="qty-input" data-qty="${i}" type="number" min="0" step="0.001" value="${fmtQty(it.qty)}">
        <button class="qty-btn" data-i="${i}" data-d="1" type="button">+</button>
      </span>
      <span class="ln-actions">
        <button class="btn btn-outline btn-sm" data-disc="${i}" type="button">Giảm giá${it.discount ? `: −${fmt(it.discount)}đ` : ""}</button>
        <button class="btn btn-ghost btn-sm" data-rm="${i}" type="button" style="color:var(--red)">✕</button>
      </span>
    </div></div>`).join("") || `<p class="muted">Chưa có sản phẩm nào. Chạm vào mặt hàng để thêm.</p>`;
  updatePosTotals();
}
function posTotals() {
  let sub = 0;
  for (const it of posCart) sub += Math.max(0, it.price * it.qty - (it.discount || 0));
  const dv = moneyInput($("#posDiscountValue").value);
  const disc = posDiscountType === "percent" ? sub * Math.min(100, dv) / 100 : Math.min(sub, dv);
  const ship = moneyInput($("#posShipping").value);
  return { sub, disc, ship, total: Math.max(0, sub - disc + ship) };
}
function updatePosTotals() {
  const t = posTotals();
  // Khách đưa tự theo Tổng tiền khi đang ở Tiền mặt và nhân viên chưa tự
  // nhập số khác; Chuyển khoản luôn đủ tiền.
  if (posPayment === "cash" && !posPaidManual) $("#posPaid").value = t.total;
  if (posPayment === "transfer") $("#posPaid").value = t.total;
  $("#posSubtotal").textContent = fmt(t.sub) + "đ";
  $("#posTotal").textContent = fmt(t.total) + "đ";
  const paid = moneyInput($("#posPaid").value);
  $("#posChange").textContent = fmt(Math.max(0, paid - t.total)) + "đ";
  renderPaidSuggest(t.total);
}
// Gợi ý số tiền chẵn lớn hơn Tổng tiền một chút để nhân viên chọn nhanh.
// Theo mệnh giá 50.000 / 100.000 / 200.000 / 500.000 (VD bill 221.000đ gợi
// ý 250.000 / 300.000 / 400.000 / 500.000); số lẻ nhỏ nhân viên tự tính.
function renderPaidSuggest(total) {
  const box = $("#posPaidSuggest");
  if (posPayment !== "cash" || total <= 0) { box.hidden = true; box.innerHTML = ""; return; }
  const dens = [50000, 100000, 200000, 500000, 1000000];
  const vals = [];
  for (const d of dens) {
    const v = Math.ceil(total / d) * d;
    if (v > total && !vals.includes(v)) vals.push(v);
    if (vals.length >= 4) break;
  }
  if (!vals.length) vals.push(Math.ceil((total + 100000) / 50000) * 50000);
  box.hidden = false;
  box.innerHTML = vals.map((v) => `<button type="button" class="suggest-chip" data-amt="${v}">${fmt(v)}</button>`).join("");
}
$("#posPaidSuggest").addEventListener("click", (e) => {
  const b = e.target.closest(".suggest-chip");
  if (!b) return;
  $("#posPaid").value = +b.dataset.amt;
  posPaidManual = true;
  updatePosTotals();
});
$("#posSearch").addEventListener("input", () => renderPOS());
$("#posCategoryFilter").addEventListener("change", () => renderPOS());
["posDiscountValue", "posShipping"].forEach((id) =>
  $("#" + id).addEventListener("input", updatePosTotals));
$("#posPaid").addEventListener("input", () => { posPaidManual = true; updatePosTotals(); });
$("#posDiscountTypeSeg").addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn");
  if (!b) return;
  posDiscountType = b.dataset.t;
  $$("#posDiscountTypeSeg .seg-btn").forEach((x) => x.classList.toggle("selected", x === b));
  updatePosTotals();
});
$("#posPayBoxes").addEventListener("click", (e) => {
  const b = e.target.closest(".pay-box");
  if (b) setPosPayment(b.dataset.pay);
});

// Thêm 1 mặt hàng vào hóa đơn (dùng chung cho chạm vào lưới hàng và quét mã vạch).
function addProductToCart(p) {
  const ex = posCart.find((it) => it.productId === p.id && it.unit === p.unit);
  if (ex) {
    if (ex.qty + 1 > p.stock) { alert(`Chỉ còn ${p.stock} ${p.unit} trong kho.`); return false; }
    ex.qty = fmtQty(ex.qty + 1);
  } else {
    if (p.stock < 1) { alert(`"${p.name}" đã hết hàng.`); return false; }
    posCart.push({ productId: p.id, name: p.name, unit: p.unit, qty: 1, price: p.price, costPrice: p.costPrice, discount: 0 });
  }
  renderPosCart();
  return true;
}
$("#posGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".pos-item");
  if (!btn) return;
  const p = DB.get().products.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  // Điện thoại: chọn hàng xong là chuyển sang cửa sổ hóa đơn.
  if (addProductToCart(p) && isMobilePos()) setPosMobileView("bill");
});
// Thanh tìm hàng phía trên hóa đơn (điện thoại): bấm là quay lại danh sách hàng.
$("#posBillSearch").addEventListener("click", () => {
  setPosMobileView("pick");
  setTimeout(() => $("#posSearch").focus(), 50);
});
$("#posLines").addEventListener("click", (e) => {
  const q = e.target.closest("[data-d]");
  if (q) {
    const it = posCart[+q.dataset.i];
    const p = DB.get().products.find((x) => x.id === it.productId);
    it.qty = fmtQty(it.qty + +q.dataset.d);
    if (it.qty > (p ? p.stock : 99)) { alert(`Chỉ còn ${p ? p.stock : 99} ${p ? p.unit : ""} trong kho.`); it.qty = p ? p.stock : 99; }
    // Số lượng nhỏ nhất là 0: bấm − ở 1 thì về 0 và giữ dòng hàng lại,
    // bấm − tiếp vẫn là 0, không xóa hàng khỏi hóa đơn.
    if (it.qty < 0) it.qty = 0;
    if (it.qty === 0) it.discount = 0;
    renderPosCart(); return;
  }
  const rm = e.target.closest("[data-rm]");
  if (rm) { posCart.splice(+rm.dataset.rm, 1); renderPosCart(); return; }
  const dc = e.target.closest("[data-disc]");
  if (dc) { openItemDiscountModal(+dc.dataset.disc); return; }
});
// Nhập trực tiếp số lượng (kể cả số lẻ từng gam, VD 2.366 Kg).
$("#posLines").addEventListener("change", (e) => {
  const inp = e.target.closest("[data-qty]");
  if (!inp) return;
  const it = posCart[+inp.dataset.qty];
  const p = DB.get().products.find((x) => x.id === it.productId);
  let v = parseFloat(inp.value);
  if (isNaN(v) || v < 0) v = 0;
  if (p && v > p.stock) { alert(`Chỉ còn ${p.stock} ${p.unit} trong kho.`); v = p.stock; }
  it.qty = fmtQty(v);
  if (it.qty === 0) it.discount = 0;
  renderPosCart();
});
// Cửa sổ giảm giá từng món: nút VNĐ / % như dòng Giảm giá hóa đơn.
let itemDiscType = "amount";
function openItemDiscountModal(idx) {
  const it = posCart[idx];
  if (!it) return;
  const lineTotal = it.price * it.qty;
  itemDiscType = "amount";
  const card = openModal(`<h3>Giảm giá — ${esc(it.name)}</h3>
    <p class="muted">Đơn giá ${fmt(it.price)}đ × ${fmtQty(it.qty)} ${esc(it.unit)} = <b>${fmt(lineTotal)}đ</b>. Giảm tối đa ${fmt(lineTotal)}đ.</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>Số tiền giảm / % giảm</span>
      <span class="inline-ctl">
        <span class="seg-toggle" id="itemDiscTypeSeg"><button type="button" class="seg-btn selected" data-t="amount">VNĐ</button><button type="button" class="seg-btn" data-t="percent">%</button></span>
        <input id="itemDiscValue" type="number" min="0" value="${it.discount || 0}" class="mini-input">
      </span>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" id="itemDiscCancel">Hủy</button>
      <button type="button" class="btn btn-primary" id="itemDiscSave">Áp dụng</button>
    </div>`);
  $("#itemDiscTypeSeg", card).addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn");
    if (!b) return;
    itemDiscType = b.dataset.t;
    $$("#itemDiscTypeSeg .seg-btn", card).forEach((x) => x.classList.toggle("selected", x === b));
  });
  $("#itemDiscCancel", card).onclick = () => closeModal();
  $("#itemDiscSave", card).onclick = () => {
    const v = moneyInput($("#itemDiscValue", card).value);
    let disc = 0;
    if (itemDiscType === "percent") {
      if (v < 0 || v > 100) { alert("Phần trăm giảm phải từ 0 đến 100."); return; }
      disc = Math.round(lineTotal * v / 100);
    } else {
      if (v < 0 || v > lineTotal) { alert("Số tiền giảm chưa hợp lệ."); return; }
      disc = v;
    }
    it.discount = disc;
    closeModal(); renderPosCart();
  };
}
/* ---------- Tìm khách hàng ở đầu hóa đơn + thêm khách mới ---------- */
$("#posCustSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const box = $("#posCustResults");
  if (!q) { box.hidden = true; box.innerHTML = ""; return; }
  const db = DB.get();
  // Tìm theo tên, SĐT, mã khách và cả địa chỉ.
  const list = db.customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.code || "").toLowerCase().includes(q) || (c.address || "").toLowerCase().includes(q)).slice(0, 6);
  box.innerHTML = list.map((c) => `<button type="button" data-cid="${c.id}">${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}${(c.debt || 0) > 0 ? ` <span style="color:var(--red)">(nợ ${fmt(c.debt)}đ)</span>` : ""}${c.address ? `<br><span class="muted" style="font-size:12.5px">${esc(c.address)}</span>` : ""}</button>`).join("")
    + `<button type="button" class="add-new" data-add="${esc(e.target.value.trim())}">＋ Thêm khách mới "${esc(e.target.value.trim())}"</button>`;
  box.hidden = false;
  $$("[data-cid]", box).forEach((b) => (b.onclick = () => { posCustomer = db.customers.find((x) => x.id === b.dataset.cid); box.hidden = true; e.target.value = ""; renderPOS(); }));
  const addBtn = $("[data-add]", box);
  if (addBtn) addBtn.onclick = () => { box.hidden = true; e.target.value = ""; openPosQuickAddCustomer(addBtn.dataset.add); };
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".pos-cust")) { const box = $("#posCustResults"); if (box) box.hidden = true; }
});
$("#posCustClear").addEventListener("click", () => { posCustomer = null; renderPOS(); });

function openPosQuickAddCustomer(prefill) {
  const looksPhone = /^[0-9+][0-9\s.]*$/.test((prefill || "").trim());
  const card = openModal(`<h3>Thêm khách hàng mới</h3>
    <form id="posCustForm">
      <label>Tên khách hàng<input name="name" type="text" required value="${esc(looksPhone ? "" : prefill || "")}"></label>
      <div class="form-row">
        <label>Số điện thoại<input name="phone" type="tel" value="${esc(looksPhone ? prefill || "" : "")}"></label>
        <label>Địa chỉ<input name="address" type="text"></label>
      </div>
      <div id="posCustDup" style="margin-top:10px"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="pqCancel">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu khách hàng</button></div>
    </form>`);
  $("#pqCancel", card).onclick = () => closeModal();
  $("#posCustForm", card).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const phone = (fd.get("phone") || "").trim();
    const name = (fd.get("name") || "").trim();
    const db = DB.get();
    // Trùng SĐT với khách đã lưu: hiện khách cũ ra, không tạo trùng.
    const dup = phone && findCustomerByPhone(db, phone);
    if (dup) {
      $("#posCustDup", card).innerHTML = `<div class="alert alert-warn">SĐT này đã có khách hàng: <b>${esc(dup.name)}</b>${dup.phone ? " — " + esc(dup.phone) : ""}${(dup.debt || 0) > 0 ? ` · đang nợ ${fmt(dup.debt)}đ` : ""}.<br>Chọn khách này cho hóa đơn thay vì tạo mới.</div>
      <div class="modal-actions" style="margin-top:10px"><button type="button" class="btn btn-primary" id="pqUseDup">Dùng khách này</button></div>`;
      $("#pqUseDup", card).onclick = () => { posCustomer = dup; closeModal(); renderPOS(); };
      return;
    }
    const item = { id: DB.uid("kh"), code: "KH" + String(1000000 + db.customers.length + 1), name, phone, address: (fd.get("address") || "").trim(), note: "", debt: 0, totalBought: 0 };
    await DB.put("customers", item);
    posCustomer = item;
    closeModal(); renderPOS();
  };
}
$("#posClear").addEventListener("click", () => {
  if (!posCart.length) return;
  if (confirm("Xóa toàn bộ hóa đơn đang tính?")) { posCart = []; posCustomer = null; posPaidManual = false; renderPOS(); setPosMobileView("pick"); }
});

async function saveOrder(printAfter) {
  // Chỉ lưu các dòng có số lượng > 0 (dòng về 0 vẫn nằm trong hóa đơn để
  // Sếp bấm + lại, nhưng không tính vào đơn đã lưu).
  const sell = posCart.filter((it) => it.qty > 0);
  if (!sell.length) { alert("Chưa có sản phẩm nào trong hóa đơn."); return; }
  const db = DB.get();
  const t = posTotals();
  const payment = posPayment;
  const paid = moneyInput($("#posPaid").value);
  if (payment === "debt" && !posCustomer) { alert("Ghi nợ cần chọn khách hàng trước."); return; }
  if (payment !== "debt" && paid < t.total) {
    alert(`Khách chưa trả đủ tiền (thiếu ${fmt(t.total - paid)}đ). Chọn "Ghi nợ" nếu cho khách nợ, hoặc nhập đủ số tiền khách đưa.`);
    return;
  }
  // Kiểm tra tồn kho lần cuối
  for (const it of sell) {
    const p = db.products.find((x) => x.id === it.productId);
    if (!p || it.qty > (p.stock || 0)) { alert(`"${it.name}" không đủ tồn kho.`); return; }
  }
  const order = {
    id: DB.uid("hd"), code: newOrderCode(), date: todayStr(), time: new Date().toISOString(),
    customerId: posCustomer ? posCustomer.id : null,
    customerName: posCustomer ? posCustomer.name : "Khách lẻ",
    items: sell.map((it) => ({ productId: it.productId, name: it.name, unit: it.unit, qty: it.qty, price: it.price, discount: it.discount || 0 })),
    discountValue: t.disc, shipping: t.ship, payment, paid,
    status: "completed", createdBy: Auth.me().username,
  };
  // Trừ kho + cập nhật công nợ / tổng mua (trừ theo lô hết hạn trước)
  for (const it of sell) {
    const p = db.products.find((x) => x.id === it.productId);
    DB.deductFromLots(p, it.qty);
    await DB.put("products", p);
  }
  if (posCustomer) {
    posCustomer.totalBought = (posCustomer.totalBought || 0) + t.total;
    if (payment === "debt") posCustomer.debt = (posCustomer.debt || 0) + t.total;
    else if (paid < t.total) posCustomer.debt = (posCustomer.debt || 0) + (t.total - paid);
    await DB.put("customers", posCustomer);
  }
  await DB.put("orders", order);
  // Tiền mặt / Chuyển khoản / Ghi nợ đều ghi 1 dòng vào Sổ quỹ để Sổ quỹ
  // tự nhận số liệu. Phiếu "Bán hàng" / "Bán hàng ghi nợ" được loại khỏi
  // tổng phiếu thu để khỏi tính 2 lần — xem renderCashbook.
  const cashCode = "PT" + Date.now().toString().slice(-6);
  if (payment === "cash") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng", method: "cash", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code}`, orderId: order.id });
  }
  if (payment === "transfer") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng", method: "transfer", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code} (Chuyển khoản)`, orderId: order.id });
  }
  if (payment === "debt") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng ghi nợ", method: "debt", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code} (Ghi nợ)`, orderId: order.id });
  }
  DB.logActivity(`Bán đơn hàng ${order.code} cho ${order.customerName}`, t.total, "🛒");
  posCart = []; posCustomer = null; posPaidManual = false;
  $("#posDiscountValue").value = 0; $("#posShipping").value = 0; $("#posPaid").value = 0;
  setPosPayment("cash");
  if (printAfter) printOrder(order);
  else alert(`Đã lưu hóa đơn ${order.code} — ${fmt(t.total)}đ.`);
  renderPOS();
  setPosMobileView("pick"); // đơn mới: về lại màn hình chọn hàng
}
$("#posSave").addEventListener("click", () => saveOrder(false));
$("#posSavePrint").addEventListener("click", () => saveOrder(true));

// ----- Quét mã vạch bằng camera điện thoại -----
// Thư viện html5-qrcode (tự lưu trong app, js/vendor/) đọc các loại mã vạch
// 1D thường gặp: EAN-13, EAN-8, UPC-A/E, CODE 128/39/93, ITF, CODABAR.
let scanObj = null, scanDone = false;
function stopScan() {
  if (!scanObj) return;
  const s = scanObj; scanObj = null;
  s.stop().then(() => s.clear()).catch(() => { try { s.clear(); } catch (_) {} });
}
// Dừng camera dù cửa sổ đóng bằng cách nào (nút Đóng, bấm nền, phím Esc).
new MutationObserver(() => { if ($("#modal").hidden) stopScan(); }).observe($("#modal"), { attributes: true, attributeFilter: ["hidden"] });
function openScanModal() {
  if (typeof Html5Qrcode === "undefined") {
    alert("Không tải được thư viện quét mã. Kiểm tra mạng rồi thử lại.");
    return;
  }
  scanDone = false;
  const card = openModal(`<h3>Quét mã vạch</h3>
    <p class="muted">Đưa mã vạch trên bao bì vào khung hình, app sẽ tự nhận mã và thêm hàng vào hóa đơn.</p>
    <div id="scanReader" style="width:100%;border-radius:8px;overflow:hidden;background:#000"></div>
    <p class="muted" id="scanStatus">Đang mở camera…</p>
    <div class="modal-actions"><button type="button" class="btn btn-outline" id="scanClose">Đóng</button></div>`);
  $("#scanClose", card).onclick = () => { stopScan(); closeModal(); };
  const scanner = new Html5Qrcode("scanReader");
  scanObj = scanner;
  const formats = (typeof Html5QrcodeSupportedFormats !== "undefined") ? [
    Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93, Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR] : undefined;
  scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 140 }, formatsToSupport: formats },
    (code) => {
      if (scanDone) return;
      scanDone = true;
      stopScan(); closeModal();
      handleScannedCode(code);
    },
    () => { /* quét chưa ra mã — bỏ qua, vẫn quét tiếp */ }
  ).catch((err) => {
    const st = $("#scanStatus");
    if (!st) return;
    const msg = String(err || "");
    st.textContent = /permission|denied|NotAllowed/i.test(msg)
      ? "Điện thoại chưa cho phép dùng camera. Sếp mở Cài đặt trình duyệt → cho phép Camera rồi thử lại."
      : "Không mở được camera (" + msg + "). Thử lại hoặc gõ mã bằng tay.";
  });
}
// Mã quét được phải trùng "Mã hàng" của sản phẩm thì mới thêm vào hóa đơn.
function handleScannedCode(code) {
  const p = findProductByCode(DB.get(), code);
  if (!p) {
    $("#posSearch").value = code;
    renderPOS();
    setPosMobileView("pick");
    alert(`Không tìm thấy mặt hàng có mã ${code}. Kiểm tra lại Mã hàng của sản phẩm.`);
    return;
  }
  if (addProductToCart(p) && isMobilePos()) setPosMobileView("bill");
}
$("#posScanBtn").addEventListener("click", openScanModal);
