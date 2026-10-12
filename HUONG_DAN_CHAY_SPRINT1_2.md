# ATS — Hướng dẫn tích hợp và chạy Sprint 1 & 2

## 1. Trước khi hợp nhất vào `develop`

- Mã nguồn sửa được đóng gói từ bản snapshot của thành viên vào ngày 10/10/2026. Không ghi đè code mới của đồng đội: kiểm tra `git status`, `git fetch`, tạo nhánh riêng, áp bản vá bằng `git apply --check` trước.
- Không đưa `.env`, SQLite `.db`, `node_modules`, file backup và ZIP lên Git.
- Trước khi sửa Database thật, dừng Backend và **sao lưu** SQLite (gồm `-wal`/`-shm` nếu có). KHÔNG chạy `migrate reset`, `db push --accept-data-loss`, hoặc `npm run setup` trên DB thật.
- Có thay đổi schema trong `be/prisma/schema.prisma`, migration tham khảo `be/prisma/migrations/20261010_sprint12_catalog_company/migration.sql`. DB đang dùng từng thiếu cột `Requisition.jobTitleId`; cần kiểm tra riêng trước khi cập nhật.

## 2. Máy mới: cài từ repo với DB demo RIÊNG (không có dữ liệu cá nhân thực tế)

Cần Node.js/npm, git. Clone nhánh đã merge, rồi mở 2 Terminal ở gốc dự án:

**Terminal Backend (Windows PowerShell)**

```powershell
cd be
npm ci
Copy-Item .env.example .env
# MỞ .env, thay cả hai JWT_SECRET bằng chuỗi bí mật đủ mạnh; cấu hình SMTP nếu cần email thật.
npx prisma generate
# Chỉ chạy 2 lệnh tiếp theo khi đây là bản clone mới, KHÔNG có DB cần giữ dữ liệu.
npx prisma db push
npm run prisma:seed
npm run dev
```

**Terminal Frontend**

```powershell
cd fe
npm ci
npm run dev
```

Vite thường mở ở `http://localhost:5173` và Backend mặc định ở `http://localhost:4000`. Bản sao DB SQLite tại `be/prisma/ats.db` phải được tạo trên từng máy. Seed tạo các tài khoản demo `@ats.local` với mật khẩu mẫu dùng **chỉ cho phát triển**, cần đổi trước khi chia sẻ môi trường hoặc dùng dữ liệu thật.

## 3. Máy đã có SQLite và dữ liệu thật

Không chạy lại seed hay db push ngay. Sau backup đầy đủ, kiểm tra thay đổi cấu trúc:

```powershell
cd be
npm ci
npx prisma generate
node scripts/check-sprint12-db.cjs
```

Nếu báo cột/bảng thiếu, **dừng lại**: cần lập kế hoạch cập nhật schema phù hợp dữ liệu cũ, nhất là `Requisition.jobTitleId`, `CompanyProfile.logoData/bannerData`, bảng `RecruitmentCategory`. Migration SQL đi kèm không đủ để tự chữa mọi trường hợp DB bị lệch.

## 4. Kiểm thử trước khi merge

- Backend: `cd be; npm run build`
- Frontend: `cd fe; npm run build`
- Test RBAC: `cd be; npx vitest run tests/rbac-matrix.test.ts` **chỉ với DB demo/test độc lập**, không dùng DB thật.
- Test bổ sung: `npx vitest run tests/sprint12-regression.test.ts` **chỉ trên DB test độc lập**; test có ghi dữ liệu.
- Thử thủ công S1-01..S1-10, S2-01..S2-10 theo báo cáo `BAO_CAO_RASOAT_SPRINT_1_2.md`, đặc biệt email SMTP, lưu hồ sơ, nhập Excel, upload ảnh, tạo yêu cầu, danh mục, phân quyền và màn hình 360px.

## 5. Bàn giao nhóm

Push lên nhánh `fix/sprint1-2-review`, mở Pull Request vào `develop`, review, xác nhận CI/build/test và kế hoạch schema. Chỉ sau merge mới cho các thành viên `git pull origin develop`, `npm ci` và làm theo mục 2 hoặc 3 theo trạng thái DB. **Git không đồng bộ dữ liệu SQLite thực tế** vì tệp DB bị loại trừ để bảo vệ dữ liệu.
