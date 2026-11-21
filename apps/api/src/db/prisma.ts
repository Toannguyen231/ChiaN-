import { PrismaClient } from '@prisma/client';

let sharedClient: PrismaClient | null = null;

export function getPrismaClient(databaseUrl?: string): PrismaClient {
  if (databaseUrl) {
    return new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    });
  }

  if (!sharedClient) {
    sharedClient = new PrismaClient();
  }
  return sharedClient;
}

export async function disconnectPrisma(): Promise<void> {
  if (sharedClient) {
    await sharedClient.$disconnect();
    sharedClient = null;
  }
}
