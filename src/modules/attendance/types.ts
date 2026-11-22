import type { Eligibility } from "@/modules/memberships/types";
export type Visit = {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  branchId: string;
  branchName: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationSeconds: number | null;
  stale: boolean;
  overrideReason: string;
};
export type AttendanceCandidate = {
  id: string;
  name: string;
  memberCode: string;
  phoneEnding: string;
  access: Eligibility;
  membershipId: string | null;
  canOverride: boolean;
  openVisitId: string | null;
  openInBranch: boolean;
};
export type AttendanceData = {
  organization: { id: string; name: string; locale: string; timeZone: string };
  branches: { id: string; name: string }[];
  branchId: string;
  today: string;
  view: "today" | "inside" | "history";
  fromOn: string;
  throughOn: string;
  page: number;
  total: number;
  visits: Visit[];
  summary: {
    checkIns: number;
    inside: number;
    closed: number;
    averageSeconds: number | null;
    stale: number;
  };
  canManageSettings: boolean;
  canManageMembers: boolean;
  canReadPlans: boolean;
  canReadBilling: boolean;
  requestId: string;
};
export type AttendanceResult = {
  visitId: string;
  memberId: string;
  state: "checked_in" | "already_inside" | "checked_out";
  foreignOpen: boolean;
  requestId: string;
};
