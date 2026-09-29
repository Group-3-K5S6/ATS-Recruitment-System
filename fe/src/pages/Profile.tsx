import { useState } from "react";
import type { ChangeEvent } from "react";

import { useNavigate } from "react-router-dom";

import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

import Sidebar from "../components/Sidebar";
import { clearLocalSession } from "../services/session";

function Profile() {
  const navigate = useNavigate();

  // ============================
  // AVATAR
  // ============================

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  // ============================
  // CROP
  // ============================

  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
  });

  const [zoom, setZoom] = useState(1);

  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // ============================
  // MESSAGE
  // ============================

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============================
  // ĐĂNG XUẤT
  // ============================

  const handleLogout = async () => {
    clearLocalSession();

    navigate("/login");
  };

  // ============================
  // CHỌN ẢNH
  // ============================

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    setError("");
    setSuccess("");

    if (!file) {
      return;
    }

    // Chỉ chấp nhận JPG / PNG
    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
      setError("Chỉ chấp nhận ảnh JPG hoặc PNG.");

      event.target.value = "";

      return;
    }

    // Tối đa 2MB
    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      setError("Dung lượng ảnh không được vượt quá 2MB.");

      event.target.value = "";

      return;
    }

    // Tạo URL tạm để crop
    const imageUrl = URL.createObjectURL(file);

    setImageSrc(imageUrl);

    setCrop({
      x: 0,
      y: 0,
    });

    setZoom(1);
  };

  // ============================
  // LẤY VÙNG CROP
  // ============================

  const handleCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  // ============================
  // TẠO ẢNH ĐÃ CẮT
  // ============================

  const createCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      return;
    }

    try {
      const image = new Image();

      image.src = imageSrc;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();

        image.onerror = () => reject();
      });

      const canvas = document.createElement("canvas");

      const context = canvas.getContext("2d");

      if (!context) {
        setError("Không thể xử lý ảnh.");

        return;
      }

      canvas.width = croppedAreaPixels.width;

      canvas.height = croppedAreaPixels.height;

      context.drawImage(
        image,

        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,

        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
      );

      const croppedImage = canvas.toDataURL("image/jpeg", 0.9);

      setAvatar(croppedImage);

      setImageSrc(null);

      setSuccess("Cập nhật ảnh đại diện thành công.");

      setError("");
    } catch {
      setError("Có lỗi xảy ra khi cắt ảnh.");
    }
  };

  // ============================
  // HỦY CROP
  // ============================

  const cancelCrop = () => {
    setImageSrc(null);

    setError("");

    setZoom(1);

    setCrop({
      x: 0,
      y: 0,
    });
  };

  return (
    <div className="profile-layout">
      {/* ============================
          SIDEBAR
      ============================ */}

      <Sidebar
        role="Admin"
        userName="Nguyễn Văn An"
        onLogout={handleLogout}
        selectedMenu="Hồ sơ cá nhân"
      />

      {/* ============================
          NỘI DUNG
      ============================ */}

      <main className="profile-content">
        {/* HEADER */}

        <div className="profile-header">
          <div>
            <h1>Hồ sơ cá nhân</h1>

            <p>Quản lý thông tin cá nhân và ảnh đại diện của bạn.</p>
          </div>
        </div>

        {/* ============================
            CARD THÔNG TIN
        ============================ */}

        <section className="profile-card">
          <h2>Thông tin cá nhân</h2>

          <div className="profile-information">
            {/* AVATAR */}

            <div className="profile-avatar-section">
              <div className="profile-avatar">
                {avatar ? (
                  <img src={avatar} alt="Ảnh đại diện" />
                ) : (
                  <span>VA</span>
                )}
              </div>

              <label className="profile-upload-button">
                Thay đổi ảnh
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={handleAvatarChange}
                  hidden
                />
              </label>

              <p className="profile-file-note">
                JPG hoặc PNG
                <br />
                Tối đa 2MB
              </p>
            </div>

            {/* THÔNG TIN USER */}

            <div className="profile-user-info">
              <div className="profile-field">
                <span>Họ và tên</span>

                <strong>Nguyễn Văn An</strong>
              </div>

              <div className="profile-field">
                <span>Email công ty</span>

                <strong>an.nguyen@company.vn</strong>
              </div>

              <div className="profile-field">
                <span>Vai trò</span>

                <strong>Quản trị hệ thống</strong>
              </div>

              <div className="profile-field">
                <span>Phòng ban</span>

                <strong>Công nghệ thông tin</strong>
              </div>
            </div>
          </div>

          {/* ERROR */}

          {error && <div className="profile-error">{error}</div>}

          {/* SUCCESS */}

          {success && <div className="profile-success">{success}</div>}
        </section>

        {/* ============================
            CROP
        ============================ */}

        {imageSrc && (
          <section className="profile-card crop-card">
            <div className="crop-header">
              <h2>Cắt ảnh đại diện</h2>

              <p>Điều chỉnh vị trí và kích thước ảnh trước khi lưu.</p>
            </div>

            {/* VÙNG CROP */}

            <div className="crop-area">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>

            {/* ZOOM */}

            <div className="zoom-control">
              <label>Phóng to / thu nhỏ</label>

              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </div>

            {/* BUTTON */}

            <div className="crop-actions">
              <button
                type="button"
                className="cancel-avatar-button"
                onClick={cancelCrop}
              >
                Hủy
              </button>

              <button
                type="button"
                className="save-avatar-button"
                onClick={createCroppedImage}
              >
                Lưu ảnh đại diện
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default Profile;
