import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimit = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const ttl = rateLimit?.ttl ?? this.configService.get<number>('RATE_LIMIT_DEFAULT_TTL') ?? 60;
    const limit = rateLimit?.limit ?? this.configService.get<number>('RATE_LIMIT_DEFAULT_LIMIT') ?? 100;
    const prefix = rateLimit?.keyPrefix ?? 'global';

    const request = context.switchToHttp().getRequest();
    const ip = request.ip || 'unknown';
    
    // Resolve identifier key
    let identifier = ip;
    if (request.apiKey) {
      identifier = `apikey:${request.apiKey.id}`;
    } else if (request.user) {
      identifier = `user:${request.user.id}`;
    }

    const key = `ratelimit:${prefix}:${identifier}`;

    // Redis atomic increment
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, ttl);
    }

    if (current > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Se ha superado el límite de peticiones. Por favor, inténtelo de nuevo más tarde.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
