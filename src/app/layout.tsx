import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Jym CRM · Crown Fitness",
  description: "Gym operations, thoughtfully organized.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
