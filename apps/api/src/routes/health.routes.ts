import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'chiane-api',
      timestamp: new Date().toISOString(),
    };
  });
}
