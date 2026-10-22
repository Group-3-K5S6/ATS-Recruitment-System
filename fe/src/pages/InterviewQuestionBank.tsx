import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import { clearLocalSession } from "../services/session";

type Props = {
  role: Role;
  userName: string;
};

type DifficultyApi = "EASY" | "MEDIUM" | "HARD";
type DifficultyLabel = "Dễ" | "Trung bình" | "Khó";

type ApiQuestion = {
  id: string;
  question: string;
  difficulty: DifficultyApi;
  suggestedAnswer: string;
  competencyCriterionId: string;
  jobId: string | null;
};

type LookupCriterion = {
  id: string;
  name: string;
  weight: number;
};

type LookupFramework = {
  id: string;
  name: string;
  criteria: LookupCriterion[];
};

type LookupJob = {
  id: string;
  title: string;
  frameworks: LookupFramework[];
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    message?: string;
    code?: string;
  };
};

const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

const difficultyToLabel = (
  value: DifficultyApi
): DifficultyLabel => {
  switch (value) {
    case "EASY":
      return "Dễ";
    case "HARD":
      return "Khó";
    default:
      return "Trung bình";
  }
};

const getToken = () =>
  sessionStorage.getItem("accessToken");

export default function InterviewQuestionBank({
  role,
  userName,
}: Props) {
  const navigate = useNavigate();

  const [questions, setQuestions] =
    useState<ApiQuestion[]>([]);

  const [lookups, setLookups] =
    useState<LookupJob[]>([]);

  const [searchText, setSearchText] = useState("");
  const [filterJobId, setFilterJobId] = useState("");
  const [filterCriterionId, setFilterCriterionId] =
    useState("");

  const [jobId, setJobId] = useState("");
  const [criterionId, setCriterionId] = useState("");

  const [question, setQuestion] = useState("");
  const [difficulty, setDifficulty] =
    useState<DifficultyApi>("MEDIUM");
  const [goodAnswer, setGoodAnswer] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalError, setModalError] = useState("");

  const handleUnauthorized = useCallback(() => {
    clearLocalSession();
    navigate("/login");
  }, [navigate]);

  const loadLookups = useCallback(async () => {
    const token = getToken();

    if (!token) {
      handleUnauthorized();
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/interview-questions/lookups`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const body: ApiResponse<LookupJob[]> =
        await response.json();

      if (!response.ok || !body.success) {
        throw new Error(
          body.error?.message ||
            "Không thể tải dữ liệu chức danh."
        );
      }

      const data = body.data || [];

      setLookups(data);

      if (data.length > 0) {
        const firstJob = data[0];

        setJobId((current) =>
          current || firstJob.id
        );

        const firstCriterion =
          firstJob.frameworks
            .flatMap(
              (framework) => framework.criteria
            )[0];

        if (firstCriterion) {
          setCriterionId((current) =>
            current || firstCriterion.id
          );
        }
      }
    } catch (error) {
      console.error(error);
      setMessage(
        "Không thể tải chức danh và tiêu chí."
      );
    }
  }, [handleUnauthorized]);

  const loadQuestions = useCallback(async () => {
    const token = getToken();

    if (!token) {
      handleUnauthorized();
      return;
    }

    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }

      if (filterJobId) {
        params.set("jobId", filterJobId);
      }

      if (filterCriterionId) {
        params.set(
          "competencyCriterionId",
          filterCriterionId
        );
      }

      const query = params.toString();

      const response = await fetch(
        `${API_URL}/api/interview-questions${
          query ? `?${query}` : ""
        }`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const body: ApiResponse<ApiQuestion[]> =
        await response.json();

      if (!response.ok || !body.success) {
        throw new Error(
          body.error?.message ||
            "Không thể tải danh sách câu hỏi."
        );
      }

      setQuestions(body.data || []);
    } catch (error) {
      console.error(error);
      setMessage(
        "Không thể tải danh sách câu hỏi."
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized, searchText, filterJobId, filterCriterionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLookups(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLookups]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuestions();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadQuestions]);

  const selectedJob = useMemo(
    () =>
      lookups.find((item) => item.id === jobId),
    [lookups, jobId]
  );

  const formCriteria = useMemo(() => {
    if (!selectedJob) {
      return [];
    }

    const allCriteria =
      selectedJob.frameworks.flatMap(
        (framework) => framework.criteria
      );

    return Array.from(
      new Map(
        allCriteria.map((item) => [
          item.id,
          item,
        ])
      ).values()
    );
  }, [selectedJob]);

  const filterCriteria = useMemo(() => {
    const jobs = filterJobId
      ? lookups.filter(
          (item) => item.id === filterJobId
        )
      : lookups;

    const allCriteria = jobs.flatMap((job) =>
      job.frameworks.flatMap(
        (framework) => framework.criteria
      )
    );

    return Array.from(
      new Map(
        allCriteria.map((item) => [
          item.id,
          item,
        ])
      ).values()
    );
  }, [lookups, filterJobId]);

  const criterionMap = useMemo(() => {
    const map = new Map<
      string,
      {
        criterionName: string;
        jobTitles: string[];
      }
    >();

    lookups.forEach((job) => {
      job.frameworks.forEach((framework) => {
        framework.criteria.forEach(
          (criterion) => {
            const existing = map.get(
              criterion.id
            );

            if (existing) {
              if (
                !existing.jobTitles.includes(
                  job.title
                )
              ) {
                existing.jobTitles.push(
                  job.title
                );
              }
            } else {
              map.set(criterion.id, {
                criterionName: criterion.name,
                jobTitles: [job.title],
              });
            }
          }
        );
      });
    });

    return map;
  }, [lookups]);

  const handleJobChange = (value: string) => {
    setJobId(value);

    const job = lookups.find(
      (item) => item.id === value
    );

    const firstCriterion =
      job?.frameworks.flatMap(
        (framework) => framework.criteria
      )[0];

    setCriterionId(
      firstCriterion?.id || ""
    );
  };

  const handleFilterJobChange = (
    value: string
  ) => {
    setFilterJobId(value);
    setFilterCriterionId("");
  };

  const openAddModal = () => {
    setMessage("");
    setModalError("");
    setQuestion("");
    setGoodAnswer("");
    setDifficulty("MEDIUM");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (adding) return;
    setShowAddModal(false);
    setModalError("");
  };

  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !adding) {
        setShowAddModal(false);
        setModalError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAddModal, adding]);

  const handleAddQuestion = async () => {
    setModalError("");

    if (!jobId) {
      setModalError("Vui lòng chọn chức danh.");
      return;
    }

    if (!criterionId) {
      setModalError("Vui lòng chọn tiêu chí.");
      return;
    }

    if (!question.trim()) {
      setModalError(
        "Vui lòng nhập câu hỏi phỏng vấn."
      );
      return;
    }

    if (!goodAnswer.trim()) {
      setModalError(
        "Vui lòng nhập gợi ý câu trả lời tốt."
      );
      return;
    }

    const token = getToken();

    if (!token) {
      handleUnauthorized();
      return;
    }

    try {
      setAdding(true);

      const response = await fetch(
        `${API_URL}/api/interview-questions`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            question: question.trim(),
            difficulty,
            suggestedAnswer: goodAnswer.trim(),
            competencyCriterionId: criterionId,
            jobId,
          }),
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const body: ApiResponse<ApiQuestion> =
        await response.json();

      if (!response.ok || !body.success) {
        throw new Error(
          body.error?.message ||
            body.message ||
            "Không thể thêm câu hỏi."
        );
      }

      setQuestion("");
      setGoodAnswer("");
      setDifficulty("MEDIUM");

      setShowAddModal(false);
      setModalError("");
      setMessage("Thêm câu hỏi thành công.");
      await loadQuestions();
    } catch (error) {
      console.error(error);

      setModalError(
        error instanceof Error
          ? error.message
          : "Không thể thêm câu hỏi."
      );
    } finally {
      setAdding(false);
    }
  };

const handleDeleteQuestion = async (id: string) => {
  const confirmed = window.confirm(
    "Bạn có chắc muốn xóa câu hỏi này không?"
  );

  if (!confirmed) {
    return;
  }

  const token = getToken();

  if (!token) {
    handleUnauthorized();
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/interview-questions/${id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const body = await response.json();

    if (!response.ok || !body.success) {
      throw new Error(
        body.error?.message ||
          "Không thể xóa câu hỏi."
      );
    }

    setMessage("Xóa câu hỏi thành công.");

    await loadQuestions();
  } catch (error) {
    console.error(error);

    setMessage(
      error instanceof Error
        ? error.message
        : "Không thể xóa câu hỏi."
    );
  }
};

  const handleLogout = async () => {
    clearLocalSession();
    navigate("/login");
  };

  const handleMenuSelect = (
    label: string
  ) => {
    if (label === "Tổng quan") {
      navigate("/dashboard");
      return;
    }

    if (
      label === "Phòng ban & tổ chức"
    ) {
      navigate("/departments");
      return;
    }

    if (
      label === "Chức danh & dải lương"
    ) {
      navigate("/job-titles");
      return;
    }

    if (label === "Khung năng lực") {
      navigate("/competency-frameworks");
      return;
    }

    if (
      label ===
      "Ngân hàng câu hỏi phỏng vấn"
    ) {
      navigate(
        "/interview-question-bank"
      );
      return;
    }

    if (label === "Hồ sơ cá nhân") {
      navigate("/profile");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fb",
      }}
    >
      <Sidebar
        role={role}
        userName={userName}
        selectedMenu="Ngân hàng câu hỏi phỏng vấn"
        onMenuSelect={handleMenuSelect}
        onLogout={handleLogout}
      />

      <main
  className="dashboard-content interview-question-bank-content"
  style={{
    flex: 1,
    minWidth: 0,
  }}
>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "24px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: "32px" }}>
                Ngân hàng câu hỏi phỏng vấn
              </h1>
              <p style={{ color: "#64748b", margin: "8px 0 0" }}>
                Quản lý câu hỏi phỏng vấn theo chức danh và tiêu chí trong khung năng lực.
              </p>
            </div>
            <button type="button" onClick={openAddModal} style={primaryButtonStyle}>
              + Thêm câu hỏi
            </button>
          </div>

          {message && (
            <div
              role={message.includes("thành công") ? "status" : "alert"}
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "8px",
                border: message.includes("thành công")
                  ? "1px solid #a7d5b7"
                  : "1px solid #fecaca",
                background: message.includes("thành công") ? "#f0fdf4" : "#fef2f2",
                color: message.includes("thành công") ? "#166534" : "#b91c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span>{message}</span>
              <button
                type="button"
                onClick={() => setMessage("")}
                aria-label="Đóng thông báo"
                style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "20px" }}
              >
                ×
              </button>
            </div>
          )}

          <section
            style={{
              background: "#ffffff",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "24px",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              Danh sách câu hỏi
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <input
                type="text"
                value={searchText}
                onChange={(e) =>
                  setSearchText(
                    e.target.value
                  )
                }
                placeholder="Tìm kiếm câu hỏi..."
                style={inputStyle}
              />

              <select
                value={filterJobId}
                onChange={(e) =>
                  handleFilterJobChange(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  Tất cả chức danh
                </option>

                {lookups.map((job) => (
                  <option
                    key={job.id}
                    value={job.id}
                  >
                    {job.title}
                  </option>
                ))}
              </select>

              <select
                value={filterCriterionId}
                onChange={(e) =>
                  setFilterCriterionId(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  Tất cả tiêu chí
                </option>

                {filterCriteria.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  )
                )}
              </select>
            </div>

            {loading ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Đang tải danh sách câu hỏi...
              </div>
            ) : questions.length === 0 ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Không có câu hỏi phù hợp.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {questions.map((item) => {
                  const info = criterionMap.get(
                  item.competencyCriterionId
              );

                  const selectedQuestionJob = lookups.find(
                 (job) => job.id === item.jobId
         );

                  return (
                    <div
                      key={item.id}
                      style={{
                        border:
                          "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "18px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          gap: "16px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "17px",
                              marginBottom:
                                "8px",
                            }}
                          >
                            {item.question}
                          </div>

                          <div
                            style={{
                              color: "#64748b",
                              fontSize: "14px",
                            }}
                          >
                           {selectedQuestionJob?.title ||
                            "Chưa xác định chức danh"}{" "}
                               •{" "}
                            {info?.criterionName ||
                              "Chưa xác định tiêu chí"}
                          </div>
                        </div>

                       <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "10px",
  }}
>
  <div
    style={{
      background: "#eff6ff",
      color: "#1d4ed8",
      padding: "6px 12px",
      borderRadius: "20px",
      fontWeight: 600,
      fontSize: "14px",
    }}
  >
    {difficultyToLabel(item.difficulty)}
  </div>

  <button
    type="button"
    onClick={() =>
      void handleDeleteQuestion(item.id)
    }
    style={{
      border: "1px solid #dc2626",
      background: "#ffffff",
      color: "#dc2626",
      borderRadius: "8px",
      padding: "7px 12px",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    Xóa
  </button>
</div>
                      </div>

                      <div
                        style={{
                          marginTop: "14px",
                          background:
                            "#f8fafc",
                          padding:
                            "12px 14px",
                          borderRadius: "8px",
                        }}
                      >
                        <strong>
                          Gợi ý câu trả lời tốt:
                        </strong>{" "}
                        {item.suggestedAnswer}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            overflowY: "auto",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-interview-question-title"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "14px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                gap: "12px",
              }}
            >
              <h2 id="add-interview-question-title" style={{ margin: 0, fontSize: "23px" }}>
                Thêm câu hỏi phỏng vấn
              </h2>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={adding}
                aria-label="Đóng biểu mẫu"
                style={{ border: "none", background: "transparent", fontSize: "26px", cursor: adding ? "not-allowed" : "pointer", color: "#475569" }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddQuestion();
              }}
              style={{ padding: "22px 24px 24px" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "16px" }}>
                <div>
                  <label htmlFor="iqb-job" style={labelStyle}>Chức danh</label>
                  <select id="iqb-job" value={jobId} onChange={(event) => handleJobChange(event.target.value)} style={inputStyle}>
                    {lookups.length === 0 && <option value="">Chưa có chức danh</option>}
                    {lookups.map((job) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="iqb-criterion" style={labelStyle}>Tiêu chí trong khung năng lực</label>
                  <select id="iqb-criterion" value={criterionId} onChange={(event) => setCriterionId(event.target.value)} style={inputStyle}>
                    {formCriteria.length === 0 && <option value="">Chưa có tiêu chí</option>}
                    {formCriteria.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="iqb-difficulty" style={labelStyle}>Mức độ khó</label>
                  <select id="iqb-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyApi)} style={inputStyle}>
                    <option value="EASY">Dễ</option>
                    <option value="MEDIUM">Trung bình</option>
                    <option value="HARD">Khó</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: "18px" }}>
                <label htmlFor="iqb-question" style={labelStyle}>Câu hỏi phỏng vấn</label>
                <textarea
                  id="iqb-question"
                  autoFocus
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Nhập câu hỏi phỏng vấn"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div style={{ marginTop: "16px" }}>
                <label htmlFor="iqb-answer" style={labelStyle}>Gợi ý câu trả lời tốt</label>
                <textarea
                  id="iqb-answer"
                  value={goodAnswer}
                  onChange={(event) => setGoodAnswer(event.target.value)}
                  placeholder="Nhập gợi ý câu trả lời tốt"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              {modalError && (
                <div role="alert" style={{ marginTop: "16px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 12px", borderRadius: "8px" }}>
                  {modalError}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap", marginTop: "22px" }}>
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={adding}
                  style={{ padding: "11px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white", cursor: adding ? "not-allowed" : "pointer" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={adding || lookups.length === 0}
                  style={{ ...primaryButtonStyle, opacity: adding || lookups.length === 0 ? 0.6 : 1, cursor: adding || lookups.length === 0 ? "not-allowed" : "pointer" }}
                >
                  {adding ? "Đang lưu..." : "Lưu câu hỏi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: "7px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  padding: "11px 18px",
  fontWeight: 700,
};