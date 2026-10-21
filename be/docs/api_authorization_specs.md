# ATS – Server-side RBAC & Authorization API Specification

Tài liệu đặc tả toàn diện về **Authentication, Role-Based Access Control (RBAC)** và **Resource Scope Authorization** cho hệ thống Tuyển dụng Nội bộ (ATS).

---

## 1. Nguyên Tắc Bảo Mật Cốt Lõi

1. **Server-side Authorization bắt buộc**: Mọi request đều được giải mã token tại server, nạp User Roles và Permissions từ database. Không bao giờ tin tưởng role hay userId client tự gửi.
2. **Ngăn chặn triệt để IDOR (Insecure Direct Object Reference)**: Biết ID của candidate, interview, offer hoặc requisition không đồng nghĩa với có quyền truy cập. Server kiểm tra quyền sở hữu và phạm vi (ownership & scope) trước khi thực thi query.
3. **Bảo vệ dữ liệu nhạy cảm của Ứng viên**: Không lộ password hash, CV, số điện thoại, địa chỉ hoặc mức lương kỳ vọng ra ngoài phạm vi quyền hạn cho phép. Interviewer chỉ thấy thông tin cần thiết phục vụ phỏng vấn và đánh giá chuyên môn.
4. **Kiểm toán bất biến (Audit Logging)**: Mọi thao tác nhạy cảm (đăng nhập, thay đổi role, tạo/sửa/xóa hồ sơ, duyệt offer, v.v.) đều được ghi vết tự động.

---

## 2. Danh Mục 7 Roles Hệ Thống

| Mã Role | Tên hiển thị | Trách nhiệm chính |
| :--- | :--- | :--- |
| `CANDIDATE` | Ứng viên | Xem tin tuyển dụng đã đăng tải, nộp hồ sơ, xem lịch phỏng vấn và offer của chính mình. |
| `RECRUITER` | Nhân viên tuyển dụng | Quản lý tin tuyển dụng, pipeline ứng viên, điều phối lịch phỏng vấn, tạo offer. |
| `HIRING_MANAGER` | Trưởng bộ phận | Tạo yêu cầu tuyển dụng bộ phận, xem ứng viên và offer thuộc job của phòng ban mình. |
| `INTERVIEWER` | Người phỏng vấn | Xem hồ sơ ứng viên được phân công phỏng vấn, tạo và nộp đánh giá sau phỏng vấn. |
| `APPROVER` | Người phê duyệt | Xem xét và phê duyệt/từ chối các yêu cầu tuyển dụng và đề xuất offer. |
| `HR_MANAGER` | Trưởng phòng Nhân sự | Quản lý toàn bộ dữ liệu tuyển dụng xuyên suốt tổ chức, xem danh sách user và audit log. |
| `ADMIN` | Quản trị hệ thống | Toàn quyền quản trị hệ thống, quản lý tài khoản, gán role, xem toàn bộ audit log. |

---

## 3. Ma Trận Quyền Nghiệp Vụ (RBAC Matrix)

| Module | Candidate | Interviewer | Hiring Manager | Recruiter | Approver | HR Manager | Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Organization & Position** | – | R | R | R | R | F | F |
| **Recruitment Request** | – | – | W* | W | W* | F | F |
| **Job Posting** | R | – | R | W | R | F | F |
| **Candidate & Pipeline** | R* | R* | R* | F | R | F | F |
| **Interview Schedule** | R* | R* | R* | F | – | F | F |
| **Evaluation** | – | W* | R* | R | R | F | F |
| **Offer & Onboarding** | R* | – | R* | W | W* | F | F |
| **Email & Notification** | R* | R* | R* | F | – | F | F |
| **Reports & Dashboard** | – | – | R* | R* | R | F | F |
| **Users & Audit Logs** | – | – | – | – | – | R | F |

*Quy ước*:
- `F`: Full access (Read, Create, Update, Delete)
- `W`: Write trong phạm vi được giao
- `W*`: Write chỉ trên resource mà user sở hữu hoặc được phân công phê duyệt
- `R`: Read toàn bộ module
- `R*`: Read chỉ trên dữ liệu trong phạm vi / ownership của user
- `–`: Không có quyền truy cập (403 Forbidden)

