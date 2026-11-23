import type { VersionValues, PlanQuery } from "./schemas";
export type PlanVersion = VersionValues & {
  id: string;
  planId: string;
  version: number;
  reason: string;
  createdAt: string;
};
export type Plan = {
  id: string;
  code: string;
  branchId: string;
  branchName: string;
  revision: number;
  archivedAt: string | null;
  current: PlanVersion;
};
export type Catalog = {
  organization: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timeZone: string;
  };
  branches: { id: string; name: string }[];
  plans: Plan[];
  total: number;
  page: number;
  pageSize: number;
  query: PlanQuery;
  canManage: boolean;
  canManageSettings: boolean;
  canManageMembers: boolean;
  canUseAllBranches: boolean;
  today: string;
  requestId: string;
};
export type VersionHistory = {
  plan: Plan;
  versions: PlanVersion[];
  page: number;
  total: number;
  pageSize: number;
  requestId: string;
};
export type PlanSnapshot = Readonly<
  VersionValues & {
    feeAgreementId?: string;
    catalogAmountMinor?: number;
    planId: string;
    planVersionId: string;
    planCode: string;
    planVersion: number;
    branchId: string;
  }
>;
export function snapshotPlan(plan: Plan, version = plan.current): PlanSnapshot {
  if (version.planId !== plan.id)
    throw new Error("Version does not belong to plan");
  return Object.freeze({
    planId: plan.id,
    planVersionId: version.id,
    planCode: plan.code,
    planVersion: version.version,
    branchId: plan.branchId,
    name: version.name,
    amountMinor: version.amountMinor,
    currency: version.currency,
    durationUnit: version.durationUnit,
    durationCount: version.durationCount,
    accessMode: version.accessMode,
    gymFloor: version.gymFloor,
    classes: version.classes,
    personalTraining: version.personalTraining,
  });
}
