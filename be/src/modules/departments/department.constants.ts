/** Requisitions in these states are still considered open for a department. */
export const OPEN_REQUISITION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'OPEN',
] as const;
