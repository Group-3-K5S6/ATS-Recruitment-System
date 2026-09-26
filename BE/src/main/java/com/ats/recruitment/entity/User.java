package com.ats.recruitment.entity;

import com.ats.recruitment.entity.enums.AccountStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/**
 * Entity đại diện cho người dùng trong hệ thống ATS.
 * Bao gồm cả thông tin tài khoản (đăng nhập) và hồ sơ cá nhân.
 */
@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(columnNames = "username"),
        @UniqueConstraint(columnNames = "email")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ── Thông tin đăng nhập ──

    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    @Column(name = "email", nullable = false, unique = true, length = 100)
    private String email;

    @Column(name = "password", nullable = false, length = 255)
    private String password;

    // ── Trạng thái tài khoản ──

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private AccountStatus status = AccountStatus.ACTIVE;

    @Column(name = "failed_login_attempts")
    @Builder.Default
    private Integer failedLoginAttempts = 0;

    @Column(name = "lock_time")
    private LocalDateTime lockTime;

    // ── Hồ sơ cá nhân ──

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "address", length = 500)
    private String address;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "position", length = 100)
    private String position;

    // ── Khôi phục mật khẩu ──

    @Column(name = "reset_password_token", length = 255)
    private String resetPasswordToken;

    @Column(name = "reset_password_token_expiry")
    private LocalDateTime resetPasswordTokenExpiry;

    // ── Phân quyền ──

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    // ── Audit ──

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    // ── Helper Methods ──

    /**
     * Kiểm tra tài khoản có đang bị khóa hay không.
     * Tự động mở khóa sau 30 phút.
     */
    public boolean isAccountLocked() {
        if (status != AccountStatus.LOCKED) {
            return false;
        }
        // Tự động mở khóa sau 30 phút
        if (lockTime != null && lockTime.plusMinutes(30).isBefore(LocalDateTime.now())) {
            this.status = AccountStatus.ACTIVE;
            this.failedLoginAttempts = 0;
            this.lockTime = null;
            return false;
        }
        return true;
    }

    /**
     * Tăng số lần đăng nhập sai. Khóa tài khoản nếu >= 5 lần.
     */
    public void incrementFailedLoginAttempts() {
        this.failedLoginAttempts = (this.failedLoginAttempts == null ? 0 : this.failedLoginAttempts) + 1;
        if (this.failedLoginAttempts >= 5) {
            this.status = AccountStatus.LOCKED;
            this.lockTime = LocalDateTime.now();
        }
    }

    /**
     * Reset số lần đăng nhập sai sau khi đăng nhập thành công.
     */
    public void resetFailedLoginAttempts() {
        this.failedLoginAttempts = 0;
        this.lockTime = null;
    }
}
