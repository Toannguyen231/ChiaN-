import type { GroupMemberRole } from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { AppError } from '../utils/errors';

/**
 * Enforces backend group authorization and role-based permissions for either
 * authenticated users or verified guest members.
 */
export function createRequireGroupRole(
  prisma: PrismaClient,
  allowedRoles: GroupMemberRole[] = ['ADMIN', 'MEMBER', 'GUEST']
): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const params = request.params as { groupId?: string } | undefined;
    const groupId = params?.groupId;
    if (!groupId) {
      throw new AppError(400, 'MISSING_GROUP_ID', 'Thiếu mã nhóm.');
    }

    if (request.authUser?.userId) {
      const membership = await prisma.groupMember.findFirst({
        where: {
          groupId,
          userId: request.authUser.userId,
          status: 'ACTIVE',
        },
      });

      if (!membership) {
        throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không có quyền truy cập nhóm này.');
      }

      if (!allowedRoles.includes(membership.role as GroupMemberRole)) {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Vai trò hiện tại của bạn không được phép thực hiện thao tác này.'
        );
      }

      request.groupMembership = {
        memberId: membership.id,
        groupId: membership.groupId,
        role: membership.role,
        displayName: membership.displayName,
      };
      return;
    }

    if (request.guestMember) {
      if (request.guestMember.groupId !== groupId) {
        throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không có quyền truy cập nhóm này.');
      }

      const membership = await prisma.groupMember.findFirst({
        where: {
          id: request.guestMember.memberId,
          groupId,
          status: 'ACTIVE',
        },
      });

      if (!membership) {
        throw new AppError(403, 'GROUP_ACCESS_DENIED', 'Bạn không còn là thành viên hoạt động trong nhóm này.');
      }

      if (!allowedRoles.includes(membership.role as GroupMemberRole)) {
        throw new AppError(
          403,
          'INSUFFICIENT_ROLE',
          'Tài khoản khách không được phép thực hiện thao tác này.'
        );
      }

      request.groupMembership = {
        memberId: membership.id,
        groupId: membership.groupId,
        role: membership.role,
        displayName: membership.displayName,
      };
      return;
    }

    throw new AppError(401, 'UNAUTHORIZED', 'Bạn cần đăng nhập để truy cập nhóm.');
  };
}
