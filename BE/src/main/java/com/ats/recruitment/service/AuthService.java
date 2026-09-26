package com.ats.recruitment.service;

import com.ats.recruitment.dto.request.*;
import com.ats.recruitment.dto.response.JwtResponse;
import com.ats.recruitment.entity.User;
import com.ats.recruitment.entity.enums.AccountStatus;
import com.ats.recruitment.exception.BadRequestException;
import com.ats.recruitment.exception.ResourceNotFoundException;
import com.ats.recruitment.repository.UserRepository;
import com.ats.recruitment.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service xử lý xác thực:
 * - Đăng nhập (JWT)
 * - Quên mật khẩu
 * - Đặt lại mật khẩu
 * - Đổi mật khẩu
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    @Value("${app.password-reset.expiration-minutes}")
    private int resetTokenExpirationMinutes;

    /**
     * Đăng nhập bằng username/email và mật khẩu.
     * Trả về JWT access token + refresh token.
     */
    @Transactional
    public JwtResponse login(LoginRequest request) {
        // Tìm user để kiểm tra trạng thái trước khi xác thực
        User user = userRepository
                .findByUsernameOrEmail(request.getUsernameOrEmail(), request.getUsernameOrEmail())
                .orElseThrow(() -> new BadCredentialsException("Tên đăng nhập hoặc mật khẩu không đúng"));

        // Kiểm tra tài khoản bị vô hiệu hóa
        if (user.getStatus() == AccountStatus.INACTIVE) {
            throw new LockedException("Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.");
        }

        // Kiểm tra tài khoản bị khóa
        boolean wasLocked = user.getStatus() == AccountStatus.LOCKED;
        if (user.isAccountLocked()) {
            throw new LockedException("Tài khoản bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 30 phút.");
        }
        // isAccountLocked tự mở khóa trong bộ nhớ sau 30 phút; lưu thay đổi trước
        // khi AuthenticationManager tải lại người dùng từ database.
        if (wasLocked) {
            userRepository.save(user);
        }

        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getUsernameOrEmail(),
                            request.getPassword()
                    )
            );

            SecurityContextHolder.getContext().setAuthentication(authentication);

            // Reset số lần đăng nhập sai
            user.resetFailedLoginAttempts();
            userRepository.save(user);

            // Tạo JWT tokens
            String accessToken = jwtTokenProvider.generateAccessToken(authentication);
            String refreshToken = jwtTokenProvider.generateRefreshToken(authentication);

            return JwtResponse.builder()
                    .accessToken(accessToken)
                    .refreshToken(refreshToken)
                    .tokenType("Bearer")
                    .userId(user.getId())
                    .username(user.getUsername())
                    .email(user.getEmail())
                    .fullName(user.getFullName())
                    .roles(user.getRoles().stream()
                            .map(role -> role.getName().name())
                            .collect(Collectors.toList()))
                    .build();

        } catch (BadCredentialsException ex) {
            // Tăng số lần đăng nhập sai
            user.incrementFailedLoginAttempts();
            userRepository.save(user);

            if (user.getStatus() == AccountStatus.LOCKED) {
                throw new LockedException("Tài khoản bị khóa do đăng nhập sai quá 5 lần. Vui lòng thử lại sau 30 phút.");
            }

            throw new BadCredentialsException(
                    "Mật khẩu không đúng. Bạn còn " + (5 - user.getFailedLoginAttempts()) + " lần thử.");
        }
    }

    /**
     * Gửi email khôi phục mật khẩu.
     */
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail()).orElse(null);
        if (user == null || user.getStatus() != AccountStatus.ACTIVE) {
            // Trả cùng kết quả với email tồn tại để không làm lộ tài khoản.
            return;
        }

        // Tạo token reset
        String token = UUID.randomUUID().toString();
        user.setResetPasswordToken(token);
        user.setResetPasswordTokenExpiry(LocalDateTime.now().plusMinutes(resetTokenExpirationMinutes));
        userRepository.save(user);

        // Gửi email
        emailService.sendPasswordResetEmail(user.getEmail(), token);

        log.info("Đã tạo token khôi phục mật khẩu cho user: {}", user.getUsername());
    }

    /**
     * Đặt lại mật khẩu từ token trong email.
     */
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        // Kiểm tra mật khẩu khớp
        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new BadRequestException("Mật khẩu xác nhận không khớp");
        }

        User user = userRepository.findByResetPasswordToken(request.getToken())
                .orElseThrow(() -> new BadRequestException("Token khôi phục mật khẩu không hợp lệ"));

        // Kiểm tra token hết hạn
        if (user.getResetPasswordTokenExpiry() == null
                || !user.getResetPasswordTokenExpiry().isAfter(LocalDateTime.now())) {
            throw new BadRequestException("Token khôi phục mật khẩu đã hết hạn. Vui lòng yêu cầu lại.");
        }

        // Cập nhật mật khẩu mới
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setResetPasswordToken(null);
        user.setResetPasswordTokenExpiry(null);
        user.resetFailedLoginAttempts();
        if (user.getStatus() == AccountStatus.LOCKED) {
            user.setStatus(AccountStatus.ACTIVE);
        }
        userRepository.save(user);

        log.info("Đã đặt lại mật khẩu cho user: {}", user.getUsername());
    }

    /**
     * Đổi mật khẩu (khi đã đăng nhập).
     */
    @Transactional
    public void changePassword(String username, ChangePasswordRequest request) {
        // Kiểm tra mật khẩu mới khớp
        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new BadRequestException("Mật khẩu xác nhận không khớp");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Người dùng", "username", username));

        // Kiểm tra mật khẩu hiện tại
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new BadRequestException("Mật khẩu hiện tại không đúng");
        }

        // Kiểm tra mật khẩu mới không trùng cũ
        if (passwordEncoder.matches(request.getNewPassword(), user.getPassword())) {
            throw new BadRequestException("Mật khẩu mới không được trùng với mật khẩu cũ");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        log.info("Đã đổi mật khẩu cho user: {}", username);
    }
}
