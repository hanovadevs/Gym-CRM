import "server-only";
import { getSecurity } from "@/server/security";
import { createPlansService } from "./service";
export function getPlans() {
  return createPlansService(getSecurity());
}