---

## 4. Đặc Tả Chi Tiết Từng Protected Endpoint

### 4.1. Module Xác Thực (Authentication)

#### `POST /api/auth/login`
- **Auth**: Public
- **Mục đích**: Xác thực người dùng qua email + password, cấp Access Token & Refresh Token.
- **Audit Action**: `LOGIN`
- **Output**: `{ accessToken, refreshToken, user: { id, email, fullName, roles, permissions } }`

#### `POST /api/auth/register`
- **Auth**: Public
- **Mục đích**: Đăng ký tài khoản ứng viên mới (gán mặc định role `CANDIDATE`).
- **Audit Action**: `USER_CREATED`

#### `POST /api/auth/logout`
- **Auth**: Required (`Bearer <token>`)
- **Mục đích**: Thu hồi token (đưa vào blacklist bảng `RevokedToken`).
- **Audit Action**: `LOGOUT`

#### `GET /api/auth/me`
- **Auth**: Required
- **Mục đích**: Trả về danh tính người dùng hiện tại, roles và permissions thực tế từ server.

---

### 4.2. Module Ứng Viên & Hồ Sơ (Candidates)

#### `GET /api/candidates`
- **Auth**: Required
- **Permission**: `candidates:read`
- **Scope Rule**:
  - `ADMIN`, `HR_MANAGER`, `RECRUITER`: Xem toàn bộ danh sách ứng viên.
  - `HIRING_MANAGER`: Chỉ xem ứng viên đã ứng tuyển vào job thuộc bộ phận mình quản lý.
  - `INTERVIEWER`: Chỉ xem ứng viên của các buổi phỏng vấn mà mình được phân công.
  - `CANDIDATE`: Chỉ xem hồ sơ của chính mình.
- **Data Protection**: Ẩn `expectedSalary`, `address`, mask số điện thoại đối với Interviewer.

#### `GET /api/candidates/:id`
- **Auth**: Required
- **Permission**: `candidates:read`
- **Scope Rule**:
  - `ADMIN`, `HR_MANAGER`, `RECRUITER`, `APPROVER`: Allowed.
  - `HIRING_MANAGER`: Allowed nếu ứng viên đã nộp đơn vào job do HM hoặc phòng ban của HM quản lý.
  - `INTERVIEWER`: Allowed nếu được phân công phỏng vấn ứng viên này.
  - `CANDIDATE`: Allowed nếu `candidate.userId === req.user.id`.
- **Denied**: Trả về `403 Forbidden` (`FORBIDDEN_SCOPE`) nếu ngoài phạm vi.
- **Audit Action**: `CANDIDATE_VIEWED`

#### `GET /api/candidates/:id/cv`
- **Auth**: Required
- **Permission**: `candidates:read`
- **Scope Rule**: Áp dụng chung logic kiểm tra quyền của `GET /api/candidates/:id`. Không cho phép tải CV nếu không nằm trong danh sách được phân công.

#### `POST /api/candidates`
- **Auth**: Required
- **Permission**: `candidates:create`
- **Allowed Roles**: `CANDIDATE`, `RECRUITER`, `HR_MANAGER`, `ADMIN`.
- **Bảo vệ danh tính**: Nếu user là `CANDIDATE`, server bắt buộc gán `userId = req.user.id` (bỏ qua mọi `userId` client cố ý giả mạo trong request body).
- **Audit Action**: `CANDIDATE_CREATED`

#### `PUT /api/candidates/:id`
- **Auth**: Required
- **Permission**: `candidates:update`
- **Allowed**: `ADMIN`, `HR_MANAGER`, `RECRUITER`, và `CANDIDATE` (chỉ sửa hồ sơ chính mình).
- **Audit Action**: `CANDIDATE_UPDATED`

#### `DELETE /api/candidates/:id`
- **Auth**: Required
- **Permission**: `candidates:delete`
- **Allowed**: `ADMIN`, `HR_MANAGER`, `RECRUITER`.
- **Denied**: Tất cả các role khác (403 Forbidden).
- **Audit Action**: `CANDIDATE_DELETED`

---

