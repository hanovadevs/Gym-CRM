import { z } from "zod";
export const roles = [
  "owner",
  "manager",
  "receptionist",
  "trainer",
  "accountant",
] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;
const staff = [
  "owner",
  "manager",
  "receptionist",
  "trainer",
  "accountant",
] as const;
export const permissions = {
  "workspace.read": staff,
  "dashboard.read": ["owner", "manager", "receptionist", "accountant"],
  "settings.read": ["owner", "manager"],
  "settings.manage": ["owner", "manager"],
  "staff.manage": ["owner"],
  "members.manage": ["owner", "manager", "receptionist"],
  "members.assigned.read": ["owner", "manager", "trainer"],
  "plans.manage": ["owner", "manager"],
  "plans.read": ["owner", "manager", "receptionist", "accountant"],
  "memberships.manage": ["owner", "manager", "receptionist"],
  "memberships.override": ["owner", "manager"],
  "billing.collect": ["owner", "manager", "receptionist", "accountant"],
  "billing.read": ["owner", "manager", "receptionist", "accountant"],
  "billing.invoice": ["owner", "manager", "receptionist", "accountant"],
  "billing.adjust": ["owner"],
  "attendance.manage": ["owner", "manager", "receptionist"],
  "employees.manage": ["owner", "manager"],
  "payroll.manage": ["owner", "manager", "accountant"],
  "expenses.manage": ["owner", "manager", "accountant"],
  "reports.financial": ["owner", "manager", "accountant"],
  "classes.read": ["owner", "manager", "receptionist", "trainer"],
  "classes.manage": ["owner", "manager"],
  "classes.book": ["owner", "manager", "receptionist"],
  "trainer.own.read": ["owner", "manager", "trainer"],
  "trainers.read": ["owner", "manager", "receptionist", "trainer"],
  "trainers.manage": ["owner", "manager"],
  "training.book": ["owner", "manager", "receptionist"],
  "enquiries.manage": ["owner", "manager", "receptionist"],
} as const satisfies Record<string, readonly Role[]>;
export type Action = keyof typeof permissions;
export function can(role: Role, action: Action) {
  return (permissions[action] as readonly Role[]).includes(role);
}
export function allowedActions(role: Role) {
  return (Object.keys(permissions) as Action[]).filter((action) =>
    can(role, action),
  );
}
