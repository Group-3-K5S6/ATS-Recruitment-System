# ATS – Backend Role-Based Access Control (RBAC) & Server-Side Authorization

Hệ thống phân quyền Backend an toàn, bảo vệ dữ liệu nhân sự, hồ sơ ứng viên, lịch phỏng vấn và đãi ngộ trong hệ thống Quản lý Tuyển dụng Nội bộ (ATS).

---

## 1. Tính Năng & Kiến Trúc Bảo Mật

* **Authentication Context**: Xác thực qua JWT (Access Token + Refresh Token), hỗ trợ cơ chế thu hồi token tức thời (Token Blacklist/Revocation khi Logout).
* **RBAC Permission Model**: Mô hình phân quyền dạng `resource:action` (`candidates:read`, `jobs:publish`, `offers:approve`, v.v.).
* **Chức danh & dải lương**: CRUD danh mục chức danh, cấp bậc và dải lương; API giới hạn riêng cho `HR_MANAGER`. Job phải gắn với chức danh và offer được kiểm tra trong dải trước khi gửi hoặc duyệt.
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

```powershell
# 1. Cài đặt thư viện
npm install

# 2. Đồng bộ database SQLite và generate Prisma Client
npm run prisma:push

# 3. Khởi tạo dữ liệu mẫu (Seed 7 roles, permissions, users và kịch bản test)
npm run prisma:seed

# 4. Chạy kiểm thử tự động (57 test cases bao quát)
npm test

# 5. Build mã nguồn TypeScript
npm run build

# 6. Khởi động server
npm start
```

---

## API chức danh & dải lương

Các API dưới đây yêu cầu access token của tài khoản có role `HR_MANAGER`; role `ADMIN` không được xem dải lương trừ khi tài khoản đó cũng có role `HR_MANAGER`.

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/api/job-titles/options` | Xem mã, tên, cấp bậc để liên kết job; không trả dải lương (vai trò nội bộ có quyền xem tổ chức) |
| `GET` | `/api/job-titles` | Xem danh mục chức danh và dải lương |
| `POST` | `/api/job-titles` | Tạo chức danh (`code`, `name`, `level`, `minSalary`, `maxSalary`) |
| `PUT` | `/api/job-titles/:id` | Cập nhật thông tin hoặc dải lương |
| `DELETE` | `/api/job-titles/:id` | Xóa chức danh chưa gắn với tin tuyển dụng |

`POST /api/jobs` nhận thêm `jobTitleId` để liên kết tin tuyển dụng với chức danh; `PUT /api/jobs/:id` cũng nhận trường này để gắn chức danh cho job hiện có. `POST /api/offers`, cập nhật lương offer và duyệt offer đều được kiểm tra theo dải đã cấu hình; phản hồi ngoài dải không tiết lộ con số lương cho người không thuộc HR.

Sau khi cập nhật schema, chạy `npm run prisma:push` rồi `npm run prisma:seed` để đồng bộ SQLite và gắn chức danh cho dữ liệu mẫu.

## 5. Tài Khoản Thử Nghiệm Mẫu

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
