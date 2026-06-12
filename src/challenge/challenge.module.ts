import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service.js';
import { ChallengeController } from './challenge.controller.js';
import { VerifyLinkController } from './verify-link.controller.js';
import { VerifyLinkService } from './verify-link.service.js';
import { BullModule } from '@nestjs/bullmq';
import { ApiKeyModule } from '../api-key/api-key.module.js';

@Module({
  imports: [
    ApiKeyModule,
    BullModule.registerQueue({
      name: 'delivery_queue',
    }),
  ],
  controllers: [ChallengeController, VerifyLinkController],
  providers: [ChallengeService, VerifyLinkService],
  exports: [ChallengeService, VerifyLinkService],
})
export class ChallengeModule {}
