package com.ats.backend.auth;

public class InvalidLoginException extends RuntimeException {
    public InvalidLoginException(String message) { super(message); }
}
