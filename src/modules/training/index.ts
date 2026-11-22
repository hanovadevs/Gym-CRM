import "server-only";
import { getSecurity } from "@/server/security";
import { createTrainingService } from "./service";
export const getTraining = () => createTrainingService(getSecurity());
