package com.ats.backend.auth;

import java.util.Set;

public record LoginResponse(String accessToken, String tokenType, Long userId, String email, Set<String> roles) {}
