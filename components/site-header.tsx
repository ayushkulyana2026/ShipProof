"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Logo } from "./logo";
import { SettingsDrawer } from "./audit/settings-drawer";
import { Button } from "./ui/button";

export function SiteHeader() {
  const pathname = usePathname();
  const inApp = pathname.startsWith("/audit");
  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="container flex h-14 items-center justify-between gap-3">
        <Link href="/" aria-label="ShipProof home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex">
            <Lock className="h-3.5 w-3.5" /> Files stay in your browser
          </span>
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/pricing">Pricing</Link>
          </Button>
          {inApp ? (
            <SettingsDrawer />
          ) : (
            <Button asChild size="sm">
              <Link href="/audit">Run a free audit</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
