export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export interface CreateInterviewQuestionDTO {
  question: string;
  content?: string;
  difficulty: QuestionDifficulty;
  suggestedAnswer: string;
  competencyCriterionId: string;
}

export interface UpdateInterviewQuestionDTO {
  question?: string;
  content?: string;
  difficulty?: QuestionDifficulty;
  suggestedAnswer?: string;
  competencyCriterionId?: string;
}

export interface InterviewQuestionFilterQuery {
  search?: string;
  jobId?: string;
  competencyFrameworkId?: string;
  competencyCriterionId?: string;
  difficulty?: QuestionDifficulty;
}

export interface InterviewQuestionResponse {
  id: string;
  question: string;
  difficulty: string;
  suggestedAnswer: string;
  competencyCriterionId: string;
  createdAt: Date;
  updatedAt: Date;
  criterion?: {
    id: string;
    name: string;
    weight: number;
    frameworkId: string;
    framework?: {
      id: string;
      name: string;
    };
  };
}
