package com.ats.backend.auth;

import com.ats.backend.common.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AuthExceptionHandler {
    @ExceptionHandler(InvalidLoginException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(InvalidLoginException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(ex.getMessage()));
    }
    @ExceptionHandler(LoginLockedException.class)
    public ResponseEntity<ApiResponse<Void>> locked(LoginLockedException ex) {
        return ResponseEntity.status(HttpStatus.LOCKED).body(ApiResponse.error(ex.getMessage()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> invalidRequest() {
        return ResponseEntity.badRequest().body(ApiResponse.error("Vui lòng nhập email hợp lệ và mật khẩu."));
    }
}