### 4.3. Module Yêu Cầu Tuyển Dụng (Requisitions)

#### `GET /api/requisitions`
- **Auth**: Required
- **Permission**: `requisitions:read`
- **Scope**:
  - `HIRING_MANAGER`: Chỉ xem requisition của phòng ban mình.
  - `RECRUITER`, `APPROVER`, `HR_MANAGER`, `ADMIN`: Xem toàn bộ hoặc danh sách được giao.
  - `CANDIDATE`, `INTERVIEWER`: Bị chặn (403 Forbidden).

#### `POST /api/requisitions`
- **Auth**: Required
- **Permission**: `requisitions:create`
- **Scope**:
  - `HIRING_MANAGER`: Chỉ được tạo yêu cầu tuyển dụng cho chính phòng ban của mình (`departmentId === req.user.departmentId`). Tạo cho phòng ban khác sẽ bị từ chối 403.
  - `RECRUITER`, `HR_MANAGER`, `ADMIN`: Allowed.
- **Audit Action**: `REQUISITION_CREATED`

#### `POST /api/requisitions/:id/approve`
- **Auth**: Required
- **Permission**: `requisitions:approve`
- **Scope**:
  - `APPROVER`: Phê duyệt yêu cầu tuyển dụng nếu là người duyệt được chỉ định (`approverId === req.user.id`).
  - `HR_MANAGER`, `ADMIN`: Allowed.
  - Các role khác: Bị từ chối (403 Forbidden).
- **Audit Action**: `REQUISITION_APPROVED` hoặc `REQUISITION_REJECTED`

---

### 4.4. Module Tin Tuyển Dụng (Job Postings)

#### `GET /api/jobs`
- **Auth**: Required
- **Permission**: `jobs:read`
- **Scope**:
  - `CANDIDATE`: Chỉ xem các job có `status: 'PUBLISHED'`.
  - `HIRING_MANAGER`: Xem các job thuộc bộ phận của mình.
  - `RECRUITER`, `APPROVER`, `HR_MANAGER`, `ADMIN`: Xem toàn bộ.

#### `POST /api/jobs`
- **Auth**: Required
- **Permission**: `jobs:create`
- **Allowed Roles**: `RECRUITER`, `HR_MANAGER`, `ADMIN`.

#### `POST /api/job-posting-drafts` (SCRUM-103)
- **Auth**: Required
- **Permission**: `jobs:create`
- **Allowed Roles**: `RECRUITER`, `HR_MANAGER`, `ADMIN`.
- **Mục đích**: Soạn bản nháp tin tuyển dụng từ một Requisition đã duyệt (`status: 'APPROVED'`).

#### `GET /api/jobs/:id/preview` (SCRUM-105)
- **Auth**: Required
- **Permission**: `jobs:read`
- **Scope**:
  - `HR_MANAGER`, `ADMIN`: Xem trước mọi tin tuyển dụng.
  - `RECRUITER`: Xem trước tin tuyển dụng do mình phụ trách.
  - `HIRING_MANAGER`: Xem trước tin tuyển dụng thuộc bộ phận mình.
  - `CANDIDATE`, `INTERVIEWER`: Bị từ chối (403 Forbidden).
- **Mục đích**: Xem trước giao diện công khai trước khi xuất bản, bao gồm chi tiết tin tuyển dụng, dải lương theo cấu hình `showSalary` và thông tin thương hiệu công ty (`CompanyProfile`).

#### `POST /api/jobs/:id/approve` (SCRUM-105)
- **Auth**: Required
- **Permission**: `jobs:approve`
- **Allowed Roles**: `HR_MANAGER`, `ADMIN`.
- **Mục đích**: Trưởng phòng Nhân sự duyệt tin tuyển dụng, chuyển trạng thái sang `APPROVED`, ghi nhận `approvedById`, `approvedAt`, `approvalNotes`.
- **Audit Action**: `JOB_POSTING_APPROVED`

