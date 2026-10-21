# Automatic job posting expiration

Published jobs with an `applicationDeadline` are changed to `EXPIRED` by the backend scheduler after the deadline. Date-only deadlines are interpreted through the end of that date in Vietnam time. The scheduler checks on startup to catch up after downtime, then at midnight Vietnam time each day. Expiration is idempotent and writes a `JOB_POSTING_EXPIRED` audit record.

The public jobs API already filters out postings whose deadline has passed, so expired postings stop appearing immediately at the deadline; the scheduled task updates their stored status and audit trail. No schema migration is needed because `applicationDeadline` already exists on `Job`.

Recruiters can unpublish only jobs assigned to them through `POST /api/jobs/:id/unpublish`. The existing `jobs:publish` permission is required. HR Managers and Admins retain their existing global access.
