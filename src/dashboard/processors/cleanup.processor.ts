import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Processor('cleanup_queue')
@Injectable()
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== 'purge_expired') {
      return;
    }

    this.logger.log('Starting scheduled DB cleanup and data retention job...');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // 1. Delete expired or verified challenges older than 7 days
      const deletedChallenges = await this.prisma.challenge.deleteMany({
        where: {
          OR: [
            { status: 'VERIFIED', updatedAt: { lte: sevenDaysAgo } },
            { status: 'FAILED', updatedAt: { lte: sevenDaysAgo } },
            { status: 'EXPIRED', expiresAt: { lte: sevenDaysAgo } },
            { status: 'CANCELLED', updatedAt: { lte: sevenDaysAgo } },
          ],
        },
      });

      // 2. Delete expired refresh tokens
      const deletedTokens = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: { lte: new Date() },
        },
      });

      this.logger.log(
        `Cleanup completed successfully. Purged ${deletedChallenges.count} old challenges and ${deletedTokens.count} expired refresh tokens.`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error executing scheduled data purge: ${error.message}`,
      );
      throw error;
    }
  }
}
