import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { hashGuestToken } from '../services/balance.service';
import type { TokenService } from '../services/token.service';
import { AppError } from '../utils/errors';

export interface AuthenticatedContext {
  userId: string;
  phone: string;
  type: 'user';
}

export interface GuestMemberContext {
  memberId: string;
  groupId: string;
  role: string;
  displayName: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedContext;
    guestMember?: GuestMemberContext;
    groupMembership?: {
      memberId: string;
      groupId: string;
      role: string;
      displayName: string;
    };
  }
}

export function createRequireAuth(tokenService: TokenService): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Bạn cần đăng nhập để tiếp tục.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Thiếu mã xác thực.');
    }

    const payload = tokenService.verifyAccessToken(token);
    request.authUser = {
      userId: payload.sub,
      phone: payload.phone,
      type: payload.type,
    };
  };
}

export function createRequireAuthOrGuest(
  prisma: PrismaClient,
  tokenService: TokenService
): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new AppError(401, 'UNAUTHORIZED', 'Thiếu mã xác thực.');
      }
      const payload = tokenService.verifyAccessToken(token);
      request.authUser = {
        userId: payload.sub,
        phone: payload.phone,
        type: payload.type,
      };
      return;
    }

    const guestHeader = request.headers['x-guest-token'];
    const rawGuestToken = Array.isArray(guestHeader) ? guestHeader[0] : guestHeader;
    if (typeof rawGuestToken === 'string' && rawGuestToken.trim().length > 0) {
      const guestTokenHash = hashGuestToken(rawGuestToken.trim());
      const member = await prisma.groupMember.findFirst({
        where: {
          guestTokenHash,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          groupId: true,
          role: true,
          displayName: true,
        },
      });

      if (!member) {
        throw new AppError(401, 'GUEST_TOKEN_INVALID', 'Phiên khách không hợp lệ hoặc đã hết hiệu lực.');
      }

      request.guestMember = {
        memberId: member.id,
        groupId: member.groupId,
        role: member.role,
        displayName: member.displayName,
      };
      return;
    }

    throw new AppError(401, 'UNAUTHORIZED', 'Bạn cần đăng nhập hoặc tham gia nhóm để tiếp tục.');
  };
}
