import Link from "next/link";
import { LayoutDashboard, Settings, ShieldCheck, Store } from "lucide-react";

import { requireAdminContext } from "@/server/admin/context";
import { brand } from "@/config/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { DemoModeBadge } from "@/components/demo-mode-badge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminContext();

  const nav = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/dealers", label: "Dealers", icon: Store },
    { href: "/admin/sales", label: "Sale Verification", icon: ShieldCheck },
    { href: "/admin/config", label: "Configuration", icon: Settings },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0b] text-white lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-white/10 px-4 py-4 lg:w-60 lg:border-b-0 lg:border-r lg:py-6">
        <Link href="/admin" className="mb-6 text-lg font-semibold">
          {brand.name} <span className="text-white/50 font-normal">Admin</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 pt-6 lg:flex">
          <DemoModeBadge />
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-background px-4 py-6 text-foreground sm:px-8">
        {children}
      </main>
    </div>
  );
}
