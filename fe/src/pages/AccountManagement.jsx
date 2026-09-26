import React, { useState } from 'react';

const AccountManagement = () => {
  // Mẫu dữ liệu danh sách tài khoản nội bộ
  const [accounts] = useState([
    { id: 1, name: 'Phạm Bảo Lâm', email: 'lam.pb@example.com', role: 'Quản trị viên', status: 'Hoạt động' },
    { id: 2, name: 'Hoàng Đức Lâm', email: 'lam.hd@example.com', role: 'Nhân viên FE', status: 'Hoạt động' },
    { id: 3, name: 'Nguyễn Văn A', email: 'a.nguyen@example.com', role: 'Nhân viên BE', status: 'Đã khóa' },
  ]);

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      {/* Tiêu đề trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#172B4D' }}>Quản lý nội bộ tài khoản</h2>
          <p style={{ margin: '4px 0 0', color: '#5E6C84', fontSize: '14px' }}>Quản lý danh sách và quyền hạn tài khoản trong hệ thống</p>
        </div>
        <button style={{ padding: '10px 16px', backgroundColor: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Thêm tài khoản mới
        </button>
      </div>

      {/* Thanh tìm kiếm */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
        <input 
          type="text" 
          placeholder="Tìm kiếm theo tên hoặc email..." 
          style={{ padding: '8px 12px', width: '300px', borderRadius: '4px', border: '1px solid #DFE1E6' }}
        />
      </div>

      {/* Bảng danh sách tài khoản */}
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#F4F5F7', borderBottom: '2px solid #DFE1E6', color: '#172B4D' }}>
            <th style={{ padding: '12px' }}>STT</th>
            <th style={{ padding: '12px' }}>Họ tên</th>
            <th style={{ padding: '12px' }}>Email</th>
            <th style={{ padding: '12px' }}>Vai trò</th>
            <th style={{ padding: '12px' }}>Trạng thái</th>
            <th style={{ padding: '12px', textAlign: 'center' }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((user, index) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #DFE1E6' }}>
              <td style={{ padding: '12px' }}>{index + 1}</td>
              <td style={{ padding: '12px', fontWeight: '500' }}>{user.name}</td>
              <td style={{ padding: '12px' }}>{user.email}</td>
              <td style={{ padding: '12px' }}>
                <span style={{ padding: '4px 8px', backgroundColor: '#DEEBFF', color: '#0747A6', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                  {user.role}
                </span>
              </td>
              <td style={{ padding: '12px' }}>
                <span style={{ 
                  padding: '4px 8px', 
                  backgroundColor: user.status === 'Hoạt động' ? '#E3FCEF' : '#FFEBE6', 
                  color: user.status === 'Hoạt động' ? '#006644' : '#BF2600', 
                  borderRadius: '4px', 
                  fontSize: '12px', 
                  fontWeight: 'bold' 
                }}>
                  {user.status}
                </span>
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <button style={{ marginRight: '8px', border: 'none', background: 'none', color: '#0052CC', cursor: 'pointer' }}>Sửa</button>
                <button style={{ border: 'none', background: 'none', color: '#DE350B', cursor: 'pointer' }}>Khóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AccountManagement;