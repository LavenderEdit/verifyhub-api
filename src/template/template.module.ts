import { Module } from '@nestjs/common';
import { TemplateService } from './template.service.js';
import { TemplateController } from './template.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
