# ATS – Backend Role-Based Access Control (RBAC) & Server-Side Authorization

### Kết nối PostgreSQL

Prisma dùng PostgreSQL. Sao chép `.env.example` thành `.env`, thay `YOUR_PASSWORD` bằng mật khẩu PostgreSQL và đảm bảo database `ats_recruitment` đã tồn tại. Có thể đổi host, port, tên user/database trong `DATABASE_URL`; mã hóa các ký tự đặc biệt trong password theo URL encoding.

```powershell
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

`prisma:push` tạo/cập nhật schema PostgreSQL, còn `prisma:seed` tạo dữ liệu mẫu. Dữ liệu đang có trong file SQLite `prisma/ats.db` không tự động được chuyển sang PostgreSQL.

### Cấu hình gửi OTP đặt lại mật khẩu

Backend gửi OTP qua SMTP. Tạo `be/.env` và cấu hình SMTP trước khi dùng chức năng quên mật khẩu:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@example.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM=ATS <your-account@example.com>
```

Với Gmail, hãy dùng App Password 16 ký tự (không phải mật khẩu đăng nhập Gmail). Có thể nhập các khoảng trắng hiển thị giữa các nhóm ký tự; backend sẽ bỏ khoảng trắng trước khi xác thực SMTP.

Sau khi thêm model OTP, đồng bộ schema và Prisma Client:

```powershell
npm run prisma:generate
npm run prisma:push
```

OTP gồm 6 chữ số, hết hạn sau 10 phút, tối đa 5 lần nhập sai và được lưu dưới dạng hash. Sau khi xác minh, backend cấp reset token dùng một lần để đổi mật khẩu.

Hệ thống phân quyền Backend an toàn, bảo vệ dữ liệu nhân sự, hồ sơ ứng viên, lịch phỏng vấn và đãi ngộ trong hệ thống Quản lý Tuyển dụng Nội bộ (ATS).

---

## 1. Tính Năng & Kiến Trúc Bảo Mật

* **Authentication Context**: Xác thực qua JWT (Access Token + Refresh Token), hỗ trợ cơ chế thu hồi token tức thời (Token Blacklist/Revocation khi Logout).
* **RBAC Permission Model**: Mô hình phân quyền dạng `resource:action` (`candidates:read`, `jobs:publish`, `offers:approve`, v.v.).
* **Ma trận quyền 7 Roles**: Đầy đủ 7 vai trò: `CANDIDATE`, `RECRUITER`, `HIRING_MANAGER`, `INTERVIEWER`, `HR_MANAGER`, `APPROVER`, `ADMIN`.
* **Resource-Level Authorization & Scope**: Tách biệt logic kiểm tra quyền sở hữu qua Policy Layer (`CandidatePolicy`, `JobPolicy`, `RequisitionPolicy`, `InterviewPolicy`, `OfferPolicy`, `UserPolicy`, `ReportPolicy`, `AuditLogPolicy`).
* **Chống IDOR (Insecure Direct Object Reference)**: Kiểm tra quyền sở hữu và phạm vi phòng ban/phân công trước khi trả dữ liệu. Scoped database queries ngăn chặn rò rỉ dữ liệu.
* **Bảo vệ Dữ liệu Nhạy Cảm Ứng Viên**: DTO Sanitizer che giấu mức lương kỳ vọng, địa chỉ, mask số điện thoại đối với Interviewer; không để lộ CV ra ngoài phạm vi; không để lộ password hash trong bất kỳ response nào.
* **Chống Leo Thang Đặc Quyền (Privilege Escalation)**: Chặn việc client gửi kèm role hay giả mạo identity qua body/header; chỉ Admin mới có quyền gán role.
* **Nhật Ký Kiểm Toán Bất Biến (Audit Logging)**: Tự động ghi vết các thao tác nhạy cảm, chỉ có `ADMIN` (Full) và `HR_MANAGER` (Read) được quyền truy cập.

---

## 2. Cấu Trúc Dự Án

