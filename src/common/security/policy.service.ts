import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateQuota(workspaceId: string, projectId: string, channel: 'EMAIL' | 'WHATSAPP'): Promise<void> {
    // 1. Fetch quota policy for workspace
    const policy = await this.prisma.quotaPolicy.findFirst({
      where: { workspaceId },
    });

    // Default limits if no custom policy is created yet
    const dailyLimit = policy?.dailyLimit ?? 5000;
    const hourlyLimit = policy?.hourlyLimit ?? 500;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 2. Count challenges sent/created in the last hour
    const hourlyCount = await this.prisma.challenge.count({
      where: {
        workspaceId,
        createdAt: { gte: oneHourAgo },
        status: { not: 'CANCELLED' },
      },
    });

    if (hourlyCount >= hourlyLimit) {
      this.logger.warn(`Workspace ${workspaceId} reached hourly quota limit of ${hourlyLimit}`);
      throw new ForbiddenException(`Se ha superado el límite de envíos por hora (${hourlyLimit}).`);
    }

    // 3. Count challenges sent/created in the last 24 hours
    const dailyCount = await this.prisma.challenge.count({
      where: {
        workspaceId,
        createdAt: { gte: oneDayAgo },
        status: { not: 'CANCELLED' },
      },
    });

    if (dailyCount >= dailyLimit) {
      this.logger.warn(`Workspace ${workspaceId} reached daily quota limit of ${dailyLimit}`);
      throw new ForbiddenException(`Se ha superado el límite de envíos diarios (${dailyLimit}).`);
    }

    // 4. Update usage counters (for historical/billing reporting)
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    await this.prisma.usageCounter.upsert({
      where: {
        workspaceId_projectId_month_year: {
          workspaceId,
          projectId,
          month: currentMonth,
          year: currentYear,
        },
      },
      update: {
        emailCount: channel === 'EMAIL' ? { increment: 1 } : undefined,
        whatsappCount: channel === 'WHATSAPP' ? { increment: 1 } : undefined,
      },
      create: {
        workspaceId,
        projectId,
        month: currentMonth,
        year: currentYear,
        emailCount: channel === 'EMAIL' ? 1 : 0,
        whatsappCount: channel === 'WHATSAPP' ? 1 : 0,
      },
    });
  }
}
