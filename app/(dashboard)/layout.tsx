import { AppShell } from "@/components/layout/AppShell";

/**
 * All dashboard routes read from Postgres — never pre-render at build time
 * (avoids exhausting Supabase session pool during `next build`).
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
