import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(workspaceId: string) {
    this.logger.log(`Fetching dashboard metrics for workspace ${workspaceId}`);

    const [total, verified, failed] = await Promise.all([
      this.prisma.challenge.count({ where: { workspaceId } }),
      this.prisma.challenge.count({
        where: { workspaceId, status: 'VERIFIED' },
      }),
      this.prisma.challenge.count({ where: { workspaceId, status: 'FAILED' } }),
    ]);

    const successRate =
      total > 0 ? parseFloat(((verified / total) * 100).toFixed(2)) : 0;

    const [
      challengesByStatus,
      whatsappConnectors,
      smtpConnectors,
      recentErrors,
      channelUsage,
      projectUsage,
      projects,
    ] = await Promise.all([
      this.prisma.challenge.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.whatsappConnector.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.smtpConnector.groupBy({
        by: ['enabled'],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.deliveryAttempt.findMany({
        where: {
          challenge: { workspaceId },
          status: 'FAILED',
        },
        include: {
          challenge: {
            select: {
              channel: true,
              purpose: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.challenge.groupBy({
        by: ['channel'],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.challenge.groupBy({
        by: ['projectId'],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.project.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
      }),
    ]);

    const formattedErrors = recentErrors.map((err) => ({
      id: err.id,
      challengeId: err.challengeId,
      channel: err.challenge.channel,
      purpose: err.challenge.purpose,
      error: err.error,
      createdAt: err.createdAt,
    }));

    const projectUsageFormatted = projectUsage.map((pu) => {
      const proj = projects.find((p) => p.id === pu.projectId);
      return {
        projectId: pu.projectId,
        projectName: proj ? proj.name : 'Unknown',
        count: pu._count,
      };
    });

    return {
      summary: {
        total,
        verified,
        failed,
        successRate,
      },
      challengesByStatus: challengesByStatus.map((c) => ({
        status: c.status,
        count: c._count,
      })),
      whatsappConnectors: whatsappConnectors.map((w) => ({
        status: w.status,
        count: w._count,
      })),
      smtpConnectors: smtpConnectors.map((s) => ({
        enabled: s.enabled,
        count: s._count,
      })),
      recentErrors: formattedErrors,
      channelUsage: channelUsage.map((cu) => ({
        channel: cu.channel,
        count: cu._count,
      })),
      projectUsage: projectUsageFormatted,
    };
  }
}
