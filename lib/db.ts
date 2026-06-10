import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
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
