export type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
  version: number;
};
export type ExpenseRow = {
  id: string;
  expenseId: string;
  kind: "expense" | "reversal";
  number: string;
  description: string;
  payee: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  cashOn: string;
  amountMinor: string;
  currency: string;
  method: string;
  reference: string;
  fileId: string | null;
  reversed: boolean;
  reversalReason: string;
  replacesExpenseId: string | null;
  replacementId: string | null;
};
export type ExpensesData = {
  organization: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timeZone: string;
  };
  branches: { id: string; name: string }[];
  branchId: string;
  categories: ExpenseCategory[];
  today: string;
  from: string;
  to: string;
  q: string;
  kind: "all" | "expense" | "reversal";
  categoryId: string;
  page: number;
  total: number;
  rows: ExpenseRow[];
  summary: {
    currency: string;
    postedMinor: string;
    reversedMinor: string;
    netMinor: string;
  }[];
  canManageSettings: boolean;
  canManageMembers: boolean;
  canReadPlans: boolean;
  canReadBilling: boolean;
  requestId: string;
};
export type ExpenseResult = {
  expenseId: string;
  number: string;
  requestId: string;
};
