import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import fastifyCookie from '@fastify/cookie';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

async function bootstrap() {
  // 1. Create a fastify instance with standard logging disabled (handled by PinoLogger)
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true }
  );

  // 2. Set Pino as the main logger
  app.useLogger(app.get(PinoLogger));

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  
  // 3. Register fastify-cookie
  const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET')!;
  await app.register(fastifyCookie, {
    secret: refreshSecret,
  });

  // 4. Configure Globals
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // 5. API Versioning /v1
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 6. Swagger /docs setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VerifyHub API')
    .setDescription('Centralized Multi-Tenant Verification API (Email SMTP & WhatsApp Web)')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter Access JWT token for Dashboard/Human operations',
    })
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Enter Project API Key for M2M operations',
      },
      'x-api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // 7. Check Boot Mode
  const runMode = configService.get<string>('RUN_MODE') || 'api';
  const port = configService.get<number>('PORT') || 3000;

  if (runMode === 'worker') {
    // Shutdown the HTTP listener part if starting as a worker process
    await app.close();
    
    // Bootstrap only application context
    const workerApp = await NestFactory.createApplicationContext(AppModule);
    workerApp.useLogger(workerApp.get(PinoLogger));
    logger.log('VerifyHub Worker bootstrapped successfully');
    
    // Maintain active loop for BullMQ/Redis connections
    process.on('SIGTERM', async () => {
      logger.log('Worker SIGTERM received. Closing context...');
      await workerApp.close();
      process.exit(0);
    });
  } else {
    // Boot up as API Server
    await app.listen(port, '0.0.0.0');
    logger.log(`VerifyHub API server running on: http://localhost:${port}/v1`);
    logger.log(`VerifyHub Swagger docs available at: http://localhost:${port}/docs`);
  }
}

bootstrap();
