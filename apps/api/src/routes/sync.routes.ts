import {
  syncMutationsSchema,
  type SyncMutationResultDto,
} from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  createExpenseInGroup,
  resolveMembershipForGroup,
} from '../services/expense.service';
import { AppError } from '../utils/errors';

export interface SyncRoutesDeps {
  prisma: PrismaClient;
  requireAuthOrGuest: preHandlerHookHandler;
}

export async function registerSyncRoutes(
  app: FastifyInstance,
  deps: SyncRoutesDeps
): Promise<void> {
  const { prisma, requireAuthOrGuest } = deps;

  app.post(
    '/api/v1/sync/mutations',
    { preHandler: requireAuthOrGuest },
    async (request, reply) => {
      const body = syncMutationsSchema.parse(request.body);
      const results: SyncMutationResultDto[] = [];

      for (const mutation of body.mutations) {
        try {
          const membership = await resolveMembershipForGroup(
            prisma,
            request,
            mutation.groupId
          );

          const res = await createExpenseInGroup(prisma, {
            groupId: mutation.groupId,
            actorMemberId: membership.id,
            input: {
              ...mutation.payload,
              clientMutationId: mutation.clientMutationId,
            },
          });

          results.push({
            clientMutationId: mutation.clientMutationId,
            status: res.created ? 'SYNCED' : 'ALREADY_SYNCED',
            expenseId: res.expense.id,
          });
        } catch (err) {
          if (err instanceof AppError) {
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'FAILED',
              errorCode: err.code,
              errorMessage: err.message,
            });
          } else {
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'FAILED',
              errorCode: 'SYNC_ERROR',
              errorMessage: 'Không thể đồng bộ khoản chi này.',
            });
          }
        }
      }

      return reply.status(200).send({ results });
    }
  );
}
