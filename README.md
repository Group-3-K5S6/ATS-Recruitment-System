# ATS-Recruitment-System
Hệ thống tuyển dụng nội bộ (ATS) hỗ trợ quản lý toàn bộ quy trình tuyển dụng.
## 1. Giới thiệu dự án

### 1.1. Bối cảnh

Hiện tại bộ phận Nhân sự đang thực hiện tuyển dụng bằng Excel, Gmail và Google Drive.

Các yêu cầu tuyển dụng được duyệt qua email hoặc chat, CV nằm rải rác trong hộp thư của từng recruiter, lịch phỏng vấn được hẹn thủ công qua điện thoại và nhận xét sau phỏng vấn được ghi theo nhiều cách khác nhau.

Điều này dẫn đến nhiều vấn đề:

- Không biết chính xác một vị trí tuyển dụng đang bị tắc ở bước nào.
- Không có đầy đủ bằng chứng về việc ai đã duyệt headcount và mức lương nào.
- CV của ứng viên tốt có thể bị bỏ quên khi mở lại vị trí tương tự.
- Nhận xét phỏng vấn không đồng nhất và khó so sánh giữa các ứng viên.
- Ứng viên không biết trạng thái hồ sơ và nhiều hồ sơ trượt không nhận được phản hồi.

### 1.2. Giải pháp

ATS là hệ thống quản lý tuyển dụng nội bộ trên nền web, giúp theo dõi trọn vòng đời tuyển dụng trên một nguồn dữ liệu duy nhất, từ yêu cầu headcount tới ngày nhận việc.

Mọi quyết định quan trọng như duyệt headcount, loại ứng viên và chốt offer đều có dấu vết, có tiêu chí và có thể truy lại.

---

## 2. Tầm nhìn sản phẩm

**CHO** bộ phận Nhân sự và các trưởng bộ phận đang tuyển người bằng Excel, Gmail và Drive,

**ATS LÀ** hệ thống quản lý tuyển dụng nội bộ trên nền web,

**GIÚP** theo dõi trọn vòng đời tuyển dụng trên một nguồn dữ liệu duy nhất, từ yêu cầu headcount tới ngày nhận việc,

**KHÁC VỚI** cách làm hiện tại ở chỗ mọi quyết định — duyệt headcount, loại ứng viên, chốt offer — đều có dấu vết, có tiêu chí và có thể truy lại.

---

## 3. Mục tiêu dự án

Dự án hướng tới các mục tiêu chính:

- Quản lý tập trung toàn bộ dữ liệu tuyển dụng.
- Quản lý tài khoản và phân quyền theo vai trò.
- Quản lý phòng ban, chức danh, dải lương và khung năng lực.
- Quản lý yêu cầu tuyển dụng và luồng phê duyệt nhiều cấp.
- Quản lý tin tuyển dụng và cổng ứng tuyển công khai.
- Quản lý hồ sơ ứng viên và pipeline tuyển dụng.
- Hỗ trợ đặt lịch phỏng vấn và đánh giá ứng viên.
- Quản lý quyết định tuyển dụng, offer và onboarding.
- Tự động hóa email và thông báo.
- Cung cấp dashboard và báo cáo tuyển dụng.

---

## 4. Thông số dự án

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Thời gian | 8 tuần (2 tháng) | Không có Sprint 0 riêng; công việc setup nằm trong Sprint 1 |
| Số Sprint | 8 Sprint × 1 tuần | Nhịp ngắn, cần chẻ nhỏ Story 8 Point thành API + UI |
| Velocity mục tiêu | 42 – 45 Point / Sprint | Là mục tiêu, không phải dự báo; hiệu chỉnh lại sau Sprint 2 |
| Tổng Story Point | 350 Point | 42 + 45 + 44 + 45 + 45 + 43 + 42 + 44 |
| Số User Story | 76 Story | Trung bình 9.5 Story / Sprint |
| Số Epic | 9 Epic | |
| Đội ngũ | 5 người fullstack, full-time | 40 giờ/tuần/người |
| Quy đổi Point | 1 Point ≈ 4 giờ công | ~170 giờ hữu ích/tuần sau khi trừ họp và code review |

---

# 5. User Roles

Hệ thống gồm **7 vai trò**:

