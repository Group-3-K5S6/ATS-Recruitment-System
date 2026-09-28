package com.ats.backend.auth;

public class LoginLockedException extends RuntimeException {
    public LoginLockedException(String message) { super(message); }
}
