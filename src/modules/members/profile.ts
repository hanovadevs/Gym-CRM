import "server-only";
import { getSecurity } from "@/server/security";
import { createProfileService } from "./profile-service";
export function getProfiles() {
  return createProfileService(getSecurity());
}
