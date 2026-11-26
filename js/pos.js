/* KOMATI — màn hình Bán hàng (POS). */
let posCart = []; // {productId, name, unit, qty, price, costPrice, discount, unitOptions}
let posCustomer = null;
let posPayment = "cash"; // cash | transfer | debt
let posDiscountType = "amount"; // amount (VNĐ) | percent (%)
// Khách đưa có đang do nhân viên tự nhập số khác với Tổng tiền không.
let posPaidManual = false;
// Số lượng hiển thị tối đa 3 số lẻ (VD 2.366 Kg), bỏ số 0 thừa.
const fmtQty = (q) => { const n = parseFloat((+q || 0).toFixed(3)); return isNaN(n) ? 0 : n; };

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
  const list = db.products.filter((p) =>
    (!sel.value || p.categoryId === sel.value) &&
    (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) &&
    (p.stock || 0) > 0);
  $("#posGrid").innerHTML = list.map((p) => `<button class="pos-item" data-id="${p.id}" type="button">
    <span class="thumb" style="width:100%;height:64px;border-radius:8px;margin-bottom:6px">${p.image ? `<img src="${p.image}" alt="">` : "🖼️"}</span>
    <span class="pname">${esc(p.name)}</span><br>
    <span class="pprice">${fmt(p.price)}đ</span><br>
    <span class="pstock">Tồn: ${p.stock} ${esc(p.unit)}</span>
  </button>`).join("") || `<p class="muted" style="grid-column:1/-1">Không còn hàng trong kho hoặc không khớp tìm kiếm.</p>`;
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

$("#posGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".pos-item");
  if (!btn) return;
  const p = DB.get().products.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  const ex = posCart.find((it) => it.productId === p.id && it.unit === p.unit);
  if (ex) {
    if (ex.qty + 1 > p.stock) { alert(`Chỉ còn ${p.stock} ${p.unit} trong kho.`); return; }
    ex.qty = fmtQty(ex.qty + 1);
  } else {
    posCart.push({ productId: p.id, name: p.name, unit: p.unit, qty: 1, price: p.price, costPrice: p.costPrice, discount: 0 });
  }
  renderPosCart();
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
  if (confirm("Xóa toàn bộ hóa đơn đang tính?")) { posCart = []; posCustomer = null; posPaidManual = false; renderPOS(); }
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
  // tự nhận số liệu (tổng thu đã tính cả đơn chuyển khoản và ghi nợ, phiếu
  // "Bán hàng" / "Bán hàng ghi nợ" được loại khỏi tổng phiếu thu để khỏi
  // tính 2 lần — xem renderCashbook).
  const cashCode = "PT" + Date.now().toString().slice(-6);
  if (payment === "cash") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code}`, orderId: order.id });
  }
  if (payment === "transfer") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code} (Chuyển khoản)`, orderId: order.id });
  }
  if (payment === "debt") {
    await DB.put("cashEntries", { id: DB.uid("pt"), code: cashCode, date: todayStr(), time: new Date().toISOString(), type: "in", category: "Bán hàng ghi nợ", amount: t.total, person: order.customerName, note: `Bán hàng ${order.code} (Ghi nợ)`, orderId: order.id });
  }
  DB.logActivity(`Bán đơn hàng ${order.code} cho ${order.customerName}`, t.total, "🛒");
  posCart = []; posCustomer = null; posPaidManual = false;
  $("#posDiscountValue").value = 0; $("#posShipping").value = 0; $("#posPaid").value = 0;
  setPosPayment("cash");
  if (printAfter) printOrder(order);
  else alert(`Đã lưu hóa đơn ${order.code} — ${fmt(t.total)}đ.`);
  renderPOS();
}
$("#posSave").addEventListener("click", () => saveOrder(false));
$("#posSavePrint").addEventListener("click", () => saveOrder(true));
