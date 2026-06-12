import { Module } from '@nestjs/common';
import { SmtpConnectorService } from './smtp-connector.service.js';
import { SmtpConnectorController } from './smtp-connector.controller.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [SmtpConnectorController],
  providers: [SmtpConnectorService],
  exports: [SmtpConnectorService],
})
export class SmtpConnectorModule {}
