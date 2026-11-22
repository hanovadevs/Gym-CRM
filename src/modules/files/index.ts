import "server-only";
import { getSecurity } from "@/server/security";
import { createFilesService } from "./service";
export function getFiles() {
  return createFilesService(getSecurity());
}
