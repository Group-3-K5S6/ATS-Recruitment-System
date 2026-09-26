package com.ats.recruitment.config;

import com.ats.recruitment.entity.Role;
import com.ats.recruitment.entity.User;
import com.ats.recruitment.entity.enums.AccountStatus;
import com.ats.recruitment.entity.enums.RoleName;
import com.ats.recruitment.repository.RoleRepository;
import com.ats.recruitment.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * Khởi tạo dữ liệu ban đầu khi ứng dụng khởi động:
 * - Tạo 7 vai trò mặc định
 * - Tạo tài khoản Admin mặc định
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        initRoles();
        initAdminAccount();
    }

    /**
     * Tạo 7 vai trò mặc định nếu chưa có.
     */
    private void initRoles() {
        for (RoleName roleName : RoleName.values()) {
            if (!roleRepository.existsByName(roleName)) {
                Role role = Role.builder()
                        .name(roleName)
                        .description(getDescription(roleName))
                        .build();
                roleRepository.save(role);
                log.info("Đã tạo vai trò: {}", roleName);
            }
        }
    }

    /**
     * Tạo tài khoản Admin mặc định nếu chưa có.
     * Username: admin | Password: admin@123
     */
    private void initAdminAccount() {
        if (!userRepository.existsByUsername("admin")) {
            Role adminRole = roleRepository.findByName(RoleName.ADMIN)
                    .orElseThrow(() -> new RuntimeException("Vai trò ADMIN chưa được tạo"));

            User admin = User.builder()
                    .username("admin")
                    .email("admin@ats-recruitment.com")
                    .password(passwordEncoder.encode("admin@123"))
                    .fullName("Quản trị viên hệ thống")
                    .status(AccountStatus.ACTIVE)
                    .roles(Set.of(adminRole))
                    .createdBy("SYSTEM")
                    .build();

            userRepository.save(admin);
            log.info("Đã tạo tài khoản Admin mặc định (username: admin, password: admin@123)");
        }
    }

    private String getDescription(RoleName roleName) {
        return switch (roleName) {
            case CANDIDATE -> "Ứng viên - Người nộp hồ sơ từ bên ngoài";
            case RECRUITER -> "Nhân viên tuyển dụng - Vận hành tuyển dụng hằng ngày";
            case HIRING_MANAGER -> "Trưởng bộ phận - Người cần tuyển người";
            case INTERVIEWER -> "Người phỏng vấn - Tham gia vòng phỏng vấn";
            case HR_MANAGER -> "Trưởng phòng Nhân sự - Giám sát toàn bộ tuyển dụng";
            case APPROVER -> "Người duyệt - Phê duyệt yêu cầu và offer";
            case ADMIN -> "Quản trị hệ thống - Quản lý tài khoản, vai trò, cấu hình";
        };
    }
}
