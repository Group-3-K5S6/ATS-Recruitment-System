import React, { useState } from 'react';
import { AlertTriangle, Plus, ShieldAlert, CheckCircle } from 'lucide-react';

const BudgetManagement = () => {
  const [budgetList, setBudgetList] = useState([
    {
      id: 1,
      department: 'Phòng Công nghệ Thông tin',
      year: '2026',
      targetCount: 10,
      currentCount: 8,
      totalBudget: 500000000,
    },
    {
      id: 2,
      department: 'Phòng Nhân sự',
      year: '2026',
      targetCount: 5,
      currentCount: 5,
      totalBudget: 250000000,
    },
    {
      id: 3,
      department: 'Phòng Marketing',
      year: '2026',
      targetCount: 8,
      currentCount: 9,
      totalBudget: 400000000,
    },
  ]);

  const [formData, setFormData] = useState({
    department: '',
    year: '2026',
    targetCount: '',
    totalBudget: '',
  });

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSaveBudget = (e) => {
    e.preventDefault();
    if (!formData.department || !formData.targetCount || !formData.totalBudget) {
      alert('Vui lòng điền đầy đủ thông tin!');
      return;
    }

    const newItem = {
      id: Date.now(),
      department: formData.department,
      year: formData.year,
      targetCount: parseInt(formData.targetCount),
      currentCount: 0,
      totalBudget: parseFloat(formData.totalBudget),
    };

    setBudgetList([...budgetList, newItem]);
    setFormData({ department: '', year: '2026', targetCount: '', totalBudget: '' });
  };

  const handleCreateRecruitmentRequest = (item) => {
    const remaining = item.targetCount - item.currentCount;
    if (remaining <= 0) {
      setSelectedDept(item);
      setIsWarningOpen(true);
    } else {
      alert(`Tạo yêu cầu tuyển dụng thành công cho ${item.department}. Số lượng còn lại: ${remaining - 1}`);
    }
  };

  const handleConfirmOverride = () => {
    if (!overrideReason.trim()) {
      setErrorMessage('Lý do ghi đè là bắt buộc khi duyệt vượt chỉ tiêu!');
      return;
    }

    alert(`Đã duyệt vượt chỉ tiêu cho phòng: ${selectedDept.department}\nLý do: ${overrideReason}`);

    setBudgetList(
      budgetList.map((b) =>
        b.id === selectedDept.id ? { ...b, currentCount: b.currentCount + 1 } : b
      )
    );

    setIsWarningOpen(false);
    setOverrideReason('');
    setErrorMessage('');
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>Quản Lý Ngân Sách & Chỉ Tiêu Nhân Sự</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Mã Jira: SCRUM-39 / SCRUM-92 (Front-End)</p>
        </div>
        <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '12px', fontWeight: '600', padding: '6px 12px', borderRadius: '20px' }}>
          Năm 2026
        </span>
      </div>

      {/* FORM KHAI BÁO */}
      <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} color="#2563eb" /> Khai báo chỉ tiêu số lượng nhân viên và ngân sách lương
        </h2>
        <form onSubmit={handleSaveBudget} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Năm tài chính</label>
            <select name="year" value={formData.year} onChange={handleInputChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Phòng ban</label>
            <input type="text" name="department" placeholder="VD: Phòng Kế toán" value={formData.department} onChange={handleInputChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Chỉ tiêu nhân viên (Người)</label>
            <input type="number" name="targetCount" placeholder="VD: 5" value={formData.targetCount} onChange={handleInputChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Ngân sách lương (VNĐ)</label>
            <input type="number" name="totalBudget" placeholder="VD: 300000000" value={formData.totalBudget} onChange={handleInputChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="submit" style={{ backgroundColor: '#2563eb', color: '#ffffff', padding: '10px 20px', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer' }}>
              Lưu Cấu Hình
            </button>
          </div>
        </form>
      </div>

      {/* BẢNG QUẢN LÝ */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Danh sách quản lý nhân sự theo lệnh cấm phòng</h2>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 16px' }}>Phòng ban</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Chỉ tiêu phê duyệt</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Đã tuyển / Hiện có</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Số lượng còn lại</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ngân sách lương</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Trạng thái</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {budgetList.map((item) => {
              const remaining = item.targetCount - item.currentCount;
              const isOver = remaining < 0;
              const isFull = remaining === 0;

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b' }}>{item.department}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{item.targetCount} người</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{item.currentCount} người</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', color: isOver || isFull ? '#dc2626' : '#16a34a' }}>
                    {remaining}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {item.totalBudget.toLocaleString('vi-VN')} VNĐ
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {isOver ? (
                      <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>⚠️ Vượt chỉ tiêu</span>
                    ) : isFull ? (
                      <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>🛡️ Hết chỉ tiêu</span>
                    ) : (
                      <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>✓ An toàn</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button onClick={() => handleCreateRecruitmentRequest(item)} style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      + Tuyển dụng mới
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL CẢNH BÁO CHẶN */}
      {isWarningOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '50%', height: 'fit-content' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>CẢNH BÁO CHẶN: VƯỢT CHỈ TIÊU BAN ĐẦU</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Số lượng nhân viên của phòng <strong>{selectedDept?.department}</strong> đã đạt hạn mức tối đa.
                </p>
              </div>
            </div>

            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#92400e', marginBottom: '16px' }}>
              ⚠️ Vượt chỉ tiêu là cảnh báo chặn, cần Trưởng phòng Nhân sự xác nhận ghi đè lý do.
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                Lý do ghi đè phê duyệt <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                rows="3"
                value={overrideReason}
                onChange={(e) => {
                  setOverrideReason(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="Nhập lý do chi tiết cần duyệt vượt chỉ tiêu..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              ></textarea>
              {errorMessage && <p style={{ color: '#dc2626', fontSize: '12px', margin: '4px 0 0 0' }}>{errorMessage}</p>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => { setIsWarningOpen(false); setOverrideReason(''); setErrorMessage(''); }} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleConfirmOverride} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontWeight: '500', cursor: 'pointer' }}>
                Xác Nhận Ghi Đè (Trưởng Phòng HR)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetManagement;