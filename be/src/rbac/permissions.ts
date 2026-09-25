export enum PermissionCode {
  // Organization & Position
  ORGANIZATION_READ = 'organization:read',
  ORGANIZATION_WRITE = 'organization:write',

  // Recruitment Requests (Requisitions)
  REQUISITIONS_READ = 'requisitions:read',
  REQUISITIONS_CREATE = 'requisitions:create',
  REQUISITIONS_UPDATE = 'requisitions:update',
  REQUISITIONS_APPROVE = 'requisitions:approve',
  REQUISITIONS_DELETE = 'requisitions:delete',

  // Job Postings
  JOBS_READ = 'jobs:read',
  JOBS_CREATE = 'jobs:create',
  JOBS_UPDATE = 'jobs:update',
  JOBS_PUBLISH = 'jobs:publish',
  JOBS_DELETE = 'jobs:delete',

  // Candidates & Applications
  CANDIDATES_READ = 'candidates:read',
  CANDIDATES_CREATE = 'candidates:create',
  CANDIDATES_UPDATE = 'candidates:update',
  CANDIDATES_DELETE = 'candidates:delete',

  // Interview Schedule
  INTERVIEWS_READ = 'interviews:read',
  INTERVIEWS_CREATE = 'interviews:create',
  INTERVIEWS_UPDATE = 'interviews:update',
  INTERVIEWS_DELETE = 'interviews:delete',

  // Evaluations
  EVALUATIONS_READ = 'evaluations:read',
  EVALUATIONS_CREATE = 'evaluations:create',
  EVALUATIONS_UPDATE = 'evaluations:update',

  // Offers & Onboarding
  OFFERS_READ = 'offers:read',
  OFFERS_CREATE = 'offers:create',
  OFFERS_UPDATE = 'offers:update',
  OFFERS_APPROVE = 'offers:approve',
  OFFERS_DELETE = 'offers:delete',

  // Email & Notifications
  NOTIFICATIONS_READ = 'notifications:read',
  NOTIFICATIONS_MANAGE = 'notifications:manage',

  // Reports & Dashboard
  REPORTS_READ = 'reports:read',

  // Users & Roles
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DISABLE = 'users:disable',

  ROLES_READ = 'roles:read',
  ROLES_UPDATE = 'roles:update',

  // Audit Logs
  AUDIT_LOGS_READ = 'audit_logs:read',
}

export interface PermissionDefinition {
  code: PermissionCode;
  module: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Organization
  { code: PermissionCode.ORGANIZATION_READ, module: 'organization', description: 'Xem thông tin tổ chức, phòng ban và vị trí' },
  { code: PermissionCode.ORGANIZATION_WRITE, module: 'organization', description: 'Tạo, sửa thông tin tổ chức và phòng ban' },

  // Requisitions
  { code: PermissionCode.REQUISITIONS_READ, module: 'requisitions', description: 'Xem yêu cầu tuyển dụng' },
  { code: PermissionCode.REQUISITIONS_CREATE, module: 'requisitions', description: 'Tạo mới yêu cầu tuyển dụng' },
  { code: PermissionCode.REQUISITIONS_UPDATE, module: 'requisitions', description: 'Cập nhật yêu cầu tuyển dụng' },
  { code: PermissionCode.REQUISITIONS_APPROVE, module: 'requisitions', description: 'Phê duyệt yêu cầu tuyển dụng' },
  { code: PermissionCode.REQUISITIONS_DELETE, module: 'requisitions', description: 'Xóa yêu cầu tuyển dụng' },

  // Jobs
  { code: PermissionCode.JOBS_READ, module: 'jobs', description: 'Xem danh sách và chi tiết tin tuyển dụng' },
  { code: PermissionCode.JOBS_CREATE, module: 'jobs', description: 'Tạo tin tuyển dụng mới' },
  { code: PermissionCode.JOBS_UPDATE, module: 'jobs', description: 'Cập nhật nội dung tin tuyển dụng' },
  { code: PermissionCode.JOBS_PUBLISH, module: 'jobs', description: 'Đăng tải hoặc đóng tin tuyển dụng' },
  { code: PermissionCode.JOBS_DELETE, module: 'jobs', description: 'Xóa tin tuyển dụng' },

