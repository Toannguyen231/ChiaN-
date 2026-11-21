import crypto from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { maskVnPhone, type AuthTokens, type UserProfile } from '@chiane/shared';
import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  type: 'user';
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function parseDurationToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    return 900;
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multipliers[unit] ?? 60);
}

export function serializeUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    phone: user.phone,
    maskedPhone: maskVnPhone(user.phone),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bankBin: user.bankBin,
    bankName: user.bankName,
    bankAccountNumber: user.bankAccountNumber,
    bankAccountHolder: user.bankAccountHolder,
    notifyReminders: user.notifyReminders,
    notifyExpenses: user.notifyExpenses,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class TokenService {
  private readonly accessExpiresInSeconds: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig
  ) {
    this.accessExpiresInSeconds = parseDurationToSeconds(config.JWT_ACCESS_TTL);
  }

  signAccessToken(user: Pick<User, 'id' | 'phone'>): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      phone: user.phone,
      type: 'user',
    };
    return jwt.sign(payload, this.config.JWT_ACCESS_SECRET, {
      expiresIn: this.accessExpiresInSeconds,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.config.JWT_ACCESS_SECRET);
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.phone !== 'string' ||
        decoded.type !== 'user'
      ) {
        throw new AppError(401, 'TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
      }
      return {
        sub: decoded.sub,
        phone: decoded.phone,
        type: 'user',
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, 'TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
      }
      throw new AppError(401, 'TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
    }
  }

  async issueSession(user: User): Promise<AuthTokens> {
    const rawRefreshToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: rawRefreshToken,
      expiresInSeconds: this.accessExpiresInSeconds,
    };
  }

  async rotateRefreshToken(rawToken: string): Promise<{ user: User; tokens: AuthTokens }> {
    const tokenHash = hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Phiên làm việc không hợp lệ.');
    }

    if (existing.revokedAt) {
      // Reuse / replay detected: revoke all active sessions for this user immediately
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSE',
        'Phát hiện phiên đăng nhập bất thường. Vui lòng đăng nhập lại.'
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      throw new AppError(
        401,
        'REFRESH_TOKEN_EXPIRED',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      );
    }

    const rawNextToken = crypto.randomBytes(48).toString('base64url');
    const nextHash = hashToken(rawNextToken);
    const expiresAt = new Date(
      Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: nextHash,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedById: created.id,
        },
      });
    });

    return {
      user: existing.user,
      tokens: {
        accessToken: this.signAccessToken(existing.user),
        refreshToken: rawNextToken,
        expiresInSeconds: this.accessExpiresInSeconds,
      },
    };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
