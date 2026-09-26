package com.ats.recruitment.controller;

import com.ats.recruitment.dto.request.CreateAccountRequest;
import com.ats.recruitment.dto.request.UpdateAccountRequest;
import com.ats.recruitment.dto.response.ApiResponse;
import com.ats.recruitment.dto.response.UserResponse;
import com.ats.recruitment.entity.enums.AccountStatus;
import com.ats.recruitment.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * REST Controller quản trị tài khoản nội bộ (Admin only):
 * - POST   /api/admin/accounts         → Tạo tài khoản mới
 * - GET    /api/admin/accounts         → Danh sách tài khoản (phân trang, tìm kiếm)
 * - GET    /api/admin/accounts/{id}    → Chi tiết tài khoản
 * - PUT    /api/admin/accounts/{id}    → Cập nhật tài khoản
 * - PATCH  /api/admin/accounts/{id}/deactivate  → Vô hiệu hóa
 * - PATCH  /api/admin/accounts/{id}/activate    → Kích hoạt lại
 * - PATCH  /api/admin/accounts/{id}/reset-password → Reset mật khẩu
 */
@RestController
@RequestMapping("/admin/accounts")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AccountController {

    private final UserService userService;

    /**
     * Tạo tài khoản nội bộ mới.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createAccount(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody CreateAccountRequest request) {
        UserResponse created = userService.createAccount(request, userDetails.getUsername());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("Tạo tài khoản thành công", created));
    }

    /**
     * Danh sách tài khoản với phân trang và tìm kiếm.
     * Hỗ trợ query params: keyword, status, page, size, sort.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<Page<UserResponse>>> listAccounts(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) AccountStatus status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<UserResponse> accounts = userService.searchAccounts(keyword, status, pageable);
        return ResponseEntity.ok(ApiResponse.success("Lấy danh sách tài khoản thành công", accounts));
    }

    /**
     * Chi tiết tài khoản theo ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getAccount(@PathVariable Long id) {
        UserResponse account = userService.getAccountById(id);
        return ResponseEntity.ok(ApiResponse.success("Lấy thông tin tài khoản thành công", account));
    }

    /**
     * Cập nhật tài khoản.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateAccount(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody UpdateAccountRequest request) {
        UserResponse updated = userService.updateAccount(id, request, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Cập nhật tài khoản thành công", updated));
    }

    /**
     * Vô hiệu hóa tài khoản (soft delete).
     */
    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<ApiResponse<Void>> deactivateAccount(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        userService.deactivateAccount(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Đã vô hiệu hóa tài khoản"));
    }

    /**
     * Kích hoạt lại tài khoản.
     */
    @PatchMapping("/{id}/activate")
    public ResponseEntity<ApiResponse<Void>> activateAccount(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        userService.activateAccount(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Đã kích hoạt lại tài khoản"));
    }

    /**
     * Reset mật khẩu cho tài khoản (Admin gán mật khẩu mới).
     */
    @PatchMapping("/{id}/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @PathVariable Long id,
            @RequestParam String newPassword,
            @AuthenticationPrincipal UserDetails userDetails) {
        userService.adminResetPassword(id, newPassword, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Đã reset mật khẩu tài khoản"));
    }
}
