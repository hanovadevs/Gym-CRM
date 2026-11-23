import "server-only";
import { getSecurity } from "@/server/security";
import { createDatabase } from "@/server/db";
import { createMemberFeesService } from "./service";
export const getMemberFees = () =>
  createMemberFeesService(getSecurity(), createDatabase().pool);
