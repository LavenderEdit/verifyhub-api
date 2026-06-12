import { Module, Global } from '@nestjs/common';
import { SecretsService } from './secrets.service.js';
import { PolicyService } from './policy.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

@Global()
@Module({
  providers: [SecretsService, PolicyService, RateLimitGuard],
  exports: [SecretsService, PolicyService, RateLimitGuard],
})
export class SecurityModule {}
