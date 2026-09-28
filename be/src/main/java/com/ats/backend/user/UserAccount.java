package com.ats.backend.user;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(name = "uk_users_email", columnNames = "email"))
public class UserAccount {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 254)
    private String email;
    @Column(nullable = false, length = 100)
    private String passwordHash;
    @Column(nullable = false)
    private boolean active = true;
    @Column(nullable = false)
    private int failedLoginAttempts = 0;
    private LocalDateTime lockedUntil;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role_name", nullable = false, length = 50)
    private Set<String> roles = new HashSet<>();

    protected UserAccount() {}
    public UserAccount(String email, String passwordHash, Set<String> roles) {
        this.email = email.toLowerCase();
        this.passwordHash = passwordHash;
        this.roles = new HashSet<>(roles);
    }
    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public LocalDateTime getLockedUntil() { return lockedUntil; }
    public Set<String> getRoles() { return Set.copyOf(roles); }
    public boolean isLocked(LocalDateTime now) { return lockedUntil != null && lockedUntil.isAfter(now); }
    public void registerFailure(LocalDateTime now) {
        failedLoginAttempts++;
        if (failedLoginAttempts >= 5) lockedUntil = now.plusMinutes(15);
    }
    public void registerSuccess() { failedLoginAttempts = 0; lockedUntil = null; }
}
