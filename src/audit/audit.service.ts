import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

interface AuditLogData {
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logAction(data: AuditLogData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          action: data.action,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          details: data.details
            ? JSON.parse(JSON.stringify(data.details))
            : undefined,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to write audit log for action: ${data.action}`,
        error.stack,
      );
    }
  }

  async findLogs(
    workspaceId: string,
    filters: {
      action?: string;
      userId?: string;
      projectId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;

    const whereClause = {
      workspaceId,
      action: filters.action || undefined,
      userId: filters.userId || undefined,
      projectId: filters.projectId || undefined,
      createdAt: {
        gte: filters.startDate ? new Date(filters.startDate) : undefined,
        lte: filters.endDate ? new Date(filters.endDate) : undefined,
      },
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { email: true } },
          project: { select: { name: true } },
        },
      }),
      this.prisma.auditLog.count({ where: whereClause }),
    ]);

    return {
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
        details: log.details,
        userEmail: log.user?.email || null,
        projectName: log.project?.name || null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportCsv(
    workspaceId: string,
    filters: {
      action?: string;
      userId?: string;
      projectId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<string> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: filters.action || undefined,
        userId: filters.userId || undefined,
        projectId: filters.projectId || undefined,
        createdAt: {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate) : undefined,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
        project: { select: { name: true } },
      },
    });

    let csv =
      'ID,Fecha,Usuario (Email),Proyecto,Acción,Dirección IP,User Agent,Detalles\n';
    for (const log of logs) {
      const email = log.user?.email || '';
      const projectName = log.project?.name || '';
      const detailsStr = log.details
        ? JSON.stringify(log.details).replace(/"/g, '""')
        : '';
      csv += `"${log.id}","${log.createdAt.toISOString()}","${email}","${projectName}","${log.action}","${log.ipAddress || ''}","${log.userAgent || ''}","${detailsStr}"\n`;
    }

    return csv;
  }
}
