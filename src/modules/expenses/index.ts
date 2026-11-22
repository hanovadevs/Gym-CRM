import "server-only";
import { getSecurity } from "@/server/security";
import { createExpensesService } from "./service";
export function getExpenses() {
  return createExpensesService(getSecurity());
}
