import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { validate } from './common/config/config.env.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';
import { ApiKeyModule } from './api-key/api-key.module.js';
import { AuditModule } from './audit/audit.module.js';
import { SecurityModule } from './common/security/security.module.js';
import { SmtpConnectorModule } from './connector/smtp/smtp-connector.module.js';
import { WhatsappConnectorModule } from './connector/whatsapp/whatsapp-connector.module.js';
import { TemplateModule } from './template/template.module.js';
import { ChallengeModule } from './challenge/challenge.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            transport: !isProd
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
            level: isProd ? 'info' : 'debug',
          },
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    WorkspaceModule,
    ApiKeyModule,
    AuditModule,
    SecurityModule,
    SmtpConnectorModule,
    WhatsappConnectorModule,
    TemplateModule,
    ChallengeModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
