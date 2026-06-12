import { Module } from '@nestjs/common';
import { WhatsappConnectorService } from './whatsapp-connector.service.js';
import { WhatsappConnectorController } from './whatsapp-connector.controller.js';
import { WhatsappClientRegistry } from './whatsapp-client.registry.js';
import { WhatsappSessionManager } from './whatsapp-session.manager.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [WhatsappConnectorController],
  providers: [
    WhatsappConnectorService,
    WhatsappClientRegistry,
    WhatsappSessionManager,
  ],
  exports: [
    WhatsappConnectorService,
    WhatsappClientRegistry,
    WhatsappSessionManager,
  ],
})
export class WhatsappConnectorModule {}
