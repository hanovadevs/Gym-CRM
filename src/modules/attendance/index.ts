import "server-only";
import { getSecurity } from "@/server/security";
import { createAttendanceService } from "./service";
export function getAttendance() {
  return createAttendanceService(getSecurity());
}
