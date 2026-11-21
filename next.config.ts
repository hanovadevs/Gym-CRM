import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/invoices/*/pdf": ["./src/modules/billing/fonts/*.ttf"],
  },
};
export default config;
