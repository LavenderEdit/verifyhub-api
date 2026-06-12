import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEndpointService } from './webhook-endpoint.service.js';
import { WebhookEndpointController } from './webhook-endpoint.controller.js';
import { WebhookProcessor } from './processors/webhook.processor.js';
import { AuthModule } from '../auth/auth.module.js';

@Global()
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'webhook_queue',
    }),
  ],
  controllers: [WebhookEndpointController],
  providers: [WebhookEndpointService, WebhookProcessor],
  exports: [WebhookEndpointService, BullModule],
})
export class WebhookModule {}
