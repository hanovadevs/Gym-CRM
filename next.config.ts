import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.MOJYM_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next",
  devIndicators: false,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/receipts/*/pdf": ["./src/modules/billing/fonts/*.ttf"],
    "/api/invoices/*/pdf": ["./src/modules/billing/fonts/*.ttf"],
  },
};
export default config;
