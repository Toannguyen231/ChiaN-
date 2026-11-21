import type { GroupMemberRole } from '@chiane/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createRequireGroupRole } from '../middleware/rbac';
import { buildGroupExcelExport } from '../services/excel.service';

export interface ExportRoutesDeps {
  prisma: PrismaClient;
  requireAuthOrGuest: preHandlerHookHandler;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function registerExportRoutes(
  app: FastifyInstance,
  deps: ExportRoutesDeps
): Promise<void> {
  const { prisma, requireAuthOrGuest } = deps;

  app.get(
    '/api/v1/groups/:groupId/export/xlsx',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const { buffer, filename } = await buildGroupExcelExport(
        prisma,
        membership.groupId,
        membership.memberId,
        membership.role as GroupMemberRole
      );

      reply.header('Content-Type', XLSX_MIME);
      reply.header(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      return reply.status(200).send(buffer);
    }
  );

  app.get(
    '/api/v1/groups/:groupId/export/xlsx-base64',
    {
      preHandler: [
        requireAuthOrGuest,
        createRequireGroupRole(prisma, ['ADMIN', 'MEMBER', 'GUEST']),
      ],
    },
    async (request, reply) => {
      const membership = request.groupMembership!;
      const { buffer, filename } = await buildGroupExcelExport(
        prisma,
        membership.groupId,
        membership.memberId,
        membership.role as GroupMemberRole
      );

      return reply.status(200).send({
        filename,
        mimeType: XLSX_MIME,
        base64: buffer.toString('base64'),
        byteLength: buffer.byteLength,
      });
    }
  );
}
