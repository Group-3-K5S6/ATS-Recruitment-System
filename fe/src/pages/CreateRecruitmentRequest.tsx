import React, { useState } from 'react';

interface RecruitmentRequestForm {
  jobTitle: string;
  department: string;
  quantity: number;
  reason: 'REPLACEMENT' | 'NEW';
  proposedSalaryMin: string;
  proposedSalaryMax: string;
  targetDate: string;
  description: string;
}

const RecruitmentRequestCreate: React.FC = () => {
  const [formData, setFormData] = useState<RecruitmentRequestForm>({
    jobTitle: '',
    department: '',
    quantity: 1,
    reason: 'NEW',
    proposedSalaryMin: '',
    proposedSalaryMax: '',
    targetDate: '',
    description: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Dữ liệu yêu cầu tuyển dụng:', formData);
    alert('Đã ghi nhận yêu cầu tuyển dụng!');
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Tạo Yêu Cầu Tuyển Dụng (S2-10)</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        
        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Chức danh cần tuyển (*):</label>
          <input
            type="text"
            name="jobTitle"
            value={formData.jobTitle}
            onChange={handleChange}
            required
            placeholder="VD: Senior Frontend Developer"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Phòng ban (*):</label>
          <select
            name="department"
            value={formData.department}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="">-- Chọn phòng ban --</option>
            <option value="IT">Phòng Công nghệ thông tin</option>
            <option value="HR">Phòng Nhân sự</option>
            <option value="MARKETING">Phòng Marketing</option>
            <option value="SALES">Phòng Kinh doanh</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Số lượng (*):</label>
            <input
              type="number"
              name="quantity"
              min={1}
              value={formData.quantity}
              onChange={handleChange}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Lý do tuyển dụng (*):</label>
            <select
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="NEW">Tăng mới</option>
              <option value="REPLACEMENT">Thay thế nhân sự nghỉ việc</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Mức lương đề xuất tối thiểu (VNĐ):</label>
            <input
              type="number"
              name="proposedSalaryMin"
              value={formData.proposedSalaryMin}
              onChange={handleChange}
              placeholder="VD: 15000000"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Mức lương đề xuất tối đa (VNĐ):</label>
            <input
              type="number"
              name="proposedSalaryMax"
              value={formData.proposedSalaryMax}
              onChange={handleChange}
              placeholder="VD: 25000000"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Ngày cần nhân sự (*):</label>
          <input
            type="date"
            name="targetDate"
            value={formData.targetDate}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>Mô tả chi tiết / Yêu cầu công việc:</label>
          <textarea
            name="description"
            rows={4}
            value={formData.description}
            onChange={handleChange}
            placeholder="Mô tả kỹ năng, kinh nghiệm cần thiết..."
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            style={{ padding: '10px 20px', backgroundColor: '#1890ff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Tạo Yêu Cầu
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            style={{ padding: '10px 20px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
          >
            Hủy
          </button>
        </div>

      </form>
    </div>
  );
};

export default RecruitmentRequestCreate;