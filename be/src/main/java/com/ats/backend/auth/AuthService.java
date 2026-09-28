package com.ats.backend.auth;

import com.ats.backend.user.UserAccount;
import com.ats.backend.user.UserAccountRepository;
import java.time.LocalDateTime;
import java.util.Locale;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final String INVALID_LOGIN = "Email hoặc mật khẩu không chính xác.";
    private static final String LOCKED_LOGIN = "Tài khoản tạm khóa do đăng nhập sai 5 lần. Vui lòng thử lại sau 15 phút.";
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;

    public AuthService(UserAccountRepository users, PasswordEncoder passwords, TokenService tokens) {
        this.users = users; this.passwords = passwords; this.tokens = tokens;
    }

    @Transactional(noRollbackFor = {InvalidLoginException.class, LoginLockedException.class})
    public LoginResponse login(LoginRequest request) {
        LocalDateTime now = LocalDateTime.now();
        UserAccount user = users.findByEmailIgnoreCase(request.email().trim().toLowerCase(Locale.ROOT)).orElse(null);
        // Same response for unknown email, wrong password, and disabled accounts.
        if (user == null) throw new InvalidLoginException(INVALID_LOGIN);
        if (user.isLocked(now)) throw new LoginLockedException(LOCKED_LOGIN);
        if (!user.isActive() || !passwords.matches(request.password(), user.getPasswordHash())) {
            if (user.isActive()) {
                user.registerFailure(now);
                users.save(user);
                if (user.isLocked(now)) throw new LoginLockedException(LOCKED_LOGIN);
            }
            throw new InvalidLoginException(INVALID_LOGIN);
        }
        user.registerSuccess();
        users.save(user);
        return new LoginResponse(tokens.create(user), "Bearer", user.getId(), user.getEmail(), user.getRoles());
    }
}


