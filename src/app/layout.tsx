import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./mobile.css";
import "./polish.css";
export const metadata: Metadata = {
  title: "Mojym | Gym management",
  description: "Gym operations, thoughtfully organized.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
