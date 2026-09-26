package com.ats.recruitment.dto.request;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * DTO cho người dùng cập nhật hồ sơ cá nhân.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileRequest {

    @Size(max = 100, message = "Họ tên tối đa 100 ký tự")
    private String fullName;

    @Size(max = 20, message = "Số điện thoại tối đa 20 ký tự")
    private String phoneNumber;

    private String avatarUrl;

    private LocalDate dateOfBirth;

    @Size(max = 500, message = "Địa chỉ tối đa 500 ký tự")
    private String address;
}
