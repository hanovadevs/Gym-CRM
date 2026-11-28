import "server-only";
import { getSecurity } from "@/server/security";
import { createEnquiriesService } from "./service";
export const getEnquiries = () => createEnquiriesService(getSecurity());