#### `POST /api/jobs/:id/reject` (SCRUM-105)
- **Auth**: Required
- **Permission**: `jobs:approve`
- **Allowed Roles**: `HR_MANAGER`, `ADMIN`.
- **Mục đích**: Trưởng phòng Nhân sự từ chối tin tuyển dụng kèm lý do bắt buộc, chuyển trạng thái sang `REJECTED`, ghi nhận `rejectionReason`.
- **Audit Action**: `JOB_POSTING_REJECTED`

#### `POST /api/jobs/:id/publish` (SCRUM-105)
- **Auth**: Required
- **Permission**: `jobs:publish`
- **Allowed Roles**: `HR_MANAGER`, `ADMIN` (để bảo đảm chuẩn thương hiệu công ty).
- **Điều kiện nghiêm ngặt**: Tin tuyển dụng bắt buộc phải qua phê duyệt (`status === 'APPROVED'`). Nếu chưa duyệt sẽ bị từ chối `400 INVALID_STATUS`.
- **Mục đích**: Xuất bản tin tuyển dụng công khai, chuyển trạng thái sang `PUBLISHED`, ghi nhận `publishedById` và `publishedAt`.
- **Audit Action**: `JOB_POSTING_PUBLISHED`

#### `POST /api/jobs/:id/unpublish` & `POST /api/jobs/:id/close` (SCRUM-105)
- **Auth**: Required
- **Permission**: `jobs:publish`
- **Allowed Roles**: `HR_MANAGER`, `ADMIN`.
- **Mục đích**: Gỡ tin khỏi hiển thị công khai, chuyển trạng thái sang `CLOSED`.
- **Audit Action**: `JOB_POSTING_CLOSED`

#### `GET /api/public/jobs` (SCRUM-116)
- **Auth**: Public (Không yêu cầu đăng nhập / Anonymous).
- **Mục đích**: Ứng viên và khách vãng lai xem danh sách việc làm đang tuyển dụng công khai.
- **Quy tắc nghiệp vụ**:
  - Chỉ trả về tin có `status === 'PUBLISHED'`, đã được duyệt (`approvedAt != null`) và đã xuất bản (`publishedAt != null`).
  - Chỉ trả về tin còn hạn tuyển dụng (`applicationDeadline == null` hoặc `applicationDeadline >= now()`).
- **Query Parameters**:
  - `department` (chuỗi tên/mã phòng ban hoặc UUID) / `departmentId` (UUID): Lọc theo phòng ban.
  - `location` (chuỗi): Lọc theo địa điểm làm việc.
  - `workMode` / `employmentType` (`ONSITE` | `HYBRID` | `REMOTE`): Lọc theo hình thức làm việc.
  - `keyword` / `search` / `q` (chuỗi): Tìm kiếm từ khóa xuất hiện trong tiêu đề hoặc mô tả công việc.
  - `page` (số nguyên >= 1), `limit` (số nguyên 1..100), `offset` (số nguyên >= 0): Phân trang kết quả.
  - `paginate=true`: Định dạng trả về object phân trang `{ items, total, page, limit, totalPages }`. Mặc định trả về danh sách mảng `Job[]`.
- **Bảo vệ dữ liệu nội bộ**: Không trả về `approvedById`, `publishedById`, `approvalNotes`, `rejectionReason`, `hiringManagerId`, `recruiterId`.

#### `GET /api/public/jobs/:id` (S3-10 & SCRUM-116)
- **Auth**: Public (Không yêu cầu đăng nhập).
- **Mục đích**: Xem chi tiết nội dung tin tuyển dụng công khai và thương hiệu công ty (`CompanyProfile`).
- **Điều kiện hiển thị**: Tin tuyển dụng phải ở trạng thái `PUBLISHED` và còn hạn tuyển dụng.

---

### 4.5. Module Lịch Phỏng Vấn (Interviews)

#### `GET /api/interviews`
- **Auth**: Required
- **Permission**: `interviews:read`
- **Scope**:
  - `INTERVIEWER`: Chỉ xem các buổi phỏng vấn mà mình là interviewer (`interviewerId === req.user.id`).
  - `CANDIDATE`: Chỉ xem lịch phỏng vấn của hồ sơ chính mình.
  - `HIRING_MANAGER`: Chỉ xem phỏng vấn các vị trí thuộc phòng ban mình.
  - `RECRUITER`, `HR_MANAGER`, `ADMIN`: Xem toàn bộ.

