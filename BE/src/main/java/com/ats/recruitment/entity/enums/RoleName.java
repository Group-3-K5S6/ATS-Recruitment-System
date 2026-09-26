package com.ats.recruitment.entity.enums;

/**
 * 7 vai trò trong hệ thống ATS theo ma trận phân quyền.
 *
 * | # | Vai trò                  | Mã              |
 * |---|--------------------------|-----------------|
 * | 1 | Ứng viên                 | CANDIDATE       |
 * | 2 | Nhân viên tuyển dụng     | RECRUITER       |
 * | 3 | Trưởng bộ phận           | HIRING_MANAGER  |
 * | 4 | Người phỏng vấn          | INTERVIEWER     |
 * | 5 | Trưởng phòng Nhân sự     | HR_MANAGER      |
 * | 6 | Người duyệt              | APPROVER        |
 * | 7 | Quản trị hệ thống        | ADMIN           |
 */
public enum RoleName {
    CANDIDATE,
    RECRUITER,
    HIRING_MANAGER,
    INTERVIEWER,
    HR_MANAGER,
    APPROVER,
    ADMIN
}
