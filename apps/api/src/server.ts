import { loadConfig } from './config/env';
import { buildApp } from './app';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  await app.listen({
    port: config.PORT,
    host: config.HOST,
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start ChiaNè API server:', err);
  process.exit(1);
});
