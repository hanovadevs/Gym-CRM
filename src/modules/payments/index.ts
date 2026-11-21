import "server-only";
import { getSecurity } from "@/server/security";
import { createPaymentsService } from "./service";
export function getPayments() {
  return createPaymentsService(getSecurity());
}
