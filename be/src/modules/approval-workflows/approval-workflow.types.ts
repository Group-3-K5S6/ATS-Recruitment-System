export interface SavedWorkflowRange {
  minSalary: number;
  maxSalary: number | null;
  approverIds: string[];
}

export interface SavedWorkflow {
  id: string;
  departmentId: string;
  version: number;
  ranges: SavedWorkflowRange[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApprovalStepSnapshot {
  step: number;
  approverId: string;
  status: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  decisionAt?: string | null;
  notes?: string | null;
}

export interface SaveWorkflowInput {
  departmentId: string;
  activation?: 'NEW_REQUESTS_ONLY';
  ranges: SavedWorkflowRange[];
}

export class ApprovalWorkflowError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'ApprovalWorkflowError';
  }
}
