import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TicketOps — Reselling Dashboard",
  description: "Professional ticket reselling management suite",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
