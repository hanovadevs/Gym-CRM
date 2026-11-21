import type { z } from "zod";
import type {
  activationResults,
  receiptSnapshot,
  PaymentQuery,
} from "./schemas";
export type ActivationResult = (typeof activationResults)[number];
export type Payment = {
  id: string;
  invoiceId: string;
  memberId: string;
  branchId: string;
  receiptNumber: string;
  amountMinor: string;
  currency: string;
  method: "cash" | "bank_transfer" | "other";
  paidOn: string;
  reference: string;
  note: string;
  balanceAfterMinor: string;
  activationResult: ActivationResult;
  createdAt: string;
  recipientName: string;
  recipientCode: string;
  invoiceNumber: string;
  description: string;
  branchName: string;
};
export type PaymentResult = {
  paymentId: string;
  receiptNumber: string;
  balanceAfterMinor: string;
  activationResult: ActivationResult;
  requestId: string;
};
export type PaymentPage = {
  payments: Payment[];
  total: number;
  page: number;
  pageSize: number;
  query: PaymentQuery;
  summary: { currency: string; amountMinor: string }[];
  requestId: string;
};
export type Receipt = {
  payment: Payment;
  snapshot: z.infer<typeof receiptSnapshot>;
  organization: { id: string; name: string };
  invoiceBalanceMinor: string;
  canManageSettings: boolean;
  canManageMembers: boolean;
  requestId: string;
};
export type PaymentTarget = {
  id: string;
  number: string;
  description: string;
  recipientName: string;
  recipientCode: string;
  branchName: string;
  balanceMinor: string;
  currency: string;
  issuedOn: string;
};
export const methodLabel = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
} as const;
export const activationLabel: Record<ActivationResult, string> = {
  activated: "Linked membership activated. Other access rules still apply.",
  already_active: "Linked membership was already active.",
  partial:
    "Partial payment recorded. A balance remains; other access rules still apply.",
  not_linked: "Payment recorded against this invoice.",
  archived:
    "Payment recorded for an archived member. Membership access remains blocked.",
  cancelled: "Payment recorded. Cancelled membership remains cancelled.",
  expired: "Payment recorded. Expired membership dates are unchanged.",
};
