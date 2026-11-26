/* KOMATI — cấu hình Firebase.
 * HƯỚNG DẪN NỐI FIREBASE (làm 1 lần, khoảng 10 phút):
 * 1. Vào https://console.firebase.google.com → Add project → đặt tên "komati" → Create.
 * 2. Trong project: Build → Authentication → Sign-in method → bật Email/Password.
 * 3. Build → Firestore Database → Create database → Start in production mode → chọn vị trí asia-southeast1 (Singapore).
 * 4. Project settings (bánh răng) → Your apps → Web app (</>) → đặt tên "komati-web" → Register.
 * 5. Copy đoạn firebaseConfig hiện ra và dán vào đây, thay các giá trị PASTE_* bên dưới.
 * 6. Tạo tài khoản admin trên Firebase Auth: Authentication → Users → Add user
 *    email: admin@komati.local — mật khẩu: 123456 (đổi sau khi đăng nhập lần đầu).
 * 7. Firestore Rules (mục Rules): dán nội dung file firestore.rules đi kèm, rồi Publish.
 * 8. Deploy lại app. Từ lúc này dữ liệu sẽ lưu trên Firestore thay vì localStorage.
 * CHƯA CÓ CẤU HÌNH: app vẫn chạy đầy đủ ở chế độ demo (dữ liệu lưu trên máy đang dùng).
 */
window.KOMATI_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};
