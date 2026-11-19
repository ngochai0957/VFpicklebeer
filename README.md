# Pickleball Team League — Fixed Lineup (Live Scoreboard & Admin Portal)

Trang web theo dõi giải đấu Pickleball theo thể thức **Team League – Fixed Lineup** (Đội hình cố định) và lưu **tỉ số theo từng Set** (phong cách PPA / Ben Johns: Best of 1 / Best of 3 / Best of 5).

- **Người xem bên ngoài (Public UI):** Chỉ xem được giao diện Bảng xếp hạng, Sân đang Live, Lịch & kết quả từng Set, và Đội hình cố định. Không thấy nút chỉnh sửa và không thể ghi dữ liệu.
- **Quản trị viên duy nhất (Admin):** Đăng nhập để cập nhật tỉ số từng Set (`+1` / `-1` hoặc nhập số), sửa tên đội, đổi số lượng đội (`2–16 đội`), chỉnh số cặp cố định (`1–8 cặp/đội`), sinh lịch vòng tròn tự động và thêm vòng Chung kết / Playoff.

---

## 1. Chạy thử ngay trên máy (Chế độ Demo Local)

Vì dùng ES Modules, bạn chỉ cần mở bằng một static server nhỏ (không cần cài `npm`):

```powershell
cd PickleballLeague
python -m http.server 8080
```

Sau đó mở trình duyệt vào `http://localhost:8080`.
- Nút **🔒 Quản trị (Admin)** ở góc trên bên phải cho phép đăng nhập thử với mã PIN mặc định `admin123` (có thể đổi trong `js/config.js`).
- Nếu mở 2 tab cùng lúc trên trình duyệt, mọi thay đổi tỉ số ở tab Admin sẽ tự động nhảy sang tab người xem ngay lập tức.

---

## 2. Kết nối Supabase (Miễn phí, Realtime cho mọi thiết bị, Bảo mật Server)

Để mọi người ngoài sân mở điện thoại xem trực tiếp **Realtime** và chỉ duy nhất **1 mình bạn** cập nhật được dữ liệu (bảo mật bởi PostgreSQL Row Level Security):

1. Truy cập [supabase.com](https://supabase.com), tạo một Project miễn phí.
2. Vào **SQL Editor**, copy toàn bộ nội dung file `supabase/schema.sql` và bấm **Run**.
3. Vào **Authentication → Users → Add user**, tạo **1 tài khoản Admin duy nhất** (Email + Mật khẩu của bạn).
4. Vào **Authentication → Sign In / Providers**, tắt **Allow new users to sign up** để khóa đăng ký người dùng mới.
5. Quay lại **SQL Editor**, chạy câu lệnh sau (thay bằng email bạn vừa tạo):
   ```sql
   INSERT INTO public.admin_users (user_id, note)
   SELECT id, 'Primary Tournament Admin'
   FROM auth.users
   WHERE email = 'email-admin-cua-ban@example.com'
   ON CONFLICT (user_id) DO NOTHING;
   ```
6. Vào **Project Settings → API** (hoặc Connect), copy **Project URL** và **anon public key** dán vào `js/config.js`:
   ```js
   export const APP_CONFIG = {
       SUPABASE_URL: 'https://xxxx.supabase.co',
       SUPABASE_ANON_KEY: 'eyJ...',
       ADMIN_EMAIL: 'email-admin-cua-ban@example.com', // điền sẵn để chỉ cần nhập Mật khẩu khi login
       TOURNAMENT_ID: 'main',
       LOCAL_DEMO_PIN: 'admin123'
   };
   ```
   > **Quan trọng:** Tuyệt đối **không** dán `service_role` key vào `config.js`. Chỉ dùng `anon` key.
7. Mở web, đăng nhập Admin một lần và bấm **"Khởi tạo Giải mẫu trên Supabase"** (hoặc tự tạo đội & lịch mới).

---

## 3. Host Online Miễn Phí (Public Link / QR Code cho người xem)

Đẩy nguyên thư mục `PickleballLeague` lên bất kỳ dịch vụ static hosting miễn phí nào:
- **Netlify Drop:** Kéo thả thư mục `PickleballLeague` lên [app.netlify.com/drop](https://app.netlify.com/drop) là có link HTTPS sau 10 giây.
- **Vercel / Cloudflare Pages / GitHub Pages:** Trỏ thư mục gốc tới `PickleballLeague` (không cần build command).

---

## 4. Quy tắc Xếp hạng Team League – Fixed Lineup

Bảng xếp hạng vòng tròn tự động sắp xếp theo đúng thứ tự ưu tiên:
1. **Số Team Match thắng** (số cuộc đối đầu giành chiến thắng)
2. **Tổng số trận cặp thắng** (tổng số trận theo Level thắng qua các cuộc đối đầu)
3. **Hiệu số điểm** (Tổng điểm ghi − Tổng điểm thua qua tất cả các Set)
