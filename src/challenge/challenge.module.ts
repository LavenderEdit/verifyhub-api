import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service.js';
import { ChallengeController } from './challenge.controller.js';
import { BullModule } from '@nestjs/bullmq';
import { ApiKeyModule } from '../api-key/api-key.module.js';

@Module({
  imports: [
    ApiKeyModule,
    BullModule.registerQueue({
      name: 'delivery_queue',
    }),
  ],
  controllers: [ChallengeController],
  providers: [ChallengeService],
  exports: [ChallengeService],
})
export class ChallengeModule {}
