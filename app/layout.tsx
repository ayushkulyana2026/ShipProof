import type { Metadata, Viewport } from "next";
import { AuditProvider } from "@/components/audit/store";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ShipProof — Is your courier overcharging you?", template: "%s · ShipProof" },
  description:
    "Audit your courier invoice against your Shopify orders and rate card. ShipProof checks every AWB for wrong weights, wrong zones and hidden charges. Free, private, runs in your browser.",
  applicationName: "ShipProof",
  openGraph: {
    title: "ShipProof — Is your courier overcharging you?",
    description: "Find shipping overcharges in 2 minutes. Your files never leave your browser.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#086647", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col">
        <AuditProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AuditProvider>
      </body>
    </html>
  );
}
