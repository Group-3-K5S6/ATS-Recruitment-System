import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasAnyAllowedRole,
  REQUISITION_APPROVAL_ROLES,
} from '../src/features/sprint3/routeAccess.ts';

test('requisition approval page allows approvers and HR Managers only', () => {
  assert.deepEqual(REQUISITION_APPROVAL_ROLES, ['APPROVER', 'HR_MANAGER']);
  assert.equal(hasAnyAllowedRole(['APPROVER'], REQUISITION_APPROVAL_ROLES), true);
  assert.equal(hasAnyAllowedRole(['HR_MANAGER'], REQUISITION_APPROVAL_ROLES), true);
  assert.equal(hasAnyAllowedRole(['RECRUITER'], REQUISITION_APPROVAL_ROLES), false);
});
