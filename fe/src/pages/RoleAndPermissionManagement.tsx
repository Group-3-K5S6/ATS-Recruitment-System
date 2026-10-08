import { useState } from "react";

import RoleAssignment from "./RoleAssignment";
import RolePermissionManagement from "./RolePermissionManagement";

type TabType = "assignment" | "matrix";

export default function RoleAndPermissionManagement() {
  const [activeTab, setActiveTab] =
    useState<TabType>("assignment");

  return (
    <div className="role-permission-page">
      <div className="role-permission-heading">
        <div>
          <h1>Vai trò & quyền</h1>

          <p>
            Quản lý vai trò của tài khoản và cấu hình
            quyền truy cập của từng vai trò.
          </p>
        </div>
      </div>

      <div className="role-permission-tabs">
        <button
          type="button"
          className={
            activeTab === "assignment"
              ? "role-permission-tab active"
              : "role-permission-tab"
          }
          onClick={() =>
            setActiveTab("assignment")
          }
        >
          Gán vai trò cho tài khoản
        </button>

        <button
          type="button"
          className={
            activeTab === "matrix"
              ? "role-permission-tab active"
              : "role-permission-tab"
          }
          onClick={() =>
            setActiveTab("matrix")
          }
        >
          Ma trận phân quyền
        </button>
      </div>

      <div className="role-permission-content">
        {activeTab === "assignment" && (
          <RoleAssignment />
        )}

        {activeTab === "matrix" && (
          <RolePermissionManagement />
        )}
      </div>
    </div>
  );
}