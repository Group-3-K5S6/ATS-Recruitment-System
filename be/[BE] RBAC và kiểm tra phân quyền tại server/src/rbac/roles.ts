export enum RoleType {
  CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', HIRING_MANAGER = 'HIRING_MANAGER',
  INTERVIEWER = 'INTERVIEWER', HR_MANAGER = 'HR_MANAGER', APPROVER = 'APPROVER', ADMIN = 'ADMIN',
}
export const ALL_ROLES = Object.values(RoleType);
export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  CANDIDATE: 'Ứng viên', RECRUITER: 'Nhân viên tuyển dụng', HIRING_MANAGER: 'Trưởng bộ phận',
  INTERVIEWER: 'Người phỏng vấn', HR_MANAGER: 'Trưởng phòng Nhân sự', APPROVER: 'Người phê duyệt', ADMIN: 'Quản trị hệ thống',
};