| # | Vai trò | Mã | Là ai trong doanh nghiệp | Mục tiêu chính |
|---|---|---|---|---|
| 1 | **Ứng viên** | Candidate | Người nộp hồ sơ từ bên ngoài, không có tài khoản nội bộ | Nộp CV, theo dõi trạng thái hồ sơ, xác nhận lịch phỏng vấn và phản hồi offer |
| 2 | **Nhân viên tuyển dụng** | Recruiter | Người vận hành tuyển dụng hằng ngày | Sàng lọc CV, điều phối pipeline, đặt lịch phỏng vấn, soạn offer |
| 3 | **Trưởng bộ phận** | Hiring Manager | Người cần người, sở hữu vị trí tuyển dụng | Tạo yêu cầu tuyển dụng, xem ứng viên của vị trí mình, quyết định tuyển |
| 4 | **Người phỏng vấn** | Interviewer | Nhân sự được mời tham gia một vòng phỏng vấn | Xem lịch, đọc CV, nộp phiếu đánh giá theo khung năng lực |
| 5 | **Trưởng phòng Nhân sự** | HR Manager | Chủ sở hữu toàn bộ hoạt động tuyển dụng | Giám sát tất cả vị trí, phân công recruiter, theo dõi ngân sách headcount và báo cáo |
| 6 | **Người duyệt** | Approver | Ban giám đốc hoặc cấp duyệt theo hạn mức | Phê duyệt yêu cầu tuyển dụng và offer vượt hạn mức lương |
| 7 | **Quản trị hệ thống** | Admin | Người vận hành ứng dụng | Quản lý tài khoản, vai trò, danh mục dùng chung, xem nhật ký hệ thống |

---

# 6. Ma trận phân quyền

### Quy ước

- **F** = Toàn quyền
- **W** = Ghi trong phạm vi được giao
- **R** = Chỉ xem
- **–** = Không truy cập
- **\*** = Chỉ trên dữ liệu của chính mình, vị trí mình sở hữu hoặc vòng phỏng vấn mình tham gia.

Với hồ sơ ứng viên, quyền truy cập là ràng buộc bảo vệ dữ liệu cá nhân và bắt buộc kiểm tra ở tầng server.

| Module | Candidate | Interviewer | Hiring Manager | Recruiter | Approver | HR Manager | Admin |
|---|---|---|---|---|---|---|---|
| Danh mục tổ chức & vị trí | – | R | R | R | R | F | F |
| Yêu cầu tuyển dụng | – | – | W* | W | W* | F | F |
| Tin tuyển dụng | R | – | R | W | R | F | F |
| Hồ sơ ứng viên & pipeline | R* | R* | R* | F | R | F | F |
| Lịch phỏng vấn | R* | R* | R* | F | – | F | F |
| Phiếu đánh giá | – | W* | R* | R | R | F | F |
| Offer & onboarding | R* | – | R* | W | W* | F | F |
| Email & thông báo | R* | R* | R* | F | – | F | F |
| Báo cáo & dashboard | – | – | R* | R* | R | F | F |
| Người dùng & nhật ký | – | – | – | – | – | R | F |

---

# 7. Phạm vi dự án

## 7.1. Trong phạm vi (In-scope)

- Xác thực, phân quyền theo vai trò, quản trị người dùng nội bộ.
- Danh mục phòng ban, chức danh, khung năng lực.
- Yêu cầu tuyển dụng và luồng phê duyệt nhiều cấp.
- Ngân sách headcount theo phòng ban.
- Soạn và xuất bản tin tuyển dụng.
- Cổng ứng tuyển công khai, nộp CV, tra cứu trạng thái.
- Giới thiệu ứng viên nội bộ (Referral).
- Hồ sơ ứng viên hợp nhất, phát hiện trùng, kho ứng viên tiềm năng.
- Pipeline tuyển dụng dạng Kanban theo giai đoạn.
- Đặt lịch phỏng vấn, phát hiện trùng lịch, thư mời.
- Phiếu đánh giá theo khung năng lực và bảng so sánh ứng viên.
- Đề xuất Offer, duyệt Offer theo hạn mức, checklist Onboarding.
- Email tự động theo giai đoạn và thông báo trong ứng dụng.
- Dashboard và báo cáo tuyển dụng.

## 7.2. Ngoài phạm vi (Out-of-scope)

- Bóc tách CV bằng AI / so khớp ngữ nghĩa JD với hồ sơ.
- Đăng tin tự động sang VietnamWorks, TopCV, LinkedIn.
- Đồng bộ hai chiều với Google Calendar / Outlook.
- Phỏng vấn video trong ứng dụng.
- Bài kiểm tra năng lực trực tuyến, chấm tự động.
- Ký số hợp đồng lao động.
- Quản lý nhân sự sau nhận việc: chấm công, lương, đánh giá định kỳ.
- Ứng dụng di động native.

---

# 8. Các Epic

Dự án gồm **9 Epic**, tổng cộng **76 User Story / 350 Story Point**.

