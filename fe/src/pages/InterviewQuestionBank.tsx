import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import { clearLocalSession } from "../services/session";

type Props = {
  role: Role;
  userName: string;
};

type Difficulty = "Dễ" | "Trung bình" | "Khó";

type InterviewQuestion = {
  id: string;
  jobTitle: string;
  criterion: string;
  question: string;
  difficulty: Difficulty;
  goodAnswer: string;
};

const criteriaByJobTitle: Record<string, string[]> = {
  "Lập trình viên Backend": [
    "Kiến thức chuyên môn",
    "Kỹ năng giải quyết vấn đề",
    "Giao tiếp",
  ],
  "Chuyên viên tuyển dụng": [
    "Kiến thức chuyên môn",
    "Kỹ năng giải quyết vấn đề",
    "Giao tiếp",
  ],
  "Trưởng phòng Nhân sự": [
    "Kiến thức chuyên môn",
    "Kỹ năng giải quyết vấn đề",
    "Giao tiếp",
  ],
  "Chuyên viên Marketing": [
    "Kiến thức chuyên môn",
    "Kỹ năng giải quyết vấn đề",
    "Giao tiếp",
  ],
};

const initialQuestions: InterviewQuestion[] = [
  {
    id: "1",
    jobTitle: "Lập trình viên Backend",
    criterion: "Kiến thức chuyên môn",
    question: "REST API là gì và khi nào nên sử dụng?",
    difficulty: "Trung bình",
    goodAnswer:
      "Ứng viên giải thích được REST, HTTP method, resource và cách thiết kế API.",
  },
  {
    id: "2",
    jobTitle: "Lập trình viên Backend",
    criterion: "Kỹ năng giải quyết vấn đề",
    question: "Bạn sẽ xử lý thế nào khi API phản hồi chậm?",
    difficulty: "Khó",
    goodAnswer:
      "Ứng viên biết kiểm tra truy vấn, log, tài nguyên hệ thống và xác định nút thắt.",
  },
];

