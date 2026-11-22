import "server-only";
import { getSecurity } from "@/server/security";
import { createPayrollService } from "./service";
export const getPayroll = () => createPayrollService(getSecurity());
