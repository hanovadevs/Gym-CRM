import "server-only";
import { getSecurity } from "@/server/security";
import { createBillingService } from "./service";
export function getBilling() {
  return createBillingService(getSecurity());
}
