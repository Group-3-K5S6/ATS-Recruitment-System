package com.ats.recruitment.controller;

import com.ats.recruitment.dto.request.*;
import com.ats.recruitment.dto.response.ApiResponse;
import com.ats.recruitment.dto.response.JwtResponse;
import com.ats.recruitment.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * REST Controller cho xác thực:
 * - POST /api/auth/login          → Đăng nhập
 * - POST /api/auth/forgot-password → Quên mật khẩu
 * - POST /api/auth/reset-password  → Đặt lại mật khẩu
 * - POST /api/auth/change-password → Đổi mật khẩu (cần đăng nhập)
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * Đăng nhập.
     * Public API - không cần xác thực.
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<JwtResponse>> login(@Valid @RequestBody LoginRequest request) {
        JwtResponse jwtResponse = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success("Đăng nhập thành công", jwtResponse));
    }

    /**
     * Quên mật khẩu - gửi email khôi phục.
     * Public API - không cần xác thực.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(ApiResponse.success(
                "Nếu email tồn tại trong hệ thống, bạn sẽ nhận được email hướng dẫn khôi phục mật khẩu."));
    }

    /**
     * Đặt lại mật khẩu từ token email.
     * Public API - không cần xác thực.
     */
    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(ApiResponse.success("Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại."));
    }

    /**
     * Đổi mật khẩu (khi đã đăng nhập).
     * Yêu cầu xác thực.
     */
    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(userDetails.getUsername(), request);
        return ResponseEntity.ok(ApiResponse.success("Đổi mật khẩu thành công."));
    }
}
