import React, { useState } from 'react';

const RoleAssignment = () => {
  const [users, setUsers] = useState([
    { id: 1, name: 'Phạm Bảo Lâm', email: 'lam.pb@example.com', role: 'Quản trị viên' },
    { id: 2, name: 'Hoàng Đức Tâm', email: 'tam.hd@example.com', role: 'Nhân viên FE' },
    { id: 3, name: 'Nguyễn Văn A', email: 'a.nguyen@example.com', role: 'Nhân viên BE' },
  ]);

  const [selectedRole, setSelectedRole] = useState({});

  const handleRoleChange = (userId, newRole) => {
    setSelectedRole({ ...selectedRole, [userId]: newRole });
  };

  const handleAssignRole = (userId) => {
    const newRole = selectedRole[userId];
    if (!newRole) return alert('Vui lòng chọn vai trò mới!');
    
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    alert('Cập nhật vai trò thành công!');
  };

  const handleRevokeRole = (userId) => {
    if (window.confirm('Bạn có chắc chắn muốn thu hồi vai trò của người dùng này?')) {
      setUsers(users.map(u => u.id === userId ? { ...u, role: 'Chưa phân bổ' } : u));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Phân bổ và Thu hồi Vai trò</h2>
      <p style={{ color: '#5E6C84', fontSize: '14px' }}>
        Quản lý và cấp quyền truy cập hệ thống cho nhân viên
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#F4F5F7', textAlign: 'left' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>STT</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Họ và tên</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Email</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Vai trò hiện tại</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Thay đổi vai trò</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #E1E6EB' }}>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #E1E6EB' }}>
              <td style={{ padding: '12px' }}>{index + 1}</td>
              <td style={{ padding: '12px', fontWeight: 'bold' }}>{user.name}</td>
              <td style={{ padding: '12px' }}>{user.email}</td>
              <td style={{ padding: '12px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: user.role === 'Chưa phân bổ' ? '#FFEBE6' : '#E3FCEF',
                  color: user.role === 'Chưa phân bổ' ? '#DE350B' : '#006644',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {user.role}
                </span>
              </td>
              <td style={{ padding: '12px' }}>
                <select 
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  defaultValue=""
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #DFE1E6' }}
                >
                  <option value="" disabled>-- Chọn vai trò --</option>
                  <option value="Quản trị viên">Quản trị viên</option>
                  <option value="Nhân viên FE">Nhân viên FE</option>
                  <option value="Nhân viên BE">Nhân viên BE</option>
                  <option value="Chuyên viên Tuyển dụng">Chuyên viên Tuyển dụng</option>
                </select>
              </td>
              <td style={{ padding: '12px' }}>
                <button 
                  onClick={() => handleAssignRole(user.id)}
                  style={{ padding: '6px 12px', marginRight: '8px', backgroundColor: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cập nhật
                </button>
                <button 
                  onClick={() => handleRevokeRole(user.id)}
                  style={{ padding: '6px 12px', backgroundColor: '#DE350B', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Thu hồi
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RoleAssignment;