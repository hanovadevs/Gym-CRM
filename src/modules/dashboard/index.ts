import "server-only";
import { getSecurity } from "@/server/security";
import { createDashboardService } from "./service";
export function getDashboard() {
  return createDashboardService(getSecurity());
}
