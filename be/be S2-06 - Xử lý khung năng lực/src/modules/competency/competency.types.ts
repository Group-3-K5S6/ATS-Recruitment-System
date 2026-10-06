export interface CreateCriterionDto {
  name: string;
  description?: string;
  weight: number;
}

export interface UpdateCriterionDto {
  id?: string;
  name?: string;
  description?: string;
  weight?: number;
}

export interface CreateCompetencyFrameworkDto {
  name: string;
  description?: string;
  isActive?: boolean;
  jobIds?: string[];
  criteria: CreateCriterionDto[];
}

export interface UpdateCompetencyFrameworkDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  jobIds?: string[];
  criteria?: UpdateCriterionDto[];
}

export interface CompetencyCriterionResponse {
  id: string;
  frameworkId: string;
  name: string;
  description: string | null;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignedJobSummary {
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
  criteria: CompetencyCriterionResponse[];
  jobs?: AssignedJobSummary[];
}

export interface AssignJobsDto {
  jobIds: string[];
}