export default function InterviewQuestionBank({
  role,
  userName,
}: Props) {
  const navigate = useNavigate();

  const [questions, setQuestions] =
    useState<InterviewQuestion[]>(initialQuestions);

  const [searchText, setSearchText] = useState("");
  const [filterJobTitle, setFilterJobTitle] = useState("");
  const [filterCriterion, setFilterCriterion] = useState("");

  const [jobTitle, setJobTitle] = useState("Lập trình viên Backend");
  const [criterion, setCriterion] = useState("Kiến thức chuyên môn");
  const [question, setQuestion] = useState("");
  const [difficulty, setDifficulty] =
    useState<Difficulty>("Trung bình");
  const [goodAnswer, setGoodAnswer] = useState("");
  const [message, setMessage] = useState("");

  const jobTitles = Object.keys(criteriaByJobTitle);

  const formCriteria = criteriaByJobTitle[jobTitle] || [];

  const filterCriteria = filterJobTitle
    ? criteriaByJobTitle[filterJobTitle] || []
    : Array.from(
        new Set(Object.values(criteriaByJobTitle).flat())
      );

  const filteredQuestions = useMemo(() => {
    return questions.filter((item) => {
      const keyword = searchText.trim().toLowerCase();

      const matchSearch =
        !keyword ||
        item.question.toLowerCase().includes(keyword) ||
        item.goodAnswer.toLowerCase().includes(keyword);

      const matchJobTitle =
        !filterJobTitle || item.jobTitle === filterJobTitle;

      const matchCriterion =
        !filterCriterion || item.criterion === filterCriterion;

      return matchSearch && matchJobTitle && matchCriterion;
    });
  }, [
    questions,
    searchText,
    filterJobTitle,
    filterCriterion,
  ]);

  const handleAddQuestion = () => {
    setMessage("");

    if (!jobTitle) {
      setMessage("Vui lòng chọn chức danh.");
      return;
    }

    if (!criterion) {
      setMessage("Vui lòng chọn tiêu chí.");
      return;
    }

    if (!question.trim()) {
      setMessage("Vui lòng nhập câu hỏi phỏng vấn.");
      return;
    }

    if (!goodAnswer.trim()) {
      setMessage("Vui lòng nhập gợi ý câu trả lời tốt.");
      return;
    }

    const newQuestion: InterviewQuestion = {
      id: Date.now().toString(),
      jobTitle,
      criterion,
      question: question.trim(),
      difficulty,
      goodAnswer: goodAnswer.trim(),
    };

    setQuestions((prev) => [newQuestion, ...prev]);

    setQuestion("");
    setGoodAnswer("");
    setDifficulty("Trung bình");

    setMessage("Thêm câu hỏi thành công.");
  };

  const handleJobTitleChange = (value: string) => {
    setJobTitle(value);

    const criteria = criteriaByJobTitle[value] || [];
    setCriterion(criteria[0] || "");
  };

  const handleFilterJobTitleChange = (value: string) => {
    setFilterJobTitle(value);
    setFilterCriterion("");
  };

  const handleLogout = async () => {
  clearLocalSession();
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("atsUser");
  navigate("/login");
};

  const handleMenuSelect = (label: string) => {
    if (label === "Tổng quan") {
      navigate("/dashboard");
      return;
    }

    if (label === "Phòng ban & tổ chức") {
      navigate("/departments");
      return;
    }

    if (label === "Chức danh & dải lương") {
      navigate("/job-titles");
      return;
    }

    if (label === "Khung năng lực") {
      navigate("/competency-frameworks");
      return;
    }

    if (label === "Ngân hàng câu hỏi phỏng vấn") {
      navigate("/interview-question-bank");
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
        style={{
          flex: 1,
          padding: "42px 56px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          <div style={{ marginBottom: "28px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "32px",
              }}
            >
              Ngân hàng câu hỏi phỏng vấn
            </h1>

            <p
              style={{
                color: "#64748b",
                marginTop: "8px",
              }}
            >
              Quản lý câu hỏi phỏng vấn theo chức danh và tiêu chí
              trong khung năng lực.
            </p>
          </div>

          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              Thêm câu hỏi phỏng vấn
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              <div>
                <label style={labelStyle}>Chức danh</label>

                <select
                  value={jobTitle}
                  onChange={(e) =>
                    handleJobTitleChange(e.target.value)
                  }
                  style={inputStyle}
                >
                  {jobTitles.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>
                  Tiêu chí trong khung năng lực
                </label>

                <select
                  value={criterion}
                  onChange={(e) =>
                    setCriterion(e.target.value)
                  }
                  style={inputStyle}
                >
                  {formCriteria.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Mức độ khó</label>

                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(
                      e.target.value as Difficulty
                    )
                  }
                  style={inputStyle}
                >
                  <option value="Dễ">Dễ</option>
                  <option value="Trung bình">
                    Trung bình
                  </option>
                  <option value="Khó">Khó</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={labelStyle}>
                Câu hỏi phỏng vấn
              </label>

              <textarea
                value={question}
                onChange={(e) =>
                  setQuestion(e.target.value)
                }
                placeholder="Nhập câu hỏi phỏng vấn"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={labelStyle}>
                Gợi ý câu trả lời tốt
              </label>

              <textarea
                value={goodAnswer}
                onChange={(e) =>
                  setGoodAnswer(e.target.value)
                }
                placeholder="Nhập gợi ý câu trả lời tốt"
                rows={4}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                }}
              />
            </div>

            {message && (
              <div
                style={{
                  marginTop: "14px",
                  color:
                    message === "Thêm câu hỏi thành công."
                      ? "#15803d"
                      : "#dc2626",
                  fontWeight: 600,
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={handleAddQuestion}
                style={primaryButtonStyle}
              >
                + Thêm câu hỏi
              </button>
            </div>
          </section>

          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
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
                  "2fr 1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <input
                type="text"
                value={searchText}
                onChange={(e) =>
                  setSearchText(e.target.value)
                }
                placeholder="Tìm kiếm câu hỏi..."
                style={inputStyle}
              />

              <select
                value={filterJobTitle}
                onChange={(e) =>
                  handleFilterJobTitleChange(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  Tất cả chức danh
                </option>

                {jobTitles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>

              <select
                value={filterCriterion}
                onChange={(e) =>
                  setFilterCriterion(e.target.value)
                }
                style={inputStyle}
              >
                <option value="">
                  Tất cả tiêu chí
                </option>

                {filterCriteria.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {filteredQuestions.length === 0 ? (
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
                {filteredQuestions.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e2e8f0",
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
                            marginBottom: "8px",
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
                          {item.jobTitle} •{" "}
                          {item.criterion}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          padding: "6px 12px",
                          borderRadius: "20px",
                          height: "fit-content",
                          fontWeight: 600,
                          fontSize: "14px",
                        }}
                      >
                        {item.difficulty}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "14px",
                        background: "#f8fafc",
                        padding: "12px 14px",
                        borderRadius: "8px",
                      }}
                    >
                      <strong>
                        Gợi ý câu trả lời tốt:
                      </strong>{" "}
                      {item.goodAnswer}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
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
  cursor: "pointer",
};