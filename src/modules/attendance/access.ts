import "server-only";
import type { PoolClient } from "pg";
import type { Scope } from "@/server/security/service";
import { BusinessError } from "@/server/errors";
import { eligibility, type AccessPeriod } from "@/modules/memberships/state";
import { can } from "@/server/security/permissions";
import type { AttendanceCandidate } from "./types";
export type AccessMember = {
  id: string;
  name: string;
  memberCode: string;
  homeBranchId: string;
  archived: boolean;
  phoneEnding: string;
};
type Period = AccessPeriod & {
  id: string;
  homeBranchId: string;
  allBranches: boolean;
  gymFloor: boolean;
  classes: boolean;
  personalTraining: boolean;
};
type AccessFacts = {
  periods: Period[];
  due: boolean;
  open: { id: string; branch_id: string } | null;
};
export async function attendanceOrganization(db: PoolClient, scope: Scope) {
  return (
    await db.query(
      'select id,name,locale,time_zone as "timeZone",grace_days as "graceDays",debt_blocks_access as "debtBlocksAccess",(clock_timestamp() at time zone time_zone)::date::text today from gym.organizations where id=$1',
      [scope.organizationId],
    )
  ).rows[0] as {
    id: string;
    name: string;
    locale: string;
    timeZone: string;
    graceDays: number;
    debtBlocksAccess: boolean;
    today: string;
  };
}
// A reception desk gets only the identity/access facts necessary to admit a
// member here. This never grants permission to read their full home-branch profile.
export async function accessMember(
  db: PoolClient,
  scope: Scope,
  id: string,
  branchId: string,
  lock = false,
): Promise<AccessMember> {
  const result = await db.query<AccessMember>(
    `select m.id,m.name,m.member_code as "memberCode",m.home_branch_id as "homeBranchId",m.archived_at is not null archived,right(m.normalized_phone,4) as "phoneEnding" from gym.members m where m.organization_id=$1 and m.id=$2 and (
    m.home_branch_id=any($3::uuid[]) or exists(select 1 from gym.attendance_visits v where v.organization_id=m.organization_id and v.member_id=m.id and v.branch_id=$4 and v.checked_out_at is null)
    or exists(select 1 from gym.memberships p join gym.organizations o on o.id=p.organization_id where p.organization_id=m.organization_id and p.member_id=m.id and p.snapshot->>'accessMode'='all_branches' and p.start_on<=(clock_timestamp() at time zone o.time_zone)::date and p.end_on_exclusive+o.grace_days>(clock_timestamp() at time zone o.time_zone)::date and (p.cancelled_effective_on is null or p.cancelled_effective_on>(clock_timestamp() at time zone o.time_zone)::date))) ${lock ? "for update of m" : ""}`,
    [scope.organizationId, id, [...scope.authorizedBranchIds], branchId],
  );
  if (!result.rows[0])
    throw new BusinessError(
      "NOT_FOUND",
      "Member not found in your attendance scope.",
    );
  return result.rows[0];
}
export async function memberAccess(
  db: PoolClient,
  scope: Scope,
  member: AccessMember,
  branchId: string,
  benefit: "gymFloor" | "classes" | "personalTraining" = "gymFloor",
  facts?: AccessFacts,
  organization?: Awaited<ReturnType<typeof attendanceOrganization>>,
): Promise<AttendanceCandidate> {
  const org = organization ?? (await attendanceOrganization(db, scope));
  const periods = facts
    ? facts.periods
    : (
        await db.query(
          `select jsonb_build_object('id',p.id,'homeBranchId',p.home_branch_id,'startOn',p.start_on::text,'endOn',p.end_on_exclusive::text,'cancelledEffectiveOn',p.cancelled_effective_on::text,'activatedAt',to_jsonb(p.activated_at)#>>'{}','allBranches',p.snapshot->>'accessMode'='all_branches','gymFloor',(p.snapshot->>'gymFloor')::boolean,'classes',(p.snapshot->>'classes')::boolean,'personalTraining',(p.snapshot->>'personalTraining')::boolean,'invoice',jsonb_build_object('totalMinor',0,'dueOn',p.start_on::text),'freezes',coalesce((select jsonb_agg(jsonb_build_object('startOn',f.start_on::text,'endOn',f.end_on_exclusive::text,'reversedAt',to_jsonb(f.reversed_at)#>>'{}')) from gym.membership_freezes f where f.organization_id=p.organization_id and f.membership_id=p.id),'[]'::jsonb)) data
    from gym.memberships p where p.organization_id=$1 and p.member_id=$2 order by case when p.start_on<=$3::date and p.end_on_exclusive+$4::int>$3::date and (p.cancelled_effective_on is null or p.cancelled_effective_on>$3::date) then 0 when p.start_on>$3::date then 1 else 2 end,p.start_on desc,p.id limit 25`,
          [scope.organizationId, member.id, org.today, org.graceDays],
        )
      ).rows.map((r) => r.data as Period);
  let access = eligibility(
      periods,
      org.today,
      member.archived,
      org.graceDays,
      false,
    ),
    chosen: Period | undefined;
  if (access.allowed) {
    const available = periods.filter(
      (p) => p.allBranches || p.homeBranchId === branchId,
    );
    const entitled = available.filter((p) => p[benefit]);
    const branchAccess = eligibility(
      available,
      org.today,
      false,
      org.graceDays,
      false,
    );
    const benefitAccess = eligibility(
      entitled,
      org.today,
      false,
      org.graceDays,
      false,
    );
    if (!branchAccess.allowed)
      access = { allowed: false, reason: "wrong_branch" };
    else if (!benefitAccess.allowed)
      access = { allowed: false, reason: "plan_excludes_access" };
    else {
      access = benefitAccess;
      chosen = entitled
        .filter(
          (p) =>
            eligibility([p], org.today, false, org.graceDays, false).allowed,
        )
        .sort((a, b) => b.startOn.localeCompare(a.startOn))[0];
    }
  }
  if (access.allowed && org.debtBlocksAccess) {
    const due = facts
      ? facts.due
      : (
          await db.query(
            "select exists(select 1 from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.member_id=$2 and i.due_on<=$3::date and b.balance_minor>0) due",
            [scope.organizationId, member.id, org.today],
          )
        ).rows[0].due;
    if (due) access = { allowed: false, reason: "debt_blocked" };
  }
  const open = facts
    ? facts.open
    : (
        await db.query(
          "select id,branch_id from gym.attendance_visits where organization_id=$1 and member_id=$2 and checked_out_at is null",
          [scope.organizationId, member.id],
        )
      ).rows[0];
  return {
    id: member.id,
    name: member.name,
    memberCode: member.memberCode,
    phoneEnding: member.phoneEnding,
    access,
    membershipId: chosen?.id ?? null,
    canOverride: !member.archived && can(scope.role, "memberships.override"),
    openVisitId: open?.id ?? null,
    openInBranch: open?.branch_id === branchId,
  };
}

