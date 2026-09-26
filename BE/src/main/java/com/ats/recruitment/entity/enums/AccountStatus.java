package com.ats.recruitment.entity.enums;

/**
 * Trạng thái tài khoản người dùng.
 */
public enum AccountStatus {
    /** Tài khoản hoạt động bình thường */
    ACTIVE,

    /** Tài khoản bị vô hiệu hóa bởi Admin */
    INACTIVE,

    /** Tài khoản bị khóa do đăng nhập sai quá nhiều lần */
    LOCKED
}
