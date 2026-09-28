export type Role =
  | "Recruiter"
  | "HiringManager"
  | "Interviewer"
  | "HRManager"
  | "Approver"
  | "Admin";

export interface MenuItem {
  label: string;
}

export const roleMenus: Record<Role, MenuItem[]> = {
  Recruiter: [
    { label: "Tổng quan" },
    { label: "Yêu cầu tuyển dụng" },
    { label: "Ứng viên" },
    { label: "Pipeline tuyển dụng" },
    { label: "Lịch phỏng vấn" },
    { label: "Offer" },
    { label: "Báo cáo" },
  ],

  HiringManager: [
    { label: "Tổng quan" },
    { label: "Vị trí của tôi" },
    { label: "Ứng viên theo vị trí" },
    { label: "Yêu cầu tuyển dụng" },
    { label: "Quyết định tuyển" },
  ],

  Interviewer: [
    { label: "Tổng quan" },
    { label: "Lịch phỏng vấn" },
    { label: "Ứng viên được phân công" },
    { label: "Phiếu đánh giá" },
  ],

  HRManager: [
    { label: "Tổng quan" },
    { label: "Tất cả vị trí tuyển dụng" },
    { label: "Phân công recruiter" },
    { label: "Headcount & ngân sách" },
    { label: "Báo cáo" },
  ],

  Approver: [
    { label: "Tổng quan" },
    { label: "Chờ phê duyệt" },
    { label: "Yêu cầu tuyển dụng" },
    { label: "Offer cần duyệt" },
    { label: "Lịch sử phê duyệt" },
  ],

  Admin: [
    { label: "Tổng quan" },
    { label: "Quản lý tài khoản" },
    { label: "Vai trò & quyền" },
    { label: "Danh mục hệ thống" },
    { label: "Nhật ký hệ thống" },
    { label: "Cấu hình" },
  ],
};
