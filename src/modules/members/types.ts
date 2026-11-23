import type { DirectoryQuery, MemberValues } from "./schemas";
export type Member = MemberValues & {
  id: string;
  memberCode: string;
  branchName: string;
  version: number;
  archivedAt: string | null;
};
export type DuplicateMatch = {
  id: string;
  memberCode: string;
  name: string;
  branchName: string;
};
export type Directory = {
  organization: { id: string; name: string; locale: string; timeZone: string };
  branches: { id: string; name: string }[];
  members: Member[];
  total: number;
  page: number;
  pageSize: number;
  today: string;
  canManageSettings: boolean;
  query: DirectoryQuery;
  canSetMonthlyFee?: boolean;
  monthlyPlans?: {
    id: string;
    name: string;
    branchId: string;
    amountMinor: number;
    currency: string;
  }[];
  monthlyPlanCount?: number;
  requestId: string;
};
