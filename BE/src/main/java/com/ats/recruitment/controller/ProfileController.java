package com.ats.recruitment.controller;

import com.ats.recruitment.dto.request.UpdateProfileRequest;
import com.ats.recruitment.dto.response.ApiResponse;
import com.ats.recruitment.dto.response.UserResponse;
import com.ats.recruitment.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * REST Controller cho hồ sơ cá nhân:
 * - GET  /api/profile     → Xem hồ sơ
 * - PUT  /api/profile     → Cập nhật hồ sơ
 *
 * Yêu cầu xác thực (mọi vai trò).
 */
@RestController
@RequestMapping("/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final UserService userService;

    /**
     * Xem hồ sơ cá nhân của người dùng hiện tại.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<UserResponse>> getMyProfile(
            @AuthenticationPrincipal UserDetails userDetails) {
        UserResponse profile = userService.getProfile(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Lấy hồ sơ thành công", profile));
    }

    /**
     * Cập nhật hồ sơ cá nhân.
     * Chỉ cho phép sửa: họ tên, SĐT, avatar, ngày sinh, địa chỉ.
     */
    @PutMapping
    public ResponseEntity<ApiResponse<UserResponse>> updateMyProfile(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody UpdateProfileRequest request) {
        UserResponse profile = userService.updateProfile(userDetails.getUsername(), request);
        return ResponseEntity.ok(ApiResponse.success("Cập nhật hồ sơ thành công", profile));
    }
}
