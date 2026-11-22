import type { Membership, Eligibility } from "./types";
import { endOn } from "@/modules/plans/format";
function graceEnd(end: string, days: number) {
  try {
    return endOn(end, days, "days");
  } catch {
    return end;
  }
}
export function daysBetween(start: string, end: string) {
  return (
    (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
    86400000
  );
}
export function effectiveEnd(
  m: Pick<Membership, "startOn" | "endOn" | "cancelledEffectiveOn">,
) {
  return m.cancelledEffectiveOn && m.cancelledEffectiveOn < m.endOn
    ? m.cancelledEffectiveOn < m.startOn
      ? m.startOn
      : m.cancelledEffectiveOn
    : m.endOn;
}
export function status(m: Membership, today: string) {
  if (m.cancelledEffectiveOn && m.cancelledEffectiveOn <= today)
    return "Cancelled";
  if (effectiveEnd(m) <= today) return "Expired";
  if (!m.activatedAt) return "Pending activation";
  if (m.startOn > today) return "Upcoming";
  if (
    m.freezes.some(
      (f) => !f.reversedAt && f.startOn <= today && today < f.endOn,
    )
  )
    return "Frozen";
  if (m.cancelledEffectiveOn) return "Cancellation scheduled";
  if (daysBetween(today, m.endOn) <= 7) return "Expiring soon";
  return "Active";
}
export type AccessPeriod = Pick<
  Membership,
  "startOn" | "endOn" | "cancelledEffectiveOn" | "activatedAt"
> & {
  freezes: Pick<
    Membership["freezes"][number],
    "startOn" | "endOn" | "reversedAt"
  >[];
  invoice: Pick<Membership["invoice"], "totalMinor" | "dueOn">;
};
export function eligibility<T extends AccessPeriod>(
  rows: T[],
  today: string,
  archived: boolean,
  grace: number,
  debtBlocks: boolean,
): Eligibility {
  if (archived) return { allowed: false, reason: "archived" };
  const current = rows
    .filter(
      (m) =>
        m.startOn <= today &&
        (!m.cancelledEffectiveOn || today < m.cancelledEffectiveOn) &&
        (today < m.endOn || (grace > 0 && today < graceEnd(m.endOn, grace))),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.activatedAt)) - Number(Boolean(a.activatedAt)) ||
        b.startOn.localeCompare(a.startOn),
    )[0];
  if (!current)
    return {
      allowed: false,
      reason: rows.length
        ? rows.some((m) => m.startOn > today)
          ? "not_started"
          : rows.some(
                (m) =>
                  m.cancelledEffectiveOn && m.cancelledEffectiveOn <= today,
              )
            ? "cancelled"
            : "expired"
        : "no_membership",
    };
  if (!current.activatedAt)
    return { allowed: false, reason: "pending_activation" };
  if (
    current.freezes.some(
      (f) => !f.reversedAt && f.startOn <= today && today < f.endOn,
    )
  )
    return { allowed: false, reason: "frozen" };
  if (
    debtBlocks &&
    rows.some((m) => m.invoice.totalMinor > 0 && m.invoice.dueOn <= today)
  )
    return { allowed: false, reason: "debt_blocked" };
  return {
    allowed: true,
    reason: today >= current.endOn ? "grace" : "allowed",
  };
}
export function eligibilityLabel(value: Eligibility) {
  return (
    (
      {
        archived: "Blocked: archived member",
        no_membership: "Not enrolled",
        pending_activation: "Pending activation",
        not_started: "Not started",
        cancelled: "Cancelled",
        expired: "Expired",
        frozen: "Frozen",
        debt_blocked: "Blocked: unpaid charges",
        wrong_branch: "Not available in this branch",
        plan_excludes_access: "Plan does not include this access",
        allowed: "Membership active",
        grace: "Within expiry grace",
      } as Record<string, string>
    )[value.reason] ?? "Access unavailable"
  );
}
