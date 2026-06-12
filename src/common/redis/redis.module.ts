import { Global, Module, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is missing.');
    }
    super(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }

  async onModuleDestroy() {
    // Gracefully disconnect from Redis on application shutdown
    await this.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useClass: RedisService,
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
