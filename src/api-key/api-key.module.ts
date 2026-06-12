import { Module, Global } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyController } from './api-key.controller.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}
