package com.ats.recruitment.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Service gửi email.
 * Dùng cho khôi phục mật khẩu và thông báo tài khoản.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Value("${app.password-reset.base-url}")
    private String resetBaseUrl;

    /**
     * Gửi email khôi phục mật khẩu.
     */
    @Async
    public void sendPasswordResetEmail(String toEmail, String token) {
        try {
            String resetUrl = resetBaseUrl + "?token=" + token;

            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("[ATS] Khôi phục mật khẩu");
            message.setText(
                    "Xin chào,\n\n" +
                    "Bạn đã yêu cầu khôi phục mật khẩu. Vui lòng nhấn vào link sau để đặt lại mật khẩu:\n\n" +
                    resetUrl + "\n\n" +
                    "Link này có hiệu lực trong 30 phút.\n\n" +
                    "Nếu bạn không yêu cầu đổi mật khẩu, vui lòng bỏ qua email này.\n\n" +
                    "Trân trọng,\n" +
                    "Hệ thống ATS Recruitment"
            );

            mailSender.send(message);
            log.info("Đã gửi email khôi phục mật khẩu tới: {}", toEmail);
        } catch (Exception e) {
            log.error("Không thể gửi email khôi phục mật khẩu tới {}: {}", toEmail, e.getMessage());
        }
    }

    /**
     * Gửi email thông báo tài khoản mới được tạo.
     */
    @Async
    public void sendAccountCreatedEmail(String toEmail, String username, String temporaryPassword) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("[ATS] Tài khoản đã được tạo");
            message.setText(
                    "Xin chào,\n\n" +
                    "Tài khoản ATS của bạn đã được tạo.\n\n" +
                    "Tên đăng nhập: " + username + "\n" +
                    "Mật khẩu tạm thời: " + temporaryPassword + "\n\n" +
                    "Vui lòng đăng nhập và đổi mật khẩu ngay.\n\n" +
                    "Trân trọng,\n" +
                    "Hệ thống ATS Recruitment"
            );

            mailSender.send(message);
            log.info("Đã gửi email thông báo tài khoản mới tới: {}", toEmail);
        } catch (Exception e) {
            log.error("Không thể gửi email thông báo tài khoản tới {}: {}", toEmail, e.getMessage());
        }
    }
}
