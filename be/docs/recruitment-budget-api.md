# Recruitment Budget API

All endpoints are mounted at `/api/recruitment-budget` and require a Bearer access token. Requisition budgets use the existing `Requisition.budget` field; this module adds actual recruitment expenses and calculates spent/remaining totals.

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
