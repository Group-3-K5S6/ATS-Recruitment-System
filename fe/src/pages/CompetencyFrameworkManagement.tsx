import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";

import type { Role } from "../data/roleMenus";

import {
  clearLocalSession,
} from "../services/session";


type Criterion = {
  id: string;
  name: string;
  weight: number;
};


type CompetencyFramework = {
  id: string;
  jobTitles: string[];
  criteria: Criterion[];
};


type Props = {
  role: Role;
  userName: string;
};


const jobTitles = [
  "Chuyên viên tuyển dụng",
  "Lập trình viên Backend",
  "Trưởng phòng Nhân sự",
  "Chuyên viên Marketing",
];


const initialFrameworks:
  CompetencyFramework[] = [
    {
      id: "framework-1",

      jobTitles: [
        "Lập trình viên Backend",
        "Chuyên viên Marketing",
      ],

      criteria: [
        {
          id: "criterion-1",
          name: "Kiến thức chuyên môn",
          weight: 40,
        },

        {
          id: "criterion-2",
          name: "Kỹ năng giải quyết vấn đề",
          weight: 35,
        },

        {
          id: "criterion-3",
          name: "Giao tiếp",
          weight: 25,
        },
      ],
    },
  ];


function CompetencyFrameworkManagement({
  role,
  userName,
}: Props) {

  const navigate =
    useNavigate();


  const [
    frameworks,
    setFrameworks,
  ] =
    useState<CompetencyFramework[]>(
      initialFrameworks
    );


  const [
    selectedFrameworkId,
    setSelectedFrameworkId,
  ] =
    useState(
      initialFrameworks[0].id
    );


  const [
    message,
    setMessage,
  ] =
    useState("");


  const selectedFramework =
    frameworks.find(
      (item) =>
        item.id ===
        selectedFrameworkId
    );


  const totalWeight =
    useMemo(
      () =>
        selectedFramework
          ?.criteria
          .reduce(
            (
              total,
              criterion
            ) =>
              total +
              Number(
                criterion.weight
              ),
            0
          ) ?? 0,
      [selectedFramework]
    );


  const updateSelectedFramework =
    (
      updater:
        (
          current:
            CompetencyFramework
        ) =>
          CompetencyFramework
    ) => {

      setFrameworks(
        (current) =>
          current.map(
            (framework) =>
              framework.id ===
              selectedFrameworkId

                ? updater(
                    framework
                  )

                : framework
          )
      );

      setMessage("");
    };


  const createFramework =
    () => {

      const id =
        `framework-${Date.now()}`;


      const newFramework:
        CompetencyFramework = {

        id,

        jobTitles: [],

        criteria: [
          {
            id:
              `criterion-${Date.now()}`,
            name: "",
            weight: 0,
          },
        ],
      };


      setFrameworks(
        (current) => [
          ...current,
          newFramework,
        ]
      );


      setSelectedFrameworkId(
        id
      );


      setMessage("");
    };


  const toggleJobTitle =
    (
      jobTitle: string
    ) => {

      if (!selectedFramework) {
        return;
      }


      updateSelectedFramework(
        (current) => {

          const exists =
            current
              .jobTitles
              .includes(
                jobTitle
              );


          return {
            ...current,

            jobTitles:
              exists

                ? current
                    .jobTitles
                    .filter(
                      (item) =>
                        item !==
                        jobTitle
                    )

                : [
                    ...current
                      .jobTitles,
                    jobTitle,
                  ],
          };
        }
      );
    };


  const addCriterion =
    () => {

      updateSelectedFramework(
        (current) => ({

          ...current,

          criteria: [
            ...current.criteria,

            {
              id:
                `criterion-${Date.now()}`,

              name: "",

              weight: 0,
            },
          ],

        })
      );
    };


  const updateCriterion =
    (
      criterionId: string,
      field:
        "name" |
        "weight",
      value:
        string |
        number
    ) => {

      updateSelectedFramework(
        (current) => ({

          ...current,

          criteria:
            current.criteria.map(
              (criterion) =>

                criterion.id ===
                criterionId

                  ? {
                      ...criterion,
                      [field]:
                        value,
                    }

                  : criterion
            ),

        })
      );
    };


  const removeCriterion =
    (
      criterionId: string
    ) => {

      updateSelectedFramework(
        (current) => ({

          ...current,

          criteria:
            current.criteria
              .filter(
                (criterion) =>
                  criterion.id !==
                  criterionId
              ),

        })
      );
    };


  const saveFramework =
    () => {

      if (!selectedFramework) {
        return;
      }


      if (
        selectedFramework
          .jobTitles
          .length === 0
      ) {

        setMessage(
          "Vui lòng chọn ít nhất một chức danh áp dụng."
        );

        return;
      }


      if (
        selectedFramework
          .criteria
          .length === 0
      ) {

        setMessage(
          "Khung năng lực phải có tiêu chí đánh giá."
        );

        return;
      }


      const hasEmptyCriterion =
        selectedFramework
          .criteria
          .some(
            (criterion) =>
              !criterion
                .name
                .trim()
          );


      if (hasEmptyCriterion) {

        setMessage(
          "Vui lòng nhập đầy đủ tên tiêu chí."
        );

        return;
      }


      if (
        totalWeight !== 100
      ) {

        setMessage(
          "Tổng trọng số của khung năng lực phải bằng 100%."
        );

        return;
      }


      setMessage(
        "Lưu khung năng lực thành công."
      );
    };


  const handleLogout =
    async () => {

      clearLocalSession();

      sessionStorage.removeItem(
        "accessToken"
      );

      sessionStorage.removeItem(
        "refreshToken"
      );

      sessionStorage.removeItem(
        "atsUser"
      );


      navigate(
        "/login",
        {
          replace: true,
        }
      );
    };


  const handleMenuSelect =
    (
      label: string
    ) => {

      if (
        label ===
        "Tổng quan"
      ) {
        navigate(
          "/dashboard"
        );

        return;
      }


      if (
        label ===
        "Phòng ban & tổ chức"
      ) {
        navigate(
          "/departments"
        );

        return;
      }


      if (
        label ===
        "Chức danh & dải lương"
      ) {
        navigate(
          "/job-titles"
        );

        return;
      }


      if (
        label ===
        "Khung năng lực"
      ) {
        navigate(
          "/competency-frameworks"
        );

        return;
      }


      if (
        label ===
        "Hồ sơ cá nhân"
      ) {
        navigate(
          "/profile"
        );
      }
    };


  if (!selectedFramework) {
    return null;
  }


  return (

    <div className=
      "dashboard-layout"
    >

      <Sidebar
        role={role}

        userName={
          userName
        }

        onLogout={
          handleLogout
        }

        selectedMenu=
          "Khung năng lực"

        onMenuSelect={
          handleMenuSelect
        }
      />


      <main className=
        "dashboard-content"
      >

        <div
          style={{
            padding: "30px",
            maxWidth: "1180px",
          }}
        >

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap: "16px",
              flexWrap:
                "wrap",
              marginBottom:
                "24px",
            }}
          >

            <div>

            

              <h1
                style={{
                  margin:
                    "0 0 8px",
                }}
              >
                Quản lý khung năng lực
              </h1>


              <p
                style={{
                  margin: 0,
                  color:
                    "#64748b",
                }}
              >
                Khai báo bộ tiêu chí
                đánh giá và trọng số
                cho từng chức danh.
              </p>

            </div>


            <button
              type="button"

              onClick={
                createFramework
              }

              style={{
                border: 0,
                borderRadius:
                  "8px",
                padding:
                  "11px 18px",
                background:
                  "#2563eb",
                color:
                  "#ffffff",
                fontWeight:
                  700,
                cursor:
                  "pointer",
              }}
            >
              + Tạo khung năng lực
            </button>

          </div>


          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "260px minmax(0, 1fr)",
              gap: "20px",
              alignItems:
                "start",
            }}
          >

            {/* DANH SÁCH KHUNG */}

            <section
              style={{
                background:
                  "#ffffff",
                border:
                  "1px solid #e2e8f0",
                borderRadius:
                  "12px",
                padding:
                  "16px",
              }}
            >

              <h3
                style={{
                  margin:
                    "0 0 14px",
                }}
              >
                Các khung năng lực
              </h3>


              <div
                style={{
                  display:
                    "grid",
                  gap: "8px",
                }}
              >

                {
                  frameworks.map(
                    (
                      framework,
                      index
                    ) => (

                      <button
                        key={
                          framework.id
                        }

                        type="button"

                        onClick={
                          () =>
                            setSelectedFrameworkId(
                              framework.id
                            )
                        }

                        style={{
                          width:
                            "100%",

                          textAlign:
                            "left",

                          border:
                            selectedFrameworkId ===
                            framework.id

                              ? "1px solid #2563eb"

                              : "1px solid #e2e8f0",

                          background:
                            selectedFrameworkId ===
                            framework.id

                              ? "#eff6ff"

                              : "#ffffff",

                          borderRadius:
                            "8px",

                          padding:
                            "12px",

                          cursor:
                            "pointer",
                        }}
                      >

                        <strong>
                          Khung năng lực{" "}
                          {index + 1}
                        </strong>


                        <div
                          style={{
                            marginTop:
                              "6px",
                            fontSize:
                              "13px",
                            color:
                              "#64748b",
                          }}
                        >

                          {
                            framework
                              .jobTitles
                              .length
                          }{" "}
                          chức danh

                        </div>

                      </button>
                    )
                  )
                }

              </div>

            </section>


            {/* NỘI DUNG KHUNG */}

            <section
              style={{
                background:
                  "#ffffff",
                border:
                  "1px solid #e2e8f0",
                borderRadius:
                  "12px",
                padding:
                  "22px",
              }}
            >

              <div
                style={{
                  marginBottom:
                    "24px",
                }}
              >

                <h2
                  style={{
                    margin:
                      "0 0 8px",
                  }}
                >
                  Chức danh áp dụng
                </h2>


                <p
                  style={{
                    margin:
                      "0 0 14px",
                    color:
                      "#64748b",
                  }}
                >
                  Một khung năng lực
                  có thể dùng cho
                  nhiều chức danh.
                </p>


                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap:
                      "10px",
                  }}
                >

                  {
                    jobTitles.map(
                      (
                        jobTitle
                      ) => {

                        const checked =
                          selectedFramework
                            .jobTitles
                            .includes(
                              jobTitle
                            );


                        return (

                          <label
                            key={
                              jobTitle
                            }

                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap:
                                "10px",
                              border:
                                checked

                                  ? "1px solid #2563eb"

                                  : "1px solid #e2e8f0",
                              borderRadius:
                                "8px",
                              padding:
                                "12px",
                              cursor:
                                "pointer",
                              background:
                                checked

                                  ? "#eff6ff"

                                  : "#ffffff",
                            }}
                          >

                            <input
                              type=
                                "checkbox"

                              checked={
                                checked
                              }

                              onChange={
                                () =>
                                  toggleJobTitle(
                                    jobTitle
                                  )
                              }
                            />

                            <span>
                              {jobTitle}
                            </span>

                          </label>

                        );
                      }
                    )
                  }

                </div>

              </div>


              <div>

                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap:
                      "12px",
                    flexWrap:
                      "wrap",
                    marginBottom:
                      "14px",
                  }}
                >

                  <div>

                    <h2
                      style={{
                        margin:
                          "0 0 6px",
                      }}
                    >
                      Tiêu chí đánh giá
                    </h2>


                    <p
                      style={{
                        margin: 0,
                        color:
                          "#64748b",
                      }}
                    >
                      Mỗi tiêu chí có
                      một trọng số.
                    </p>

                  </div>


                  <button
                    type="button"

                    onClick={
                      addCriterion
                    }

                    style={{
                      border:
                        "1px solid #2563eb",
                      borderRadius:
                        "8px",
                      padding:
                        "9px 14px",
                      background:
                        "#ffffff",
                      color:
                        "#2563eb",
                      fontWeight:
                        700,
                      cursor:
                        "pointer",
                    }}
                  >
                    + Thêm tiêu chí
                  </button>

                </div>


                <div
                  style={{
                    overflowX:
                      "auto",
                  }}
                >

                  <table
                    style={{
                      width:
                        "100%",
                      borderCollapse:
                        "collapse",
                    }}
                  >

                    <thead>

                      <tr
                        style={{
                          background:
                            "#f8fafc",
                        }}
                      >

                        <th
                          style={{
                            textAlign:
                              "left",
                            padding:
                              "12px",
                            borderBottom:
                              "1px solid #e2e8f0",
                          }}
                        >
                          Tiêu chí
                        </th>


                        <th
                          style={{
                            width:
                              "170px",
                            textAlign:
                              "left",
                            padding:
                              "12px",
                            borderBottom:
                              "1px solid #e2e8f0",
                          }}
                        >
                          Trọng số (%)
                        </th>


                        <th
                          style={{
                            width:
                              "90px",
                            padding:
                              "12px",
                            borderBottom:
                              "1px solid #e2e8f0",
                          }}
                        >
                          Thao tác
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {
                        selectedFramework
                          .criteria
                          .map(
                            (
                              criterion
                            ) => (

                              <tr
                                key={
                                  criterion.id
                                }
                              >

                                <td
                                  style={{
                                    padding:
                                      "12px",
                                    borderBottom:
                                      "1px solid #e2e8f0",
                                  }}
                                >

                                  <input
                                    type="text"

                                    value={
                                      criterion.name
                                    }

                                    placeholder=
                                      "Nhập tiêu chí đánh giá"

                                    onChange={
                                      (
                                        event
                                      ) =>
                                        updateCriterion(
                                          criterion.id,
                                          "name",
                                          event
                                            .target
                                            .value
                                        )
                                    }

                                    style={{
                                      width:
                                        "100%",
                                      boxSizing:
                                        "border-box",
                                      border:
                                        "1px solid #cbd5e1",
                                      borderRadius:
                                        "7px",
                                      padding:
                                        "9px 10px",
                                    }}
                                  />

                                </td>


                                <td
                                  style={{
                                    padding:
                                      "12px",
                                    borderBottom:
                                      "1px solid #e2e8f0",
                                  }}
                                >

                                  <input
                                    type="number"

                                    min={
                                      0
                                    }

                                    max={
                                      100
                                    }

                                    value={
                                      criterion.weight
                                    }

                                    onChange={
                                      (
                                        event
                                      ) =>
                                        updateCriterion(
                                          criterion.id,
                                          "weight",
                                          Number(
                                            event
                                              .target
                                              .value
                                          )
                                        )
                                    }

                                    style={{
                                      width:
                                        "100%",
                                      boxSizing:
                                        "border-box",
                                      border:
                                        "1px solid #cbd5e1",
                                      borderRadius:
                                        "7px",
                                      padding:
                                        "9px 10px",
                                    }}
                                  />

                                </td>


                                <td
                                  style={{
                                    padding:
                                      "12px",
                                    textAlign:
                                      "center",
                                    borderBottom:
                                      "1px solid #e2e8f0",
                                  }}
                                >

                                  <button
                                    type=
                                      "button"

                                    onClick={
                                      () =>
                                        removeCriterion(
                                          criterion.id
                                        )
                                    }

                                    style={{
                                      border:
                                        "1px solid #ef4444",
                                      borderRadius:
                                        "7px",
                                      background:
                                        "#ffffff",
                                      color:
                                        "#dc2626",
                                      padding:
                                        "7px 10px",
                                      cursor:
                                        "pointer",
                                    }}
                                  >
                                    Xóa
                                  </button>

                                </td>

                              </tr>

                            )
                          )
                      }

                    </tbody>

                  </table>

                </div>


                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap:
                      "16px",
                    flexWrap:
                      "wrap",
                    marginTop:
                      "20px",
                    padding:
                      "16px",
                    background:
                      totalWeight ===
                      100

                        ? "#f0fdf4"

                        : "#fff7ed",
                    border:
                      totalWeight ===
                      100

                        ? "1px solid #86efac"

                        : "1px solid #fdba74",
                    borderRadius:
                      "10px",
                  }}
                >

                  <div>

                    <strong>
                      Tổng trọng số:
                      {" "}
                      {totalWeight}%
                    </strong>


                    <div
                      style={{
                        marginTop:
                          "4px",
                        fontSize:
                          "13px",
                        color:
                          totalWeight ===
                          100

                            ? "#15803d"

                            : "#c2410c",
                      }}
                    >

                      {
                        totalWeight ===
                        100

                          ? "Đã đủ 100%."

                          : "Tổng trọng số phải bằng 100%."
                      }

                    </div>

                  </div>


                  <button
                    type="button"

                    onClick={
                      saveFramework
                    }

                    style={{
                      border: 0,
                      borderRadius:
                        "8px",
                      padding:
                        "11px 18px",
                      background:
                        "#2563eb",
                      color:
                        "#ffffff",
                      fontWeight:
                        700,
                      cursor:
                        "pointer",
                    }}
                  >
                    Lưu khung năng lực
                  </button>

                </div>


                {
                  message && (

                    <p
                      style={{
                        marginTop:
                          "14px",
                        color:
                          message.includes(
                            "thành công"
                          )

                            ? "#15803d"

                            : "#dc2626",
                        fontWeight:
                          600,
                      }}
                    >
                      {message}
                    </p>

                  )
                }


                <p
                  style={{
                    marginTop:
                      "22px",
                    padding:
                      "12px 14px",
                    background:
                      "#f8fafc",
                    borderLeft:
                      "4px solid #2563eb",
                    color:
                      "#475569",
                  }}
                >
                  Bộ tiêu chí và trọng số
                  của khung năng lực này
                  sẽ được dùng để sinh
                  phiếu đánh giá phỏng vấn
                  ở Sprint 6.
                </p>

              </div>

            </section>

          </div>

        </div>

      </main>

    </div>
  );
}


export default CompetencyFrameworkManagement;