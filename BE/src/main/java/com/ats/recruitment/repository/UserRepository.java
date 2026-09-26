package com.ats.recruitment.repository;

import com.ats.recruitment.entity.User;
import com.ats.recruitment.entity.enums.AccountStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsernameOrEmail(String username, String email);

    Optional<User> findByResetPasswordToken(String token);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    /**
     * Tìm kiếm người dùng theo từ khóa (username, email, fullName)
     * và lọc theo trạng thái tài khoản.
     */
    @Query("SELECT u FROM User u WHERE " +
            "(:keyword IS NULL OR :keyword = '' OR " +
            "  LOWER(u.username) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
            "  LOWER(u.email) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
            "  LOWER(u.fullName) LIKE LOWER(CONCAT('%', :keyword, '%'))) " +
            "AND (:status IS NULL OR u.status = :status)")
    Page<User> searchUsers(
            @Param("keyword") String keyword,
            @Param("status") AccountStatus status,
            Pageable pageable
    );
}
