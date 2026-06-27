import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

/**
 * Serverless-friendly DATABASE_URL: one connection per lambda instance.
 * Vercel + Supabase should use the transaction pooler (port 6543) with
 * ?pgbouncer=true — see RESUME_TOMORROW.md.
 */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Either configure Postgres or run with NEXT_PUBLIC_DEMO_MODE=true.",
    );
  }

  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }
    if (url.port === "6543" && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * Singleton Prisma client. We lazy-init so the app can boot even if
 * DATABASE_URL is not configured yet (e.g. in pure demo mode).
 *
 * Use `getDb()` everywhere instead of importing prisma directly so we can
 * gracefully degrade when no DB is wired up.
 */
export function getDb(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Either configure Postgres or run with NEXT_PUBLIC_DEMO_MODE=true.",
    );
  }
  if (!global.__prismaClient) {
    global.__prismaClient = new PrismaClient({
      datasources: { db: { url: resolveDatabaseUrl() } },
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }
  return global.__prismaClient;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
