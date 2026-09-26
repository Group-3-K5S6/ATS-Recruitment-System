import Sidebar from "./Sidebar";
import type { Role } from "../data/roleMenus";

type DashboardProps = {
  role: Role;
  userName: string;
};

function Dashboard({ role, userName }: DashboardProps) {
  return (
    <div className="dashboard-layout">
      <Sidebar role={role} userName={userName} />

      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <h1>Tổng quan</h1>
            <p>Chào mừng {userName}</p>
          </div>
        </header>

        {/* =========================
            VAI TRÒ 1 - RECRUITER
        ========================== */}
        {role === "Recruiter" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>8</span>
                <p>Vị trí tuyển dụng</p>
              </div>

              <div className="dashboard-card">
                <span>56</span>
                <p>Ứng viên</p>
              </div>

              <div className="dashboard-card">
                <span>12</span>
                <p>Lịch phỏng vấn</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Vị trí tuyển dụng gần đây</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Vị trí</th>
                    <th>Phòng ban</th>
                    <th>Ứng viên</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Lập trình viên Frontend</td>
                    <td>Công nghệ</td>
                    <td>24</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Nhân viên nhân sự</td>
                    <td>Nhân sự</td>
                    <td>18</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Chuyên viên thiết kế</td>
                    <td>Marketing</td>
                    <td>12</td>
                    <td>
                      <span className="status-red">Đã đóng</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )}

        {/* =========================
            VAI TRÒ 2 - HIRING MANAGER
        ========================== */}
        {role === "HiringManager" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>5</span>
                <p>Vị trí của tôi</p>
              </div>

              <div className="dashboard-card">
                <span>32</span>
                <p>Ứng viên</p>
              </div>

              <div className="dashboard-card">
                <span>6</span>
                <p>Lịch phỏng vấn</p>
              </div>

              <div className="dashboard-card">
                <span>2</span>
                <p>Chờ quyết định</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Vị trí tuyển dụng của tôi</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Vị trí</th>
                    <th>Phòng ban</th>
                    <th>Ứng viên</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Trưởng nhóm Backend</td>
                    <td>Công nghệ</td>
                    <td>15</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Nhân viên phân tích</td>
                    <td>Công nghệ</td>
                    <td>8</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Chuyên viên Marketing</td>
                    <td>Marketing</td>
                    <td>6</td>
                    <td>
                      <span className="status-orange">Đang duyệt</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Nhân viên kinh doanh</td>
                    <td>Kinh doanh</td>
                    <td>3</td>
                    <td>
                      <span className="status-red">Đã đóng</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Quyết định tuyển gần đây</h2>
              </div>

              <div className="decision-list">
                <div className="decision-item">
                  <div>
                    <strong>Nguyễn Thị Mai</strong>
                    <p>Marketing</p>
                  </div>

                  <button className="approve-button">Đồng ý</button>
                </div>

                <div className="decision-item">
                  <div>
                    <strong>Trần Văn Long</strong>
                    <p>Kinh doanh</p>
                  </div>

                  <button className="reject-button">Từ chối</button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* =========================
            VAI TRÒ 3 - INTERVIEWER
        ========================== */}
        {role === "Interviewer" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>12</span>
                <p>Lịch phỏng vấn</p>
              </div>

              <div className="dashboard-card">
                <span>18</span>
                <p>Ứng viên được phân công</p>
              </div>

              <div className="dashboard-card">
                <span>5</span>
                <p>Chưa đánh giá</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Lịch phỏng vấn sắp tới</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Ứng viên</th>
                    <th>Vị trí</th>
                    <th>Hình thức</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>25/09/2026 09:00</td>
                    <td>Nguyễn Văn A</td>
                    <td>Frontend Developer</td>
                    <td>Online</td>
                    <td>
                      <button className="view-button">Xem hồ sơ</button>
                    </td>
                  </tr>

                  <tr>
                    <td>26/09/2026 14:00</td>
                    <td>Trần Thị Mai</td>
                    <td>Nhân viên Marketing</td>
                    <td>Phòng họp 2</td>
                    <td>
                      <button className="view-button">Xem hồ sơ</button>
                    </td>
                  </tr>

                  <tr>
                    <td>27/09/2026 10:00</td>
                    <td>Lê Minh Đức</td>
                    <td>Backend Developer</td>
                    <td>Online</td>
                    <td>
                      <button className="view-button">Xem hồ sơ</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Phiếu đánh giá cần hoàn thành</h2>
              </div>

              <div className="evaluation-list">
                <div className="evaluation-item">
                  <div>
                    <strong>Nguyễn Văn A</strong>
                    <p>Frontend Developer</p>
                  </div>

                  <button className="evaluate-button">Đánh giá</button>
                </div>

                <div className="evaluation-item">
                  <div>
                    <strong>Trần Thị Mai</strong>
                    <p>Nhân viên Marketing</p>
                  </div>

                  <button className="evaluate-button">Đánh giá</button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* =========================
            VAI TRÒ 4 - HR MANAGER
        ========================== */}
        {role === "HRManager" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>24</span>
                <p>Vị trí tuyển dụng</p>
              </div>

              <div className="dashboard-card">
                <span>328</span>
                <p>Tổng ứng viên</p>
              </div>

              <div className="dashboard-card">
                <span>8</span>
                <p>Recruiter</p>
              </div>

              <div className="dashboard-card">
                <span>4.2 tỷ</span>
                <p>Ngân sách tuyển dụng</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Tình trạng tuyển dụng theo phòng ban</h2>
                <a href="#">Xem chi tiết</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Phòng ban</th>
                    <th>Vị trí đang tuyển</th>
                    <th>Ứng viên</th>
                    <th>Đã tuyển</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Công nghệ</td>
                    <td>8</td>
                    <td>128</td>
                    <td>12</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Marketing</td>
                    <td>5</td>
                    <td>74</td>
                    <td>8</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Kinh doanh</td>
                    <td>6</td>
                    <td>82</td>
                    <td>10</td>
                    <td>
                      <span className="status-orange">Cần theo dõi</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Nhân sự</td>
                    <td>3</td>
                    <td>28</td>
                    <td>5</td>
                    <td>
                      <span className="status-blue">Đang tuyển</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Tài chính</td>
                    <td>2</td>
                    <td>16</td>
                    <td>4</td>
                    <td>
                      <span className="status-red">Sắp quá hạn</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Hiệu suất Recruiter</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Recruiter</th>
                    <th>Vị trí phụ trách</th>
                    <th>Ứng viên</th>
                    <th>Đã tuyển</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Nguyễn Thị A</td>
                    <td>12</td>
                    <td>86</td>
                    <td>6</td>
                  </tr>

                  <tr>
                    <td>Trần Văn B</td>
                    <td>10</td>
                    <td>74</td>
                    <td>4</td>
                  </tr>

                  <tr>
                    <td>Lê Thị C</td>
                    <td>8</td>
                    <td>61</td>
                    <td>3</td>
                  </tr>

                  <tr>
                    <td>Phạm Thị D</td>
                    <td>8</td>
                    <td>55</td>
                    <td>3</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )}
        {/* =========================
            VAI TRÒ 5 - APPROVER
        ========================== */}
        {role === "Approver" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>4</span>
                <p>Yêu cầu chờ duyệt</p>
              </div>

              <div className="dashboard-card">
                <span>2</span>
                <p>Offer chờ duyệt</p>
              </div>

              <div className="dashboard-card">
                <span>12</span>
                <p>Đã phê duyệt</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Danh sách chờ phê duyệt</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Loại yêu cầu</th>
                    <th>Vị trí / Ứng viên</th>
                    <th>Phòng ban</th>
                    <th>Ngày gửi</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Yêu cầu tuyển dụng</td>
                    <td>Lập trình viên Frontend</td>
                    <td>Công nghệ</td>
                    <td>25/09/2026</td>
                    <td>
                      <span className="status-orange">Chờ phê duyệt</span>
                    </td>
                    <td>
                      <button className="view-button">Xem</button>
                    </td>
                  </tr>

                  <tr>
                    <td>Yêu cầu tuyển dụng</td>
                    <td>Nhân viên kinh doanh</td>
                    <td>Kinh doanh</td>
                    <td>24/09/2026</td>
                    <td>
                      <span className="status-orange">Chờ phê duyệt</span>
                    </td>
                    <td>
                      <button className="view-button">Xem</button>
                    </td>
                  </tr>

                  <tr>
                    <td>Offer</td>
                    <td>Nguyễn Thị Mai</td>
                    <td>Marketing</td>
                    <td>23/09/2026</td>
                    <td>
                      <span className="status-orange">Chờ phê duyệt</span>
                    </td>
                    <td>
                      <button className="view-button">Xem</button>
                    </td>
                  </tr>

                  <tr>
                    <td>Offer</td>
                    <td>Trần Văn Long</td>
                    <td>Kinh doanh</td>
                    <td>22/09/2026</td>
                    <td>
                      <span className="status-orange">Chờ phê duyệt</span>
                    </td>
                    <td>
                      <button className="view-button">Xem</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Lịch sử phê duyệt gần đây</h2>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Nội dung</th>
                    <th>Phòng ban</th>
                    <th>Kết quả</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Backend Developer</td>
                    <td>Công nghệ</td>
                    <td>
                      <span className="status-green">Đã duyệt</span>
                    </td>
                    <td>20/09/2026</td>
                  </tr>

                  <tr>
                    <td>Offer - Lê Minh Anh</td>
                    <td>Nhân sự</td>
                    <td>
                      <span className="status-green">Đã duyệt</span>
                    </td>
                    <td>19/09/2026</td>
                  </tr>

                  <tr>
                    <td>Chuyên viên Marketing</td>
                    <td>Marketing</td>
                    <td>
                      <span className="status-red">Từ chối</span>
                    </td>
                    <td>18/09/2026</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )}
        {/* =========================
            VAI TRÒ 6 - ADMIN
        ========================== */}
        {role === "Admin" && (
          <>
            <section className="dashboard-cards">
              <div className="dashboard-card">
                <span>24</span>
                <p>Tài khoản</p>
              </div>

              <div className="dashboard-card">
                <span>6</span>
                <p>Vai trò hệ thống</p>
              </div>

              <div className="dashboard-card">
                <span>12</span>
                <p>Danh mục dùng chung</p>
              </div>

              <div className="dashboard-card">
                <span>1.240</span>
                <p>Nhật ký hệ thống</p>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Thống kê tài khoản theo vai trò</h2>
                <a href="#">Xem chi tiết</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Vai trò</th>
                    <th>Số tài khoản</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Nhân viên tuyển dụng</td>
                    <td>8</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Trưởng bộ phận</td>
                    <td>6</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Người phỏng vấn</td>
                    <td>10</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Trưởng phòng Nhân sự</td>
                    <td>2</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Người duyệt</td>
                    <td>4</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>

                  <tr>
                    <td>Quản trị hệ thống</td>
                    <td>2</td>
                    <td>
                      <span className="status-green">Hoạt động</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Hoạt động hệ thống gần đây</h2>
                <a href="#">Xem tất cả</a>
              </div>

              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người dùng</th>
                    <th>Hành động</th>
                    <th>Địa chỉ IP</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>25/09/2026 10:25</td>
                    <td>Nguyễn Văn An</td>
                    <td>Tạo tài khoản mới</td>
                    <td>192.168.1.10</td>
                  </tr>

                  <tr>
                    <td>25/09/2026 09:18</td>
                    <td>Trần Thị C</td>
                    <td>Cập nhật vai trò</td>
                    <td>192.168.1.12</td>
                  </tr>

                  <tr>
                    <td>25/09/2026 09:05</td>
                    <td>Lê Văn D</td>
                    <td>Tạo tài khoản</td>
                    <td>192.168.1.18</td>
                  </tr>

                  <tr>
                    <td>24/09/2026 08:42</td>
                    <td>Phạm Thị E</td>
                    <td>Cập nhật danh mục</td>
                    <td>192.168.1.20</td>
                  </tr>

                  <tr>
                    <td>24/09/2026 08:30</td>
                    <td>Nguyễn Văn An</td>
                    <td>Cấu hình hệ thống</td>
                    <td>192.168.1.10</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
