"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_DESCRIPTIONS = exports.ALL_ROLES = exports.RoleType = void 0;
var RoleType;
(function (RoleType) {
    RoleType["CANDIDATE"] = "CANDIDATE";
    RoleType["RECRUITER"] = "RECRUITER";
    RoleType["HIRING_MANAGER"] = "HIRING_MANAGER";
    RoleType["INTERVIEWER"] = "INTERVIEWER";
    RoleType["HR_MANAGER"] = "HR_MANAGER";
    RoleType["APPROVER"] = "APPROVER";
    RoleType["ADMIN"] = "ADMIN";
})(RoleType || (exports.RoleType = RoleType = {}));
exports.ALL_ROLES = [
    RoleType.CANDIDATE,
    RoleType.RECRUITER,
    RoleType.HIRING_MANAGER,
    RoleType.INTERVIEWER,
    RoleType.HR_MANAGER,
    RoleType.APPROVER,
    RoleType.ADMIN,
];
exports.ROLE_DESCRIPTIONS = {
    [RoleType.CANDIDATE]: 'Ứng viên tìm kiếm việc làm và nộp hồ sơ',
    [RoleType.RECRUITER]: 'Nhân viên tuyển dụng quản lý tin tuyển dụng và ứng viên được giao',
    [RoleType.HIRING_MANAGER]: 'Trưởng bộ phận yêu cầu tuyển dụng và phỏng vấn ứng viên theo phòng ban',
    [RoleType.INTERVIEWER]: 'Chuyên viên tham gia phỏng vấn và đánh giá ứng viên',
    [RoleType.HR_MANAGER]: 'Trưởng phòng Nhân sự quản lý toàn bộ quy trình và dữ liệu tuyển dụng',
    [RoleType.APPROVER]: 'Người phê duyệt yêu cầu tuyển dụng và đề xuất offer',
    [RoleType.ADMIN]: 'Quản trị viên toàn quyền hệ thống và audit log',
};
