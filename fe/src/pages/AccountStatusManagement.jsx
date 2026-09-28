import React, { useState } from 'react';

const AccountStatusManagement = () => {
  const [users, setUsers] = useState([
    { id: 1, name: 'Phạm Bảo Lâm', email: 'lam.pb@example.com', role: 'Quản trị viên', status: 'Active' },
    { id: 2, name: 'Hoàng Đức Tâm', email: 'tam.hd@example.com', role: 'Nhân viên FE', status: 'Locked' },
    { id: 3, name: 'Nguyễn Văn A', email: 'a.nguyen@example.com', role: 'Nhân viên BE', status: 'Active' },
  ]);

  const handleToggleStatus = (userId, currentStatus) => {
    const actionText = currentStatus === 'Active' ? 'khoá' : 'mở khoá';
    if (window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản này?`)) {
      setUsers(users.map(u => {
        if (u.id === userId) {
          return { ...u, status: currentStatus === 'Active' ? 'Locked' : 'Active' };
        }
        return u;
      }));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Quản lý Trạng thái Tài khoản (Khóa / Mở khóa)</h2>
      <p style={{ color: '#5E6C84', fontSize: '14px' }}>
        Kiểm soát quyền hoạt động của các tài khoản trong hệ thống
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#F4F5F7', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>STT</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Họ và tên</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Email</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Vai trò</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Trạng thái</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #E1E6EB' }}>
              <td style={{ padding: '12px' }}>{index + 1}</td>
              <td style={{ padding: '12px', fontWeight: 'bold' }}>{user.name}</td>
              <td style={{ padding: '12px' }}>{user.email}</td>
              <td style={{ padding: '12px' }}>{user.role}</td>
              <td style={{ padding: '12px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: user.status === 'Active' ? '#E3FCEF' : '#FFEBE6',
                  color: user.status === 'Active' ? '#006644' : '#DE350B',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {user.status === 'Active' ? 'Hoạt động' : 'Đã khóa'}
                </span>
              </td>
              <td style={{ padding: '12px' }}>
                <button 
                  onClick={() => handleToggleStatus(user.id, user.status)}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: user.status === 'Active' ? '#DE350B' : '#008DA6', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  {user.status === 'Active' ? 'Khóa tài khoản' : 'Mở khóa'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AccountStatusManagement;
import React, { useState } from 'react';

const AccountStatusManagement = () => {
  const [users, setUsers] = useState([
    { id: 1, name: 'Phạm Bảo Lâm', email: 'lam.pb@example.com', role: 'Quản trị viên', status: 'Active' },
    { id: 2, name: 'Hoàng Đức Tâm', email: 'tam.hd@example.com', role: 'Nhân viên FE', status: 'Locked' },
    { id: 3, name: 'Nguyễn Văn A', email: 'a.nguyen@example.com', role: 'Nhân viên BE', status: 'Active' },
  ]);

  const handleToggleStatus = (userId, currentStatus) => {
    const actionText = currentStatus === 'Active' ? 'khoá' : 'mở khoá';
    if (window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản này?`)) {
      setUsers(users.map(u => {
        if (u.id === userId) {
          return { ...u, status: currentStatus === 'Active' ? 'Locked' : 'Active' };
        }
        return u;
      }));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Quản lý Trạng thái Tài khoản (Khóa / Mở khóa)</h2>
      <p style={{ color: '#5E6C84', fontSize: '14px' }}>
        Kiểm soát quyền hoạt động của các tài khoản trong hệ thống
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#F4F5F7', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>STT</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Họ và tên</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Email</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Vai trò</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Trạng thái</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #E1E6EB' }}>
              <td style={{ padding: '12px' }}>{index + 1}</td>
              <td style={{ padding: '12px', fontWeight: 'bold' }}>{user.name}</td>
              <td style={{ padding: '12px' }}>{user.email}</td>
              <td style={{ padding: '12px' }}>{user.role}</td>
              <td style={{ padding: '12px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: user.status === 'Active' ? '#E3FCEF' : '#FFEBE6',
                  color: user.status === 'Active' ? '#006644' : '#DE350B',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {user.status === 'Active' ? 'Hoạt động' : 'Đã khóa'}
                </span>
              </td>
              <td style={{ padding: '12px' }}>
                <button 
                  onClick={() => handleToggleStatus(user.id, user.status)}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: user.status === 'Active' ? '#DE350B' : '#008DA6', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  {user.status === 'Active' ? 'Khóa tài khoản' : 'Mở khóa'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AccountStatusManagement;