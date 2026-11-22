import type { Directory, Member } from "./types";
import type { PaymentPage } from "@/modules/payments/types";
import type { Visit } from "@/modules/attendance/types";
import type {
  MembershipContext,
  Eligibility,
} from "@/modules/memberships/types";
export type MemberNote = {
  id: string;
  body: string | null;
  visibility: "operational" | "management";
  authorName: string;
  createdAt: string;
  withdrawn: boolean;
  withdrawalReason: string | null;
  canWithdraw: boolean;
};
export type Profile = {
  visits: { rows: Visit[]; total: number };
  payments: PaymentPage;
  organization: Directory["organization"];
  branches: Directory["branches"];
  today: string;
  canManageSettings: boolean;
  member: Member;
  contact: { name: string; phone: string; relationship: string } | null;
  notes: MemberNote[];
  notesPage: number;
  notesTotal: number;
  canManage: boolean;
  history: {
    id: string;
    action: string;
    reason: string;
    actorName: string;
    occurredAt: string;
  }[];
  eligibility: Eligibility;
  memberships: MembershipContext;
  requestId: string;
};
