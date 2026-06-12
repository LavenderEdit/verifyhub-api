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
          details: data.details ? JSON.parse(JSON.stringify(data.details)) : undefined,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to write audit log for action: ${data.action}`, error.stack);
    }
  }
}