```text
├── prisma/
│   ├── schema.prisma            # Schema định nghĩa 15 models (User, Role, Permission, Candidate, Requisition, Job, Interview, Evaluation, Offer, AuditLog, RevokedToken, ...)
│   └── seed.ts                  # Seeder khởi tạo 7 roles, permissions, ma trận quyền và tài khoản mẫu
├── src/
│   ├── config/                  # Cấu hình biến môi trường
│   ├── database/                # Prisma client singleton
│   ├── middleware/
│   │   ├── authenticate.ts      # Xác thực JWT, kiểm tra thu hồi token, nạp user + roles + permissions
│   │   ├── authorize.ts         # Guards requirePermission & requireRole
│   │   ├── audit-logger.ts      # Ghi vết kiểm toán
│   │   ├── error-handler.ts     # Xử lý lỗi an toàn không rò rỉ stack trace
│   │   └── validate.ts          # Zod request validation
│   ├── rbac/
│   │   ├── roles.ts             # Định nghĩa 7 roles tập trung
│   │   ├── permissions.ts       # Định nghĩa permissions theo chuẩn resource:action
│   │   ├── role-permissions.ts  # Ma trận ánh xạ quyền hạn theo tài liệu nghiệp vụ
│   │   └── types.ts             # Kiểu dữ liệu RBAC và Audit Action
│   ├── policies/                # Resource-level scope policies
│   ├── modules/
│   │   ├── auth/                # Đăng nhập, đăng ký ứng viên, refresh, logout, me
│   │   ├── candidates/          # Hồ sơ ứng viên, pipeline, download CV bảo mật
│   │   ├── requisitions/        # Yêu cầu tuyển dụng và phê duyệt
│   │   ├── jobs/                # Quản lý tin tuyển dụng và publishing
│   │   ├── interviews/          # Lịch phỏng vấn
│   │   ├── evaluations/         # Đánh giá sau phỏng vấn
│   │   ├── offers/              # Đề xuất và phê duyệt đãi ngộ
│   │   ├── reports/             # Báo cáo theo phạm vi phòng ban/recruiter
│   │   ├── users/               # Quản lý tài khoản và phân quyền
│   │   └── audit-logs/          # Tra cứu lịch sử kiểm toán
│   ├── app.ts                   # Cấu hình Express app và security headers
│   └── server.ts                # Server bootstrap
├── tests/                       # 7 test suites kiểm thử toàn diện
└── docs/
    └── api_authorization_specs.md # Tài liệu đặc tả API authorization chi tiết
```

---

## 3. Cài Đặt & Khởi Chạy

`be` là backend duy nhất của repo sau khi hợp nhất. Frontend gọi `/api` và Vite chuyển tiếp
request sang `http://localhost:4000` trong môi trường phát triển. Có thể đổi cổng backend
bằng `PORT`, hoặc đặt `VITE_API_BASE_URL` khi frontend gọi API từ môi trường khác.

```powershell
# 1. Cài đặt thư viện
npm install

# 2. Generate Prisma Client
npm run prisma:generate

# 3. Đồng bộ schema PostgreSQL
npm run prisma:push

# 4. Khởi tạo dữ liệu mẫu (Seed 7 roles, permissions, users và kịch bản test)
npm run prisma:seed

# 5. Chạy kiểm thử tự động
npm test

# 6. Build mã nguồn TypeScript
npm run build

# 7. Khởi động server
npm start
```

Sau khi chạy server, `/health` trả `database: "connected"` khi Prisma truy cập được SQLite;
nếu không kết nối được, endpoint trả HTTP 503. Vite cũng proxy `/health` để có thể kiểm tra
backend qua cùng origin frontend.

Các dòng comment `ADDED` trong source đánh dấu phần tích hợp FE–BE, kiểm tra database và cấu hình proxy được thêm khi hợp nhất.

---

## 4. Tài Khoản Thử Nghiệm Mẫu

Mật khẩu mặc định cho tất cả tài khoản là: `Password123!`

| Role | Email |
| :--- | :--- |
| `ADMIN` | `admin@ats.local` |
| `HR_MANAGER` | `hr_manager@ats.local` |
| `RECRUITER` | `recruiter1@ats.local` |
| `HIRING_MANAGER` (Engineering) | `hiring_manager_eng@ats.local` |
| `HIRING_MANAGER` (Marketing) | `hiring_manager_mkt@ats.local` |
| `INTERVIEWER` | `interviewer1@ats.local` |
| `APPROVER` | `approver@ats.local` |
| `CANDIDATE` 1 | `candidate1@ats.local` |
| `CANDIDATE` 2 | `candidate2@ats.local` |
