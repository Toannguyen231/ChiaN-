import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AppConfig } from './config/env';
import { getPrismaClient } from './db/prisma';
import { createRequireAuth, createRequireAuthOrGuest } from './middleware/auth';
import { registerActivityRoutes } from './routes/activity.routes';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerDashboardRoutes } from './routes/dashboard.routes';
import { registerExpensesRoutes } from './routes/expenses.routes';
import { registerGroupsRoutes } from './routes/groups.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { registerInvitesRoutes } from './routes/invites.routes';
import { registerOcrRoutes } from './routes/ocr.routes';
import { registerPotRoutes } from './routes/pot.routes';
import { registerSettlementsRoutes } from './routes/settlements.routes';
import { registerSyncRoutes } from './routes/sync.routes';
import { createOtpProvider, OtpService, type OtpDeliveryProvider } from './services/otp.service';
import { TokenService } from './services/token.service';
import { AppError } from './utils/errors';

export interface BuildAppOptions {
  config: AppConfig;
  prisma?: PrismaClient;
  otpProvider?: OtpDeliveryProvider;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const prisma = options.prisma ?? getPrismaClient(config.DATABASE_URL);
  const ownsPrisma = !options.prisma;

  const app = Fastify({
    logger: config.NODE_ENV === 'development',
    bodyLimit: 15 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    if (error instanceof ZodError || (error instanceof Error && error.name === 'ZodError')) {
      const zodErr = error as ZodError;
      const firstIssue = zodErr.issues?.[0];
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message ?? 'Dữ liệu không hợp lệ.',
          details: { issues: zodErr.issues ?? [] },
        },
      });
    }

    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyError.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      },
    });
  });

  const otpProvider = options.otpProvider ?? createOtpProvider(config.OTP_PROVIDER);
  const otpService = new OtpService(prisma, config, otpProvider);
  const tokenService = new TokenService(prisma, config);
  const requireAuth = createRequireAuth(tokenService);
  const requireAuthOrGuest = createRequireAuthOrGuest(prisma, tokenService);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app, {
    prisma,
    otpService,
    tokenService,
    requireAuth,
  });
  await registerDashboardRoutes(app, {
    prisma,
    requireAuth,
  });
  await registerGroupsRoutes(app, {
    prisma,
    requireAuth,
    requireAuthOrGuest,
  });
  await registerExpensesRoutes(app, {
    prisma,
    requireAuthOrGuest,
  });
  await registerSettlementsRoutes(app, {
    prisma,
    requireAuthOrGuest,
  });
  await registerActivityRoutes(app, {
    prisma,
    requireAuth,
    requireAuthOrGuest,
  });
  await registerInvitesRoutes(app, {
    prisma,
    requireAuth,
  });
  await registerSyncRoutes(app, {
    prisma,
    requireAuthOrGuest,
  });
  await registerOcrRoutes(app, {
    requireAuthOrGuest,
    geminiApiKey: config.GEMINI_API_KEY,
  });
  await registerPotRoutes(app, {
    prisma,
    requireAuthOrGuest,
  });

  if (ownsPrisma) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
