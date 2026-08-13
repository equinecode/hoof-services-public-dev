import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import type { Env } from "../config/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const pool = globalForPrisma.pool ?? new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export function getPrisma(env: Env): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to use Prisma");
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient(env.DATABASE_URL);
  }

  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  await globalForPrisma.pool?.end();
  globalForPrisma.prisma = undefined;
  globalForPrisma.pool = undefined;
}
