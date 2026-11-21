import type { InvoiceQuery, LineInput } from "./schemas";
import type { PaymentPage } from "@/modules/payments/types";
export type Invoice = {
  id: string;
  memberId: string;
  membershipId: string | null;
  branchId: string;
  branchName: string;
  number: string | null;
  description: string;
  totalMinor: string;
  balanceMinor: string;
  currency: string;
  issuedOn: string | null;
  dueOn: string;
  status: "draft" | "issued";
  version: number;
  lineRevision: number;
  recipientName: string;
  recipientCode: string;
  createdAt: string;
};
export type InvoiceDetail = {
  payments: PaymentPage;
  invoice: Invoice;
  items: (LineInput & { position: number; totalMinor: number })[];
  issuer: {
    name: string;
    address: string;
    email: string;
    phone: string;
    footer: string;
    locale: string;
  };
  membershipTerm: { startOn: string; endOn: string } | null;
  organization: InvoiceList["organization"];
  subtotalMinor: number;
  discountMinor: number;
  canManageSettings: boolean;
  canManageMembers: boolean;
  requestId: string;
};
export type InvoiceList = {
  payments: PaymentPage;
  organization: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timeZone: string;
  };
  branches: { id: string; name: string }[];
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  query: InvoiceQuery;
  today: string;
  summary: {
    currencies: {
      currency: string;
      outstandingMinor: string;
      overdueMinor: string;
    }[];
    outstandingCount: number;
    overdueCount: number;
    draftCount: number;
  };
  canManageSettings: boolean;
  canManageMembers: boolean;
  requestId: string;
};
export type Recipient = {
  id: string;
  name: string;
  memberCode: string;
  branchId: string;
  branchName: string;
};
