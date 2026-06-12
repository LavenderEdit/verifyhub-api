import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookEndpointService } from '../../webhook/webhook-endpoint.service.js';
import { createHash } from 'crypto';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookEndpointService,
  ) {}

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async validateQuota(
    workspaceId: string,
    projectId: string,
    channel: 'EMAIL' | 'WHATSAPP',
    destination: string,
  ): Promise<void> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Temporary Block for Abuse (Destination flood check)
    const destinationHash = this.hashString(destination);
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const recentAttempts = await this.prisma.challenge.count({
      where: {
        destinationHash,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentAttempts >= 5) {
      this.logger.warn(
        `Destination ${destinationHash} temporarily blocked due to suspected abuse (${recentAttempts} attempts in last 15m).`,
      );
      throw new ForbiddenException(
        'Número/correo bloqueado temporalmente por sospecha de abuso. Por favor, intente más tarde.',
      );
    }

    // 2. Fetch Quota Policy for Workspace
    const policy = await this.prisma.quotaPolicy.findFirst({
      where: { workspaceId },
    });

    // Default limits if no custom policy is created yet
    const dailyLimit = policy?.dailyLimit ?? 5000;
    const hourlyLimit = policy?.hourlyLimit ?? 500;

    // 3. Count challenges in the last hour
    const hourlyCount = await this.prisma.challenge.count({
      where: {
        workspaceId,
        createdAt: { gte: oneHourAgo },
        status: { not: 'CANCELLED' },
      },
    });

    // Soft Limit Check (80%)
    if (hourlyCount === Math.floor(hourlyLimit * 0.8)) {
      this.logger.log(
        `Workspace ${workspaceId} reached 80% soft hourly limit.`,
      );
      await this.webhookService.triggerEvent(projectId, 'quota.limit_reached', {
        type: 'hourly',
        limit: hourlyLimit,
        current: hourlyCount,
        message: `Workspace reached 80% soft hourly limit.`,
      });
    }

    if (hourlyCount >= hourlyLimit) {
      this.logger.warn(
        `Workspace ${workspaceId} reached hourly quota limit of ${hourlyLimit}`,
      );
      throw new ForbiddenException(
        `Se ha superado el límite de envíos por hora (${hourlyLimit}).`,
      );
    }

    // 4. Count challenges in the last 24 hours
    const dailyCount = await this.prisma.challenge.count({
      where: {
        workspaceId,
        createdAt: { gte: oneDayAgo },
        status: { not: 'CANCELLED' },
      },
    });

    // Soft Limit Check (80%)
    if (dailyCount === Math.floor(dailyLimit * 0.8)) {
      this.logger.log(`Workspace ${workspaceId} reached 80% soft daily limit.`);
      await this.webhookService.triggerEvent(projectId, 'quota.limit_reached', {
        type: 'daily',
        limit: dailyLimit,
        current: dailyCount,
        message: `Workspace reached 80% soft daily limit.`,
      });
    }

    if (dailyCount >= dailyLimit) {
      this.logger.warn(
        `Workspace ${workspaceId} reached daily quota limit of ${dailyLimit}`,
      );
      throw new ForbiddenException(
        `Se ha superado el límite de envíos diarios (${dailyLimit}).`,
      );
    }

    // 5. Connector-level quota checks
    if (channel === 'EMAIL') {
      const smtp = await this.prisma.smtpConnector.findFirst({
        where: { workspaceId, enabled: true },
      });
      if (smtp) {
        const smtpHourlyCount = await this.prisma.deliveryAttempt.count({
          where: {
            connectorId: smtp.id,
            status: 'SENT',
            createdAt: { gte: oneHourAgo },
          },
        });
        if (smtpHourlyCount >= smtp.maxHourlySends) {
          throw new ForbiddenException(
            `Límite por hora del conector SMTP alcanzado (${smtp.maxHourlySends}).`,
          );
        }

        const smtpDailyCount = await this.prisma.deliveryAttempt.count({
          where: {
            connectorId: smtp.id,
            status: 'SENT',
            createdAt: { gte: oneDayAgo },
          },
        });
        if (smtpDailyCount >= smtp.maxDailySends) {
          throw new ForbiddenException(
            `Límite diario del conector SMTP alcanzado (${smtp.maxDailySends}).`,
          );
        }
      }
    }

    // 6. Update usage counters (for historical/billing reporting)
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
