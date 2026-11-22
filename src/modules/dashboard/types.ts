export type DashboardData = {
  organization: { id: string; name: string; locale: string; timeZone: string };
  branches: { id: string; name: string }[];
  branchId: string;
  today: string;
  operational: null | {
    activeMembers: number;
    checkIns: number;
    inside: number;
    stale: number;
    week: { day: string; visits: number }[];
    recentMembers: {
      id: string;
      name: string;
      memberCode: string;
      joinedOn: string;
    }[];
    renewals: {
      id: string;
      name: string;
      memberCode: string;
      renewOn: string;
    }[];
  };
  finance: {
    period: "today" | "month";
    fromOn: string;
    collections: {
      currency: string;
      receivedMinor: string;
      refundedMinor: string;
      netMinor: string;
    }[];
    overdueCount: number;
    outstanding: { currency: string; amountMinor: string }[] | null;
  };
  canManageSettings: boolean;
  canManageMembers: boolean;
  canReadPlans: boolean;
  canReadBilling: boolean;
  requestId: string;
};
