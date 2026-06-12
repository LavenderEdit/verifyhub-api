import { Module } from '@nestjs/common';
import { EmailProcessor } from './processors/email.processor.js';
import { TemplateModule } from '../template/template.module.js';
import { WhatsappConnectorModule } from '../connector/whatsapp/whatsapp-connector.module.js';

@Module({
  imports: [TemplateModule, WhatsappConnectorModule],
  providers: [EmailProcessor],
})
export class DeliveryModule {}
