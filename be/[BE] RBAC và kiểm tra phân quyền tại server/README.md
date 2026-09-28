# Backend EP-01 — Tài khoản, phân quyền và hồ sơ

Backend Express + TypeScript + Prisma/SQLite. API mặc định chạy ở `http://localhost:4000`; FE Vite chạy ở `http://localhost:5173`.

## Khởi động

Tại thư mục `ATS-Recruitment-System`, cài package cho FE và BE một lần:

```powershell
npm install --prefix fe
npm install --prefix "be/[BE] RBAC và kiểm tra phân quyền tại server"
npm run dev
```

Lệnh `npm run dev` tạo Prisma Client, đồng bộ SQLite, nạp vai trò/quyền và khởi động cả FE lẫn BE. Có thể chạy chuẩn bị database riêng bằng `npm run setup:be`. Muốn chạy từng phần, dùng `npm run dev:fe` hoặc `npm run dev:be`. Khi chạy BE riêng lần đầu, sao chép `.env.example` thành `.env`, sau đó chạy `npm run prisma:generate`, `npm run prisma:push`, `npm run prisma:seed` trước `npm run dev`.

Tài khoản quản trị development mặc định là `admin@ats.local` / `Password123!`. Có thể cấu hình trong `.env` backend bằng `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD`. Đổi mật khẩu mặc định trước khi dùng dữ liệu thật. Backend từ chối khởi động production nếu chưa đặt JWT secrets riêng.

## API EP-01

- `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/forgot-password`, `POST /api/auth/verify-reset-code`, `POST /api/auth/reset-password`
- `GET /api/users/me`, `PATCH /api/users/me`, `PUT /api/users/me/password`
- `GET /api/users`, `POST /api/users`, `PUT /api/users/:id/roles`, `PATCH /api/users/:id/disable`
- `GET /api/audit-logs` (phân trang bằng `page` và `limit`)

Các API riêng tư dùng `Authorization: Bearer <accessToken>`. Cấp quyền dựa trên role/permission đã lưu trong database, không lấy role từ request body. Access token sống 15 phút, refresh token mặc định 7 ngày và được xoay vòng một lần. Đổi/khôi phục mật khẩu làm mất hiệu lực tất cả phiên cũ. Mật khẩu được băm bcrypt; OTP reset được băm, hết hạn sau 30 phút và giới hạn 5 lần thử.

Môi trường này chưa cấu hình nhà cung cấp email. Trong development, `forgot-password` trả về `previewCode` để tích hợp giao diện; production chỉ trả thông báo chung. Trước production, cần nối hàm tạo OTP với dịch vụ email. Không trả OTP trong môi trường production.

Vai trò hệ thống: `CANDIDATE`, `RECRUITER`, `HIRING_MANAGER`, `INTERVIEWER`, `HR_MANAGER`, `APPROVER`, `ADMIN`. Chỉ `ADMIN` được tạo tài khoản nội bộ, thay đổi vai trò và vô hiệu hóa tài khoản; HR Manager được xem danh sách user và audit log.
