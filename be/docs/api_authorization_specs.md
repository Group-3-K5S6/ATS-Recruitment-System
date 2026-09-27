# BE S1-02 – Phiên đăng nhập và đăng xuất

Nhánh này chỉ đăng ký các API phục vụ đăng nhập, gia hạn phiên, đăng xuất và xác thực phiên hiện tại. Các route nghiệp vụ khác không được mount trong Express app.

## `POST /api/auth/login`

- Auth: Public.
- Body: `{ "email": "...", "password": "..." }`.
- Response `data`: `{ accessToken, refreshToken, user }`.

## `POST /api/auth/refresh`

- Auth: Public.
- Body: `{ "refreshToken": "..." }`.
- Refresh token còn hạn, chưa bị thu hồi và thuộc tài khoản đang hoạt động thì được chấp nhận.
- Token refresh cũ bị thu hồi; response `data` chứa cặp access token và refresh token mới.
- Token không hợp lệ, hết hạn hoặc đã bị thu hồi trả `401`.

## `POST /api/auth/logout`

- Auth: Required (`Authorization: Bearer <accessToken>`).
- Body: `{ "refreshToken": "..." }`.
- Access token hiện tại bị thu hồi ngay. Refresh token hợp lệ thuộc cùng user cũng bị thu hồi để phiên không thể gia hạn tiếp.
- Response `data`: `{ "message": "Logged out successfully" }`.

## `GET /api/auth/me`

- Auth: Required (`Authorization: Bearer <accessToken>`).
- Trả thông tin user và roles từ phiên đã xác thực; token hết hạn hoặc bị thu hồi trả `401`.

## Health check

- `GET /health` trả `{ "status": "ok", "timestamp": "..." }`.
