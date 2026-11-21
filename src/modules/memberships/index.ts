import "server-only";
import { getSecurity } from "@/server/security";
import { createMembershipsService } from "./service";
export function getMemberships() {
  return createMembershipsService(getSecurity());
}
