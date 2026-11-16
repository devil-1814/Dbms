import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "SMART Emergency Allocation",
  description: "Emergency incident triage and resource allocation dashboard"
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}