#### `POST /api/interviews`
- **Auth**: Required
- **Permission**: `interviews:create`
- **Allowed Roles**: `RECRUITER`, `HR_MANAGER`, `ADMIN`.
- **Audit Action**: `INTERVIEW_CREATED`

---

### 4.6. Module Đánh Giá Phỏng Vấn (Evaluations)

#### `GET /api/evaluations/:id`
- **Auth**: Required
- **Permission**: `evaluations:read`
- **Allowed**:
  - `INTERVIEWER`: Xem đánh giá do chính mình tạo.
  - `HIRING_MANAGER`: Xem đánh giá của ứng viên nộp vào job của bộ phận mình.
  - `RECRUITER`, `APPROVER`, `HR_MANAGER`, `ADMIN`: Allowed.
- **Tuyệt đối cấm**: `CANDIDATE` không bao giờ được phép xem nội dung đánh giá nội bộ (403 Forbidden).

#### `POST /api/evaluations`
- **Auth**: Required
- **Permission**: `evaluations:create`
- **Scope**: `INTERVIEWER` chỉ được tạo đánh giá cho buổi phỏng vấn mà mình được phân công.
- **Audit Action**: `EVALUATION_CREATED`

---

### 4.7. Module Đề Xuất Tuyển Dụng & Offer (Offers)

#### `GET /api/offers` & `GET /api/offers/:id`
- **Auth**: Required
- **Permission**: `offers:read`
- **Scope**:
  - `CANDIDATE`: Chỉ xem được offer của chính mình sau khi đã được duyệt (`status IN ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED']`).
  - `HIRING_MANAGER`: Xem offer cho các vị trí thuộc phòng ban mình.
  - `APPROVER`: Xem offer để duyệt.
  - `RECRUITER`, `HR_MANAGER`, `ADMIN`: Allowed.
  - `INTERVIEWER`: Bị cấm xem offer (403 Forbidden).
- **Data Protection**: Ghi chú nội bộ (`internalNotes`) bị ẩn khi `CANDIDATE` xem offer.

#### `POST /api/offers/:id/approve`
- **Auth**: Required
- **Permission**: `offers:approve`
- **Allowed**: `APPROVER`, `HR_MANAGER`, `ADMIN`.
- **Audit Action**: `OFFER_APPROVED` hoặc `OFFER_REJECTED`

---

### 4.8. Module Quản Trị Người Dùng & Phân Quyền (Users)

#### `GET /api/users`
- **Auth**: Required
- **Permission**: `users:read`
- **Allowed Roles**: `ADMIN`, `HR_MANAGER`.
- **Data Protection**: Trường `passwordHash` bị loại bỏ hoàn toàn khỏi kết quả query.

#### `POST /api/users`
- **Auth**: Required
- **Permission**: `users:create`
- **Allowed Roles**: `ADMIN` duy nhất.
- **Audit Action**: `USER_CREATED`

#### `PUT /api/users/:id/roles`
- **Auth**: Required
- **Permission**: `roles:update`
- **Allowed Roles**: `ADMIN` duy nhất.
- **Phòng chống Privilege Escalation**: Không một role nào khác ngoài ADMIN có thể tự cấp role hoặc thay đổi role của người khác.
- **Audit Action**: `ROLE_CHANGED`

#### `PATCH /api/users/:id/disable`
- **Auth**: Required
- **Permission**: `users:disable`
- **Allowed Roles**: `ADMIN` duy nhất (không được tự khóa chính mình).
- **Audit Action**: `USER_DISABLED`

---

### 4.9. Module Nhật Ký Kiểm Toán (Audit Logs)

#### `GET /api/audit-logs`
- **Auth**: Required
- **Permission**: `audit_logs:read`
- **Allowed Roles**:
  - `ADMIN`: Toàn quyền đọc.
  - `HR_MANAGER`: Xem nhật ký.
- **Denied**: Tất cả 5 role còn lại đều nhận `403 Forbidden`.
- **Tính bất biến**: Không cung cấp endpoint sửa (PUT) hoặc xóa (DELETE) nhật ký kiểm toán.
