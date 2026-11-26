# KOMATI — Bán hàng và quản lý cửa hàng (PWA)

App bán hàng cho cửa hàng trái cây: Tổng quan, Hàng hóa, Đơn hàng, Khách hàng
& công nợ, Nhân viên & phân quyền, Sổ quỹ, In ấn 80mm, Bán hàng (POS).
Dùng được trên cả máy tính và điện thoại, cài đặt được như app (PWA).

## Chạy thử ngay (chế độ demo, chưa cần Firebase)

Mở `index.html` bằng trình duyệt (hoặc xem trên GitHub Pages sau khi deploy).
Dữ liệu demo lưu trên trình duyệt đang dùng (localStorage), đã nạp sẵn hàng hóa
và khách hàng thật của Farm Plus lấy từ ảnh tham chiếu KiotViet.

- Đăng nhập: tên `admin` — mật khẩu `123456` (tài khoản quản lý mặc định).
  **Đổi mật khẩu ngay sau lần đăng nhập đầu** (tab Nhân viên → Đổi mật khẩu).
- Màn hình đăng nhập không gợi ý hay điền sẵn tài khoản/mật khẩu. Nút "Ghi nhớ
  đăng nhập" chỉ lưu tên đăng nhập, mật khẩu luôn phải tự gõ.

## Đưa lên mạng (GitHub Pages — giống app chấm công)

1. Tạo repo public mới tên `komati-pos` trên GitHub (tài khoản dangthaivn).
2. Đẩy toàn bộ thư mục này lên nhánh `main`.
3. Settings → Pages → Branch `main`, thư mục `/(root)` → Save.
4. Mở `https://dangthaivn.github.io/komati-pos/` trên điện thoại/máy tính,
   chọn "Thêm vào màn hình chính" để cài như app.
5. **Sau mỗi lần cập nhật code: tăng số phiên bản `CACHE` trong `sw.js`
   (komati-v1 → komati-v2…)**, nếu không trình duyệt sẽ hiện giao diện cũ.

## Nối Firebase (để dữ liệu thật, dùng chung nhiều máy)

Làm theo 8 bước trong `firebase-config.js`. Tóm tắt:

1. https://console.firebase.google.com → tạo project `komati`.
2. Authentication → bật Email/Password.
3. Firestore Database → Create database → production mode → `asia-southeast1`.
4. Project settings → tạo Web app → copy `firebaseConfig` dán vào `firebase-config.js`.
5. Authentication → Users → Add user: `admin@komati.local` / `123456`
   (đổi mật khẩu sau lần đăng nhập đầu).
6. Firestore → Rules → dán nội dung `firestore.rules` → Publish.
7. Deploy lại app. Từ lúc này dữ liệu lưu trên Firestore; chế độ demo tắt.

## Tính năng chính

- **Tổng quan:** chọn ngày / tuần / tháng / ngày tùy chọn; 4 ô Doanh thu,
  Trả hàng, Lợi nhuận gộp, Hóa đơn; biểu đồ doanh thu từng ngày trong tháng;
  Top 10 mặt hàng, Top 10 khách hàng; cột Hoạt động gần đây.
- **Hàng hóa:** thêm/sửa/xóa, nhóm hàng (tạo mới bằng dấu +), ảnh, giá vốn,
  giá bán, đơn vị phụ (thùng/hộp…), hạn sử dụng — báo khi còn ≤ 30 ngày,
  báo mỗi ngày đến khi hết hàng; nhập kho; import Excel + file mẫu Excel.
- **Đơn hàng:** lọc theo ngày/tuần/tháng; xem chi tiết; Hủy/Trả hàng
  (trả lại kho + hoàn tiền/nợ); chọn nhiều để xóa.
- **Khách hàng:** import Excel, công nợ từng khách + tổng công nợ,
  phiếu thu trả nợ (đồng bộ sang Sổ quỹ), sửa/lưu thông tin.
- **Nhân viên:** tên đăng nhập + mật khẩu (lưu dạng băm SHA-256 + salt ở
  chế độ demo; dùng Firebase Auth khi đã nối Firebase), phân quyền từng mục,
  mẫu quyền sẵn cho Thu ngân / Bán hàng / Kho / Quản trị.
- **Sổ quỹ:** quỹ đầu ngày, tiền mặt trong ngày, tổng thu (bán hàng tiền mặt +
  chuyển khoản + nợ + thu nợ + thu khác), tổng chi, phiếu thu/phiếu chi
  (đồng bộ công nợ khách hàng khi thu nợ).
- **In ấn:** thông tin cửa hàng, logo, cỡ chữ, xem trước mẫu in 80mm.
- **Bán hàng (POS):** tìm hàng, chọn khách, giảm giá từng mặt hàng và giảm
  giá cả hóa đơn (tiền mặt hoặc %), thu khác (ship), tiền mặt / chuyển khoản /
  ghi nợ, tiền thừa, LƯU và LƯU & IN (in nhiệt 80mm).

## Bảo mật

- Mật khẩu không bao giờ nằm trong code frontend. Chế độ demo: SHA-256 + salt
  trong bản ghi nhân viên. Chế độ Firebase: Firebase Auth giữ mật khẩu.
- Firestore Rules chỉ cho người đã đăng nhập đọc/ghi dữ liệu.
- Không có tài khoản/mật khẩu mặc định nào hiển thị hay gợi ý trên màn hình
  đăng nhập.
