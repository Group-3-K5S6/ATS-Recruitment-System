import React, { useState, ChangeEvent, FormEvent } from 'react';
import { Upload, Eye, Save, X, Building, Globe, Mail, MapPin } from 'lucide-react';

interface CompanyData {
  name: string;
  slogan: string;
  website: string;
  email: string;
  address: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
}

export const CompanyConfig: React.FC = () => {
  const [formData, setFormData] = useState<CompanyData>({
    name: '',
    slogan: '',
    website: '',
    email: '',
    address: '',
    description: '',
    logoUrl: '',
    bannerUrl: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setFormData((prev) => ({ ...prev, logoUrl: URL.createObjectURL(file) }));
    }
  };

  const handleBannerChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setFormData((prev) => ({ ...prev, bannerUrl: URL.createObjectURL(file) }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const data = new FormData();
    data.append('name', formData.name);
    data.append('slogan', formData.slogan);
    data.append('website', formData.website);
    data.append('email', formData.email);
    data.append('address', formData.address);
    data.append('description', formData.description);

    if (logoFile) data.append('logo', logoFile);
    if (bannerFile) data.append('banner', bannerFile);

    try {
      console.log('Dữ liệu chuẩn bị gửi Backend:', Object.fromEntries(data));
      alert('Lưu cấu hình trang giới thiệu thành công!');
    } catch (error) {
      console.error('Lỗi khi lưu cấu hình:', error);
      alert('Có lỗi xảy ra khi lưu dữ liệu!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', color: '#333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Cấu hình trang giới thiệu công ty</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer', background: '#fff' }}
          >
            <Eye size={16} /> Xem trước
          </button>
          <button
            type="submit"
            form="company-form"
            disabled={isSubmitting}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#0052CC', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            <Save size={16} /> {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>

      <form id="company-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Tên công ty *</label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên công ty..."
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Slogan / Khẩu hiệu</label>
            <input
              type="text"
              name="slogan"
              value={formData.slogan}
              onChange={handleChange}
              placeholder="Nhập slogan công ty..."
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Website</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://example.com"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Email liên hệ</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="contact@company.com"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Địa chỉ trụ sở</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="Nhập địa chỉ..."
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Logo công ty</label>
            <input type="file" accept="image/*" onChange={handleLogoChange} id="logo-upload" style={{ display: 'none' }} />
            <label
              htmlFor="logo-upload"
              style={{ border: '2px dashed #ccc', padding: '16px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', display: 'block' }}
            >
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo Preview" style={{ maxHeight: '80px', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#666' }}><Upload size={24} /><p style={{ margin: '4px 0 0' }}>Tải logo lên</p></div>
              )}
            </label>
          </div>

          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Ảnh bìa (Banner)</label>
            <input type="file" accept="image/*" onChange={handleBannerChange} id="banner-upload" style={{ display: 'none' }} />
            <label
              htmlFor="banner-upload"
              style={{ border: '2px dashed #ccc', padding: '16px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', display: 'block' }}
            >
              {formData.bannerUrl ? (
                <img src={formData.bannerUrl} alt="Banner Preview" style={{ maxHeight: '80px', width: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: '#666' }}><Upload size={24} /><p style={{ margin: '4px 0 0' }}>Tải ảnh bìa lên</p></div>
              )}
            </label>
          </div>
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Mô tả chi tiết về công ty</label>
          <textarea
            name="description"
            rows={6}
            value={formData.description}
            onChange={handleChange}
            placeholder="Giới thiệu về lịch sử, sứ mệnh, văn hóa doanh nghiệp..."
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>
      </form>

      {/* Modal Preview */}
      {isPreviewOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', width: '80%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '8px', padding: '24px', position: 'relative' }}>
            <button
              onClick={() => setIsPreviewOpen(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>
            <h3 style={{ color: '#888', marginBottom: '16px' }}>[XEM TRƯỚC GIAO DIỆN CÔNG TY]</h3>
            
            <div style={{ height: '180px', backgroundColor: '#e5e7eb', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              {formData.bannerUrl && <img src={formData.bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ width: '80px', height: '80px', border: '1px solid #ddd', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {formData.logoUrl ? <img src={formData.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building size={32} />}
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px' }}>{formData.name || 'Tên công ty chưa nhập'}</h1>
                <p style={{ margin: '4px 0', color: '#666', fontStyle: 'italic' }}>{formData.slogan}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', color: '#555', fontSize: '14px', marginBottom: '20px' }}>
              {formData.website && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={16} /> {formData.website}</span>}
              {formData.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={16} /> {formData.email}</span>}
              {formData.address && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={16} /> {formData.address}</span>}
            </div>

            <hr style={{ margin: '20px 0', borderColor: '#eee' }} />

            <div>
              <h3>Giới thiệu về chúng tôi</h3>
              <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>{formData.description || 'Chưa có nội dung mô tả.'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};