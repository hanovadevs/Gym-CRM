import "server-only";
import { getSecurity } from "@/server/security";
import { createClassesService } from "./service";
export const getClasses = () => createClassesService(getSecurity());
