import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  changePhoneRequestSchema,
  changePhoneVerifySchema,
  logoutSchema,
  refreshTokenSchema,
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from '@chiane/shared';
import type { OtpService } from '../services/otp.service';
import { serializeUserProfile, type TokenService } from '../services/token.service';
import { AppError } from '../utils/errors';

export interface AuthRoutesDeps {
  prisma: PrismaClient;
  otpService: OtpService;
  tokenService: TokenService;
  requireAuth: ReturnType<typeof import('../middleware/auth').createRequireAuth>;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRoutesDeps
): Promise<void> {
  const { prisma, otpService, tokenService, requireAuth } = deps;

  app.post('/api/v1/auth/otp/request', async (request, reply) => {
    const body = requestOtpSchema.parse(request.body);
    const result = await otpService.requestOtp(body.phone);
    return reply.status(200).send(result);
  });

  app.post('/api/v1/auth/otp/verify', async (request, reply) => {
    const body = verifyOtpSchema.parse(request.body);
    await otpService.verifyOtp(body.phone, body.code);

    let user = await prisma.user.findUnique({ where: { phone: body.phone } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          phone: body.phone,
          displayName: '',
        },
      });
    }

    const tokens = await tokenService.issueSession(user);

    return reply.status(200).send({
      user: serializeUserProfile(user),
      isNewUser,
      ...tokens,
    });
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const { user, tokens } = await tokenService.rotateRefreshToken(body.refreshToken);

    return reply.status(200).send({
      user: serializeUserProfile(user),
      ...tokens,
    });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const body = logoutSchema.parse(request.body ?? {});
    if (body.refreshToken) {
      await tokenService.revokeRefreshToken(body.refreshToken);
    }
    return reply.status(200).send({ success: true });
  });

  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    }
    return reply.status(200).send({ user: serializeUserProfile(user) });
  });

  app.patch('/api/v1/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const input = updateProfileSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.bankBin !== undefined ? { bankBin: input.bankBin } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.bankAccountNumber !== undefined
          ? { bankAccountNumber: input.bankAccountNumber }
          : {}),
        ...(input.bankAccountHolder !== undefined
          ? { bankAccountHolder: input.bankAccountHolder }
          : {}),
        ...(input.notifyReminders !== undefined ? { notifyReminders: input.notifyReminders } : {}),
        ...(input.notifyExpenses !== undefined ? { notifyExpenses: input.notifyExpenses } : {}),
      },
    });

    return reply.status(200).send({ user: serializeUserProfile(updated) });
  });

  app.post('/api/v1/auth/phone/request', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const body = changePhoneRequestSchema.parse(request.body);

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    }
    if (body.phone === currentUser.phone) {
      throw new AppError(400, 'SAME_PHONE', 'Đây đã là số điện thoại hiện tại của bạn.');
    }

    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing) {
      throw new AppError(
        409,
        'PHONE_ALREADY_IN_USE',
        'Số điện thoại này đã được dùng cho một tài khoản khác.'
      );
    }

    const result = await otpService.requestOtp(body.phone);
    return reply.status(200).send(result);
  });

  app.post('/api/v1/auth/phone/verify', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.userId;
    const body = changePhoneVerifySchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing && existing.id !== userId) {
      throw new AppError(
        409,
        'PHONE_ALREADY_IN_USE',
        'Số điện thoại này đã được dùng cho một tài khoản khác.'
      );
    }

    await otpService.verifyOtp(body.phone, body.code);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { phone: body.phone },
    });

    await tokenService.revokeAllUserRefreshTokens(userId);
    const tokens = await tokenService.issueSession(updated);

    return reply.status(200).send({
      user: serializeUserProfile(updated),
      ...tokens,
    });
  });
}
