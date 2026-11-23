import "server-only";
import { getSecurity } from "@/server/security";
import { createPersonalTrainingService } from "./service";
export const getPersonalTraining = () =>
  createPersonalTrainingService(getSecurity());
