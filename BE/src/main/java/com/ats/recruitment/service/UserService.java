package com.ats.recruitment.service;

import com.ats.recruitment.dto.request.CreateAccountRequest;
import com.ats.recruitment.dto.request.UpdateAccountRequest;
import com.ats.recruitment.dto.request.UpdateProfileRequest;
import com.ats.recruitment.dto.response.UserResponse;
import com.ats.recruitment.entity.Role;
import com.ats.recruitment.entity.User;
import com.ats.recruitment.entity.enums.AccountStatus;
import com.ats.recruitment.entity.enums.RoleName;
import com.ats.recruitment.exception.BadRequestException;
import com.ats.recruitment.exception.ResourceNotFoundException;
import com.ats.recruitment.repository.RoleRepository;
import com.ats.recruitment.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Service quản lý người dùng:
 * - Quản trị tài khoản nội bộ (Admin)
 * - Hồ sơ cá nhân
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    // ══════════════════════════════════════════════
    // ══  HỒ SƠ CÁ NHÂN (Profile)
    // ══════════════════════════════════════════════

    /**
     * Lấy thông tin hồ sơ người dùng hiện tại.
     */
    @Transactional(readOnly = true)
    public UserResponse getProfile(String username) {
        User user = findUserByUsername(username);
        return mapToResponse(user);
    }

    /**
     * Cập nhật hồ sơ cá nhân.
     * Người dùng chỉ được sửa: fullName, phoneNumber, avatarUrl, dateOfBirth, address.
     */
    @Transactional
    public UserResponse updateProfile(String username, UpdateProfileRequest request) {
        User user = findUserByUsername(username);

        if (request.getFullName() != null) {
            user.setFullName(request.getFullName());
        }
        if (request.getPhoneNumber() != null) {
            user.setPhoneNumber(request.getPhoneNumber());
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
        }
        if (request.getDateOfBirth() != null) {
            user.setDateOfBirth(request.getDateOfBirth());
        }
        if (request.getAddress() != null) {
            user.setAddress(request.getAddress());
        }

        user.setUpdatedBy(username);
        User saved = userRepository.save(user);

        log.info("Đã cập nhật hồ sơ cho user: {}", username);
        return mapToResponse(saved);
    }

    // ══════════════════════════════════════════════
    // ══  QUẢN TRỊ TÀI KHOẢN NỘI BỘ (Admin)
    // ══════════════════════════════════════════════

    /**
     * Tạo tài khoản nội bộ mới (Admin only).
     */
    @Transactional
    public UserResponse createAccount(CreateAccountRequest request, String createdBy) {
        // Kiểm tra trùng username
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BadRequestException("Tên đăng nhập đã tồn tại: " + request.getUsername());
        }

        // Kiểm tra trùng email
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email đã tồn tại: " + request.getEmail());
        }

        // Parse roles
        Set<Role> roles = parseRoles(request.getRoles());

        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .department(request.getDepartment())
                .position(request.getPosition())
                .status(AccountStatus.ACTIVE)
                .roles(roles)
                .createdBy(createdBy)
                .build();

        User saved = userRepository.save(user);

        // Gửi email thông báo tài khoản mới
        emailService.sendAccountCreatedEmail(
                request.getEmail(),
                request.getUsername(),
                request.getPassword()
        );

        log.info("Admin {} đã tạo tài khoản mới: {}", createdBy, request.getUsername());
        return mapToResponse(saved);
    }

    /**
     * Cập nhật tài khoản nội bộ (Admin only).
     */
    @Transactional
    public UserResponse updateAccount(Long userId, UpdateAccountRequest request, String updatedBy) {
        User user = findUserById(userId);

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new BadRequestException("Email đã tồn tại: " + request.getEmail());
            }
            user.setEmail(request.getEmail());
        }

        if (request.getFullName() != null) {
            user.setFullName(request.getFullName());
        }
        if (request.getPhoneNumber() != null) {
            user.setPhoneNumber(request.getPhoneNumber());
        }
        if (request.getDepartment() != null) {
            user.setDepartment(request.getDepartment());
        }
        if (request.getPosition() != null) {
            user.setPosition(request.getPosition());
        }
        if (request.getStatus() != null) {
            user.setStatus(AccountStatus.valueOf(request.getStatus()));
        }
        if (request.getRoles() != null && !request.getRoles().isEmpty()) {
            user.setRoles(parseRoles(request.getRoles()));
        }

        user.setUpdatedBy(updatedBy);
        User saved = userRepository.save(user);

        log.info("Admin {} đã cập nhật tài khoản: {}", updatedBy, user.getUsername());
        return mapToResponse(saved);
    }

    /**
     * Lấy thông tin tài khoản theo ID.
     */
    @Transactional(readOnly = true)
    public UserResponse getAccountById(Long userId) {
        User user = findUserById(userId);
        return mapToResponse(user);
    }

    /**
     * Danh sách tài khoản với phân trang và tìm kiếm.
     */
    @Transactional(readOnly = true)
    public Page<UserResponse> searchAccounts(String keyword, AccountStatus status, Pageable pageable) {
        return userRepository.searchUsers(keyword, status, pageable)
                .map(this::mapToResponse);
    }

    /**
     * Vô hiệu hóa tài khoản (soft delete).
     */
    @Transactional
    public void deactivateAccount(Long userId, String deactivatedBy) {
        User user = findUserById(userId);
        user.setStatus(AccountStatus.INACTIVE);
        user.setUpdatedBy(deactivatedBy);
        userRepository.save(user);
        log.info("Admin {} đã vô hiệu hóa tài khoản: {}", deactivatedBy, user.getUsername());
    }

    /**
     * Kích hoạt lại tài khoản.
     */
    @Transactional
    public void activateAccount(Long userId, String activatedBy) {
        User user = findUserById(userId);
        user.setStatus(AccountStatus.ACTIVE);
        user.resetFailedLoginAttempts();
        user.setUpdatedBy(activatedBy);
        userRepository.save(user);
        log.info("Admin {} đã kích hoạt lại tài khoản: {}", activatedBy, user.getUsername());
    }

    /**
     * Reset mật khẩu cho tài khoản (Admin).
     */
    @Transactional
    public void adminResetPassword(Long userId, String newPassword, String resetBy) {
        User user = findUserById(userId);
        user.setPassword(passwordEncoder.encode(newPassword));
        user.resetFailedLoginAttempts();
        if (user.getStatus() == AccountStatus.LOCKED) {
            user.setStatus(AccountStatus.ACTIVE);
        }
        user.setUpdatedBy(resetBy);
        userRepository.save(user);
        log.info("Admin {} đã reset mật khẩu cho tài khoản: {}", resetBy, user.getUsername());
    }

    // ══════════════════════════════════════════════
    // ══  HELPER METHODS
    // ══════════════════════════════════════════════

    private User findUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Người dùng", "username", username));
    }

    private User findUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Người dùng", "id", id));
    }

    /**
     * Parse danh sách tên vai trò (String) thành Set<Role>.
     */
    private Set<Role> parseRoles(Set<String> roleNames) {
        Set<Role> roles = new HashSet<>();
        for (String roleName : roleNames) {
            try {
                RoleName rn = RoleName.valueOf(roleName.toUpperCase());
                Role role = roleRepository.findByName(rn)
                        .orElseThrow(() -> new BadRequestException("Vai trò không tồn tại: " + roleName));
                roles.add(role);
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("Vai trò không hợp lệ: " + roleName +
                        ". Các vai trò hợp lệ: CANDIDATE, RECRUITER, HIRING_MANAGER, INTERVIEWER, HR_MANAGER, APPROVER, ADMIN");
            }
        }
        return roles;
    }

    /**
     * Map User entity sang UserResponse DTO.
     */
    private UserResponse mapToResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .phoneNumber(user.getPhoneNumber())
                .avatarUrl(user.getAvatarUrl())
                .dateOfBirth(user.getDateOfBirth())
                .address(user.getAddress())
                .department(user.getDepartment())
                .position(user.getPosition())
                .status(user.getStatus().name())
                .roles(user.getRoles().stream()
                        .map(role -> role.getName().name())
                        .collect(Collectors.toSet()))
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }
}
