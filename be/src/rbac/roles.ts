export enum RoleType {
  CANDIDATE = 'CANDIDATE',
  RECRUITER = 'RECRUITER',
  HIRING_MANAGER = 'HIRING_MANAGER',
  INTERVIEWER = 'INTERVIEWER',
  HR_MANAGER = 'HR_MANAGER',
  APPROVER = 'APPROVER',
  ADMIN = 'ADMIN',
}

export const ALL_ROLES: RoleType[] = [
  RoleType.CANDIDATE,
  RoleType.RECRUITER,
  RoleType.HIRING_MANAGER,
  RoleType.INTERVIEWER,
  RoleType.HR_MANAGER,
  RoleType.APPROVER,
  RoleType.ADMIN,
];

export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  [RoleType.CANDIDATE]: 'Ứng viên tìm kiếm việc làm và nộp hồ sơ',
  [RoleType.RECRUITER]: 'Nhân viên tuyển dụng quản lý tin tuyển dụng và ứng viên được giao',
  [RoleType.HIRING_MANAGER]: 'Trưởng bộ phận yêu cầu tuyển dụng và phỏng vấn ứng viên theo phòng ban',
  [RoleType.INTERVIEWER]: 'Chuyên viên tham gia phỏng vấn và đánh giá ứng viên',
  [RoleType.HR_MANAGER]: 'Trưởng phòng Nhân sự quản lý toàn bộ quy trình và dữ liệu tuyển dụng',
  [RoleType.APPROVER]: 'Người phê duyệt yêu cầu tuyển dụng và đề xuất offer',
  [RoleType.ADMIN]: 'Quản trị viên toàn quyền hệ thống và audit log',
};
