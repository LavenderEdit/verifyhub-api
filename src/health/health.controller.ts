import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check health of database and redis services' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma as any),
      async () => {
        try {
          const pong = await this.redis.ping();
          return {
            redis: {
              status: pong === 'PONG' ? 'up' : 'down',
            },
          };
        } catch (error: any) {
          return {
            redis: {
              status: 'down',
              message: error.message,
            },
          };
        }
      },
    ]);
  }
}
