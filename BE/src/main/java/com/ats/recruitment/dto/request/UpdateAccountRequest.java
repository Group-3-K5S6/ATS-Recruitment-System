package com.ats.recruitment.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Set;

/**
 * DTO cho Admin cập nhật tài khoản nội bộ.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateAccountRequest {

    @Email(message = "Email không hợp lệ")
    private String email;

    @Size(max = 100, message = "Họ tên tối đa 100 ký tự")
    private String fullName;

    private String phoneNumber;

    private String department;

    private String position;

    /** Trạng thái: ACTIVE, INACTIVE, LOCKED */
    private String status;

    /** Danh sách vai trò mới (nếu cần cập nhật) */
    private Set<String> roles;
}