| Mã Epic | Tên Epic | Mục tiêu / Phạm vi | Point | Sprint | Story |
|---|---|---|---:|---|---:|
| EP-01 | Tài khoản, Phân quyền & Hồ sơ | Đăng nhập, khôi phục mật khẩu, mô hình phân quyền theo vai trò, quản trị tài khoản nội bộ và hồ sơ cá nhân | 52 | 1–2 | 13 |
| EP-02 | Danh mục Tổ chức & Vị trí | Phòng ban, chức danh, dải lương, khung năng lực và ngân hàng câu hỏi phỏng vấn | 25 | 2 | 5 |
| EP-03 | Yêu cầu tuyển dụng & Phê duyệt | Requisition, luồng duyệt nhiều cấp, ngân sách headcount, phân công recruiter | 44 | 2–3 | 9 |
| EP-04 | Đăng tin & Cổng ứng tuyển | Soạn và xuất bản tin, trang việc làm công khai, nộp CV, tra cứu trạng thái, rút hồ sơ, giới thiệu nội bộ | 47 | 2–4 | 11 |
| EP-05 | Hồ sơ ứng viên & Pipeline | Hồ sơ hợp nhất, gộp trùng, Kanban theo giai đoạn, sàng lọc, kho ứng viên tiềm năng | 53 | 4–6 | 11 |
| EP-06 | Phỏng vấn & Đánh giá | Đặt lịch đơn lẻ và hàng loạt, chống trùng lịch, thư mời, bộ câu hỏi gợi ý, phiếu đánh giá và quyết định tuyển | 51 | 6–7 | 11 |
| EP-07 | Offer & Onboarding | Đề xuất Offer, duyệt theo hạn mức lương, thư mời nhận việc, xử lý từ chối, checklist ngày đầu | 28 | 7 | 5 |
| EP-08 | Thông báo & Email tự động | Mẫu email theo giai đoạn, thư từ chối hàng loạt, nhật ký thư đã gửi, thông báo và nhắc SLA | 22 | 5, 7, 8 | 6 |
| EP-09 | Báo cáo & Dashboard tuyển dụng | Phễu tuyển dụng, tỷ lệ chuyển đổi, time-to-hire, cost-per-hire, hiệu quả nguồn ứng viên, tiến độ vị trí | 28 | 8 | 5 |
| **TỔNG** | | | **350** | | **76** |

---

# 9. Kế hoạch Sprint

| Sprint | Chủ đề | Kết quả Demo cuối Sprint | Story | Point | Luỹ kế | Còn lại |
|---|---|---|---:|---:|---:|---:|
| 1 | Tài khoản & phân quyền | Bảy vai trò đăng nhập được và chỉ thấy đúng phần việc của mình | 10 | 42 | 42 | 308 |
| 2 | Danh mục tổ chức & vị trí | Sơ đồ tổ chức, khung năng lực và một yêu cầu tuyển dụng đầu tiên | 10 | 45 | 87 | 263 |
| 3 | Phê duyệt & đăng tin | Một headcount đi trọn luồng duyệt rồi thành tin tuyển dụng công khai | 10 | 44 | 131 | 219 |
| 4 | Cổng ứng tuyển | Ứng viên ngoài nộp CV trên điện thoại và tra cứu được trạng thái | 9 | 45 | 176 | 174 |
| 5 | Hồ sơ ứng viên & Pipeline | Recruiter điều phối 20 ứng viên trên một bảng Kanban | 10 | 45 | 221 | 129 |
| 6 | Phỏng vấn & đánh giá | Một buổi phỏng vấn được đặt lịch, gửi thư mời và có phiếu đánh giá | 9 | 43 | 264 | 86 |
| 7 | Offer & onboarding | Một Offer được duyệt, gửi đi và ứng viên chấp nhận | 9 | 42 | 306 | 44 |
| 8 | Thông báo & báo cáo | Dashboard tuyển dụng, báo cáo phễu và time-to-hire | 9 | 44 | 350 | 0 |
| **TỔNG** | | | **76** | **350** | | |

---

# 10. Quy trình tuyển dụng

```text
Yêu cầu tuyển dụng
        ↓
Phê duyệt headcount
        ↓
Soạn và xuất bản tin tuyển dụng
        ↓
Ứng viên nộp hồ sơ
        ↓
Sàng lọc hồ sơ
        ↓
Đặt lịch phỏng vấn
        ↓
Phỏng vấn và đánh giá
        ↓
Quyết định tuyển dụng
        ↓
Đề xuất và phê duyệt Offer
        ↓
Ứng viên phản hồi
        ↓
Onboarding
