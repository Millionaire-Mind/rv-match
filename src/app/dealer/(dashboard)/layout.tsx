import Link from "next/link";
import { LayoutDashboard, ListChecks, Package, Users } from "lucide-react";

import { requireDealerContext } from "@/server/dealer/context";
import { getPilotSummary } from "@/server/dealer/analytics";
import { Badge } from "@/components/ui/badge";
import { brand } from "@/config/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function DealerDashboardLayout({ children }: { children: React.ReactNode }) {
  const { dealership, role } = await requireDealerContext();

  if (dealership.status === "pending") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-secondary/30 px-6 text-center">
        <h1 className="text-2xl font-semibold">Application pending approval</h1>
        <p className="max-w-md text-muted-foreground">
          {dealership.name} is under review by the {brand.name} team. You&apos;ll get full access to
          your dashboard as soon as it&apos;s approved.
        </p>
        <SignOutButton />
      </div>
    );
  }

  if (dealership.status === "suspended" || dealership.status === "rejected") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-secondary/30 px-6 text-center">
        <h1 className="text-2xl font-semibold">Account not active</h1>
        <p className="max-w-md text-muted-foreground">
          {dealership.name}&apos;s account is currently {dealership.status}. Contact{" "}
          {brand.supportEmail} for help.
        </p>
        <SignOutButton />
      </div>
    );
  }

  const pilot = await getPilotSummary(dealership.id);

  const nav = [
    { href: "/dealer", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dealer/inventory", label: "Inventory", icon: Package },
    { href: "/dealer/leads", label: "Leads", icon: Users },
    { href: "/dealer/pilot", label: "Pilot", icon: ListChecks },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-secondary/30 lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-card px-4 py-4 lg:w-60 lg:border-b-0 lg:border-r lg:py-6">
        <Link href="/dealer" className="mb-6 text-lg font-semibold">
          {brand.name} <span className="text-muted-foreground font-normal">Dealer</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-secondary"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 pt-6 lg:flex">
          <p className="text-xs text-muted-foreground">{dealership.name}</p>
          {pilot && (
            <Badge variant={pilot.daysRemaining < 14 ? "warning" : "secondary"} className="w-fit">
              Pilot: {pilot.daysRemaining}d left
            </Badge>
          )}
          <p className="text-xs text-muted-foreground capitalize">{role}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
