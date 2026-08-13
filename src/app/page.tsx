import Link from "next/link";

import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        <nav className="flex items-center gap-4 text-sm text-white/70">
          <Link href="/login" className="hover:text-white">
            Sign in
          </Link>
          <Link href="/dealer/login" className="hidden hover:text-white sm:inline">
            For Dealers
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center sm:px-8">
        <div className="mb-8 flex -space-x-3">
          {["#ff6a3d", "#2b4c7e", "#7ea62b"].map((c) => (
            <div
              key={c}
              className="h-14 w-10 rounded-xl border-2 border-black shadow-lg"
              style={{ backgroundColor: c }}
              aria-hidden
            />
          ))}
        </div>

        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Find the RV you didn&apos;t know you wanted
        </h1>
        <p className="mt-5 max-w-lg text-balance text-lg text-white/70">{brand.tagline}</p>
        <p className="mt-2 max-w-md text-sm text-white/50">{brand.description}</p>

        <Button asChild size="lg" variant="accent" className="mt-10 h-16 px-10 text-lg">
          <Link href="/discover">Find My RV</Link>
        </Button>

        <p className="mt-4 text-xs text-white/40">No account needed. Just start watching.</p>

        <Link href="/search" className="mt-6 text-sm text-white/60 underline underline-offset-4 hover:text-white">
          I know what I want — search by filters instead
        </Link>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 pb-8 text-xs text-white/40">
        <Link href="/dealer/login" className="hover:text-white/70">
          Dealer sign in
        </Link>
        <Link href="/dealer/apply" className="hover:text-white/70">
          List your dealership
        </Link>
        <Link href="/admin/login" className="hover:text-white/70">
          Admin
        </Link>
      </footer>
    </main>
  );
}
