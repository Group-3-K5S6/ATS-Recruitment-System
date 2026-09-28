package com.ats.backend.config;

import com.ats.backend.user.UserAccount;
import com.ats.backend.user.UserAccountRepository;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class DemoUserInitializer {
    @Bean CommandLineRunner seedDemoUser(UserAccountRepository users, PasswordEncoder encoder,
            @Value("${app.seed.enabled:true}") boolean enabled,
            @Value("${app.seed.email:admin@ats.local}") String email,
            @Value("${app.seed.password:Admin@12345}") String password) {
        return args -> {
            if (enabled && !users.existsByEmailIgnoreCase(email)) {
                users.save(new UserAccount(email, encoder.encode(password), Set.of("ADMIN", "HR_MANAGER")));
            }
        };
    }
}
