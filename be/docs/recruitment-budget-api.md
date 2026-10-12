# Recruitment Budget API

All endpoints are mounted at `/api/recruitment-budget` and require a Bearer access token. Requisition budgets use the existing `Requisition.budget` field; this module adds actual recruitment expenses and calculates spent/remaining totals.

## Department headcount plans

Headcount plans are stored by department and calendar year. The requisition `targetDate` determines which year's plan is checked when an approver approves the requisition. Only approved requisitions with a target date in that year consume the plan.

| Method | Endpoint | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/recruitment-budget/headcount?year=YYYY` | `headcount_budgets:read` | List active departments with allocated, approved, and remaining headcount. Defaults to the current year. |
| PUT | `/api/recruitment-budget/headcount/:departmentId` | `headcount_budgets:manage` | Create or replace a department's annual headcount plan. |

Example request body for `PUT`:

```json
{ "year": 2026, "headcount": 12 }
```

HR Manager and Admin can manage plans. A plan cannot be reduced below the department's already approved headcount for that year. Approving a requisition requires a configured plan and is rejected with `HEADCOUNT_BUDGET_EXCEEDED` when the resulting approved total would exceed it. The approval and headcount check run in one database transaction.

## Endpoints

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/api/recruitment-budget` | `recruitment_budgets:read` |
| GET | `/api/recruitment-budget/summary?month=YYYY-MM` | `recruitment_budgets:read` |
| GET | `/api/recruitment-budget/requisitions/:requisitionId/expenses` | `recruitment_budgets:read` |
| POST | `/api/recruitment-budget/requisitions/:requisitionId/expenses` | `recruitment_budgets:manage` |
| GET | `/api/recruitment-budget/expenses/:expenseId` | `recruitment_budgets:read` |
| PUT | `/api/recruitment-budget/expenses/:expenseId` | `recruitment_budgets:manage` |
| DELETE | `/api/recruitment-budget/expenses/:expenseId` | `recruitment_budgets:manage` |

## Create an expense

`POST /api/recruitment-budget/requisitions/:requisitionId/expenses`

```json
{
  "category": "job_posting",
  "amount": 2500000,
  "date": "2026-10-12",
  "vendor": "VietnamWorks",
  "description": "Gói đăng tin tuyển dụng"
}
```

Supported categories: `job_posting`, `agency_fee`, `interview`, `assessment`, `referral`, `other`.

## Update an expense

Send any non-empty subset of `category`, `amount`, `date`, `vendor`, and `description` to `PUT /api/recruitment-budget/expenses/:expenseId`.

## Response notes

- Budget list rows include `budgetSummary.allocated`, `budgetSummary.spent`, and `budgetSummary.remaining`.
- Summary `totalBudget` is the sum of visible requisition budgets; `totalSpent` and `remainingBudget` cover all recorded expenses; `spentThisMonth` and `spentByCategory` cover the requested month.
- Access to requisitions follows the ATS requisition visibility policy. Expense changes are audited.
- Run `npm run setup` to generate the Prisma client, apply schema changes, and seed permissions for existing roles.
