export interface CreateCriterionDTO {
  id?: string;
  name: string;
  description?: string | null;
  weight: number;
}

export interface UpdateCriterionDTO {
  name?: string;
  description?: string | null;
  weight?: number;
}

export interface CreateCompetencyFrameworkDTO {
  name: string;
  description?: string | null;
  isActive?: boolean;
  jobTitleIds?: string[];
  criteria: CreateCriterionDTO[];
}

export interface UpdateCompetencyFrameworkDTO {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  jobTitleIds?: string[];
  criteria?: CreateCriterionDTO[];
}

export interface AssignJobsDTO {
  jobTitleIds: string[];
}

export interface CriterionResponse {
  id: string;
  frameworkId: string;
  name: string;
  description: string | null;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobMappingResponse {
  id: string;
  title: string;
  departmentId: string;
  departmentName?: string;
  status: string;
}

export interface CompetencyFrameworkResponse {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  totalWeight: number;
  createdAt: Date;
  updatedAt: Date;
  criteria: CriterionResponse[];
  jobTitles: {
  id: string;
  code: string;
  name: string;
  level: string;
}[];
}

export interface JobCriteriaResponse {
  jobId: string;
  jobTitle: string;
  frameworks: {
    id: string;
    name: string;
  }[];
  criteria: {
    frameworkId: string;
    frameworkName: string;
    criterionId: string;
    criterionName: string;
    description: string | null;
    weight: number;
  }[];
}
