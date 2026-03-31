import type { Metadata } from "next";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
    <html lang="en">
      <body className="min-h-screen antialiased bg-[#FAF9F6]">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