  // Candidates
  { code: PermissionCode.CANDIDATES_READ, module: 'candidates', description: 'Xem hồ sơ ứng viên và pipeline' },
  { code: PermissionCode.CANDIDATES_CREATE, module: 'candidates', description: 'Tạo hồ sơ ứng tuyển mới' },
  { code: PermissionCode.CANDIDATES_UPDATE, module: 'candidates', description: 'Cập nhật trạng thái và thông tin ứng viên' },
  { code: PermissionCode.CANDIDATES_DELETE, module: 'candidates', description: 'Xóa hoặc lưu trữ ứng viên' },

  // Interviews
  { code: PermissionCode.INTERVIEWS_READ, module: 'interviews', description: 'Xem lịch phỏng vấn' },
  { code: PermissionCode.INTERVIEWS_CREATE, module: 'interviews', description: 'Lên lịch phỏng vấn mới' },
  { code: PermissionCode.INTERVIEWS_UPDATE, module: 'interviews', description: 'Cập nhật lịch phỏng vấn' },
  { code: PermissionCode.INTERVIEWS_DELETE, module: 'interviews', description: 'Hủy lịch phỏng vấn' },

  // Evaluations
  { code: PermissionCode.EVALUATIONS_READ, module: 'evaluations', description: 'Xem phiếu đánh giá phỏng vấn' },
  { code: PermissionCode.EVALUATIONS_CREATE, module: 'evaluations', description: 'Tạo đánh giá sau phỏng vấn' },
  { code: PermissionCode.EVALUATIONS_UPDATE, module: 'evaluations', description: 'Chỉnh sửa đánh giá phỏng vấn' },

  // Offers
  { code: PermissionCode.OFFERS_READ, module: 'offers', description: 'Xem chi tiết offer và onboarding' },
  { code: PermissionCode.OFFERS_CREATE, module: 'offers', description: 'Tạo đề xuất offer mới' },
  { code: PermissionCode.OFFERS_UPDATE, module: 'offers', description: 'Cập nhật thông tin offer' },
  { code: PermissionCode.OFFERS_APPROVE, module: 'offers', description: 'Phê duyệt hoặc từ chối offer' },
  { code: PermissionCode.OFFERS_DELETE, module: 'offers', description: 'Xóa đề xuất offer' },

  // Notifications
  { code: PermissionCode.NOTIFICATIONS_READ, module: 'notifications', description: 'Xem thông báo và email' },
  { code: PermissionCode.NOTIFICATIONS_MANAGE, module: 'notifications', description: 'Gửi và quản lý thông báo/email' },

  // Reports
  { code: PermissionCode.REPORTS_READ, module: 'reports', description: 'Xem báo cáo và dashboard tuyển dụng' },

  // Users
  { code: PermissionCode.USERS_READ, module: 'users', description: 'Xem danh sách người dùng' },
  { code: PermissionCode.USERS_CREATE, module: 'users', description: 'Tạo tài khoản người dùng' },
  { code: PermissionCode.USERS_UPDATE, module: 'users', description: 'Cập nhật thông tin người dùng' },
  { code: PermissionCode.USERS_DISABLE, module: 'users', description: 'Khóa tài khoản người dùng' },

  // Roles
  { code: PermissionCode.ROLES_READ, module: 'roles', description: 'Xem danh sách và cấu hình role' },
  { code: PermissionCode.ROLES_UPDATE, module: 'roles', description: 'Cập nhật phân quyền role' },

  // Audit Logs
  { code: PermissionCode.AUDIT_LOGS_READ, module: 'audit_logs', description: 'Xem nhật ký kiểm toán hệ thống' },
];
