import "server-only";
import { getSecurity } from "@/server/security";
import { createMembersService } from "./service";
export function getMembers() {
  return createMembersService(getSecurity());
}
