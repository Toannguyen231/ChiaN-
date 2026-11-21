import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { maskVnPhone } from '@chiane/shared';
import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';

export interface OtpDeliveryProvider {
  sendOtp(phone: string, code: string, ttlSeconds: number): Promise<void>;
}

export class ConsoleOtpProvider implements OtpDeliveryProvider {
  async sendOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    console.info(`[ChiaNè OTP] Send code ${code} to ${maskVnPhone(phone)} (expires in ${ttlSeconds}s)`);
  }
}

export function createOtpProvider(providerName: AppConfig['OTP_PROVIDER']): OtpDeliveryProvider {
  switch (providerName) {
    case 'console':
    default:
      return new ConsoleOtpProvider();
  }
}

function hashOtpCode(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export class OtpService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly provider: OtpDeliveryProvider
  ) {}

  async requestOtp(phone: string) {
    const now = new Date();

    if (this.config.OTP_RESEND_COOLDOWN_SECONDS > 0) {
      const latest = await this.prisma.otpChallenge.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
      });

      if (latest) {
        const elapsedMs = now.getTime() - latest.createdAt.getTime();
        const cooldownMs = this.config.OTP_RESEND_COOLDOWN_SECONDS * 1000;
        if (elapsedMs < cooldownMs) {
          const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
          throw new AppError(
            429,
            'OTP_COOLDOWN',
            `Vui lòng chờ ${retryAfterSeconds} giây trước khi gửi lại mã.`,
            { retryAfterSeconds }
          );
        }
      }
    }

    // Invalidate any previous unconsumed OTP challenges for this phone
    await this.prisma.otpChallenge.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: now },
    });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtpCode(code, salt);
    const expiresAt = new Date(now.getTime() + this.config.OTP_TTL_SECONDS * 1000);

    await this.prisma.otpChallenge.create({
      data: {
        phone,
        codeHash,
        salt,
        expiresAt,
        maxAttempts: this.config.OTP_MAX_ATTEMPTS,
      },
    });

    await this.provider.sendOtp(phone, code, this.config.OTP_TTL_SECONDS);

    return {
      phone,
      maskedPhone: maskVnPhone(phone),
      expiresInSeconds: this.config.OTP_TTL_SECONDS,
      resendCooldownSeconds: this.config.OTP_RESEND_COOLDOWN_SECONDS,
      ...(this.config.NODE_ENV !== 'production' && this.config.OTP_DEV_ECHO
        ? { devOtp: code }
        : {}),
    };
  }

  async verifyOtp(phone: string, code: string): Promise<void> {
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new AppError(
        401,
        'OTP_NOT_FOUND',
        'Mã xác thực không tồn tại hoặc đã được sử dụng. Vui lòng yêu cầu mã mới.'
      );
    }

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(
        401,
        'OTP_EXPIRED',
        'Mã xác thực đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.'
      );
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AppError(
        429,
        'OTP_MAX_ATTEMPTS',
        'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.'
      );
    }

    const candidateHash = hashOtpCode(code, challenge.salt);
    const expectedBuf = Buffer.from(challenge.codeHash, 'hex');
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const isMatch =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!isMatch) {
      const updated = await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = Math.max(updated.maxAttempts - updated.attempts, 0);

      if (remainingAttempts === 0) {
        throw new AppError(
          429,
          'OTP_MAX_ATTEMPTS',
          'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.',
          { remainingAttempts: 0 }
        );
      }

      throw new AppError(
        401,
        'OTP_INVALID',
        `Mã xác thực chưa đúng. Còn ${remainingAttempts} lần thử.`,
        { remainingAttempts }
      );
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    });
  }
}
