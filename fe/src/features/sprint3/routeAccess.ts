export const REQUISITION_APPROVAL_ROLES = ['APPROVER', 'HR_MANAGER'] as const;

export function hasAnyAllowedRole(
  userRoles: readonly string[],
  allowedRoles: readonly string[],
): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}
