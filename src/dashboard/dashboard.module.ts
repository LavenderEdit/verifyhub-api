import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { CleanupProcessor } from './processors/cleanup.processor.js';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'cleanup_queue',
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, CleanupProcessor],
})
export class DashboardModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('cleanup_queue') private readonly cleanupQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    try {
      // Schedule repeatable job to run every day at midnight
      await this.cleanupQueue.add(
        'purge_expired',
        {},
        {
          repeat: {
            pattern: '0 0 * * *', // Midnight daily
          },
        },
      );
    } catch {
      // Ignore during testing where queue may be mocked
    }
  }
}
