package com.ats.recruitment.config;

import com.ats.recruitment.security.JwtAuthenticationEntryPoint;
import com.ats.recruitment.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Cấu hình Spring Security:
 * - JWT stateless authentication
 * - Phân quyền theo vai trò (RBAC)
 * - CORS cho phép frontend truy cập
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationEntryPoint authEntryPoint;
    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Tắt CSRF vì dùng JWT (stateless)
                .csrf(AbstractHttpConfigurer::disable)

                // Xử lý lỗi xác thực
                .exceptionHandling(ex -> ex.authenticationEntryPoint(authEntryPoint))

                // Stateless session
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // Phân quyền request
                .authorizeHttpRequests(auth -> auth
                        // ── Public endpoints ──
                        // Đổi mật khẩu yêu cầu đăng nhập dù nằm cùng nhóm /auth.
                        .requestMatchers("/auth/change-password").authenticated()
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // ── Admin-only: quản trị tài khoản ──
                        .requestMatchers("/admin/**").hasRole("ADMIN")

                        // ── HR Manager + Admin: xem nhật ký ──
                        .requestMatchers("/users/audit/**").hasAnyRole("HR_MANAGER", "ADMIN")

                        // ── Authenticated: hồ sơ cá nhân ──
                        .requestMatchers("/profile/**").authenticated()
                        .requestMatchers("/users/me/**").authenticated()

                        // ── Mọi request khác cần xác thực ──
                        .anyRequest().authenticated()
                );

        // Thêm JWT filter trước UsernamePasswordAuthenticationFilter
        http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
