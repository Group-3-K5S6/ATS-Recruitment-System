# Backend S1-02 – Phiên đăng nhập và đăng xuất

Phạm vi API đang được mount trên nhánh `feature/be-s1-02` chỉ gồm quản lý phiên: đăng nhập, gia hạn token, đăng xuất, kiểm tra phiên và health check. Các API nghiệp vụ khác không khả dụng trên nhánh này.

## API

Chi tiết request/response nằm trong [`docs/api_authorization_specs.md`](docs/api_authorization_specs.md).

| Method | Endpoint | Mục đích |
|---|---|---|
| `POST` | `/api/auth/login` | Đăng nhập, cấp access token và refresh token |
| `POST` | `/api/auth/refresh` | Xoay refresh token và cấp cặp token mới |
| `POST` | `/api/auth/logout` | Thu hồi access token và refresh token của phiên |
| `GET` | `/api/auth/me` | Xác nhận phiên và lấy thông tin người dùng |
| `GET` | `/health` | Health check |

## Chạy backend

```powershell
npm install
npm run prisma:push
npm run prisma:seed
npm run build
npm start
```

Mặc định server chạy tại cổng `4000`. Có thể cấu hình cổng và JWT secrets bằng các biến môi trường tương ứng trong `src/config/env.ts`.