export async function memberAccessMany(
  db: PoolClient,
  scope: Scope,
  members: AccessMember[],
  branchId: string,
): Promise<AttendanceCandidate[]> {
  if (!members.length) return [];
  const org = await attendanceOrganization(db, scope);
  const rows = (
    await db.query<AccessFacts & { id: string }>(
      `select m.id,
    coalesce((select jsonb_agg(q.data) from(select jsonb_build_object('id',p.id,'homeBranchId',p.home_branch_id,'startOn',p.start_on::text,'endOn',p.end_on_exclusive::text,'cancelledEffectiveOn',p.cancelled_effective_on::text,'activatedAt',to_jsonb(p.activated_at)#>>'{}','allBranches',p.snapshot->>'accessMode'='all_branches','gymFloor',(p.snapshot->>'gymFloor')::boolean,'classes',(p.snapshot->>'classes')::boolean,'personalTraining',(p.snapshot->>'personalTraining')::boolean,'invoice',jsonb_build_object('totalMinor',0,'dueOn',p.start_on::text),'freezes',coalesce((select jsonb_agg(jsonb_build_object('startOn',f.start_on::text,'endOn',f.end_on_exclusive::text,'reversedAt',to_jsonb(f.reversed_at)#>>'{}')) from gym.membership_freezes f where f.organization_id=p.organization_id and f.membership_id=p.id),'[]'::jsonb)) data
    from gym.memberships p where p.organization_id=m.organization_id and p.member_id=m.id order by case when p.start_on<=$3::date and p.end_on_exclusive+$4::int>$3::date and (p.cancelled_effective_on is null or p.cancelled_effective_on>$3::date) then 0 when p.start_on>$3::date then 1 else 2 end,p.start_on desc,p.id limit 25)q),'[]'::jsonb) periods,
    ($5::boolean and exists(select 1 from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=m.organization_id and i.member_id=m.id and i.due_on<=$3::date and b.balance_minor>0)) due,
    (select jsonb_build_object('id',v.id,'branch_id',v.branch_id) from gym.attendance_visits v where v.organization_id=m.organization_id and v.member_id=m.id and v.checked_out_at is null) open
    from gym.members m where m.organization_id=$1 and m.id=any($2::uuid[])`,
      [
        scope.organizationId,
        members.map((m) => m.id),
        org.today,
        org.graceDays,
        org.debtBlocksAccess,
      ],
    )
  ).rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return Promise.all(
    members.map((member) => {
      const facts = byId.get(member.id);
      if (!facts) throw new BusinessError("NOT_FOUND", "Member unavailable.");
      return memberAccess(db, scope, member, branchId, "gymFloor", facts, org);
    }),
  );
}
