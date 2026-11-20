import type { SettingsValues } from "./schemas";
import type { Role } from "@/server/security/permissions";
export type Branch = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  version: number;
};
export type Staff = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
  branchIds: string[];
};
export type SettingsData = {
  organizationId: string;
  version: number;
  values: SettingsValues;
  editableFields: string[];
  canManageStaff: boolean;
  branches: Branch[];
  staff: Staff[];
  staffPage: number;
  staffTotal: number;
  audit: {
    id: string;
    action: string;
    actorName: string;
    reason: string;
    occurredAt: string;
  }[];
  requestId: string;
};
