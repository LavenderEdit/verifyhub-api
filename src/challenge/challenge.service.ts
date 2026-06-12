import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { SecretsService } from '../common/security/secrets.service.js';
import { PolicyService } from '../common/security/policy.service.js';
import { ConfigService } from '@nestjs/config';
import { CreateChallengeDto } from './dto/create-challenge.dto.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomInt, createHash } from 'crypto';
import { ChallengeStatus } from '@prisma/client';
import { WebhookEndpointService } from '../webhook/webhook-endpoint.service.js';
import { VerifyLinkService } from './verify-link.service.js';

@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly policyService: PolicyService,
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookEndpointService,
    private readonly verifyLinkService: VerifyLinkService,
    @InjectQueue('delivery_queue') private readonly deliveryQueue: Queue,
  ) {}

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async createChallenge(
    projectId: string,
    workspaceId: string,
    dto: CreateChallengeDto,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }

    // 1. Domain Redirect Allowlist Check
    const actionUrl = dto.metadata?.actionUrl;
    if (actionUrl) {
      try {
        const parsedUrl = new URL(actionUrl);
        const domain = parsedUrl.hostname;
        const isAllowed =
          project.allowedDomains.includes(domain) || domain === 'localhost';
        if (!isAllowed) {
          throw new ForbiddenException(
            `Redirección a dominio no permitido: ${domain}`,
          );
        }
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
        throw new BadRequestException(
          'Formato de actionUrl no válido en metadata.',
        );
      }
    }

    // 2. Validate Quota Limits
    await this.policyService.validateQuota(
      workspaceId,
      projectId,
      dto.channel,
      dto.destination,
    );

    // 3. anti-flood Resend Cooldown Check
    const destinationHash = this.hashString(dto.destination);

    // Check if there is a pending challenge created in the last 60 seconds
    const cooldownPeriod = new Date(Date.now() - 60 * 1000);
    const existingPending = await this.prisma.challenge.findFirst({
      where: {
        projectId,
        destinationHash,
        status: { in: ['PENDING', 'QUEUED', 'SENT'] },
        createdAt: { gte: cooldownPeriod },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Por favor, espere 60 segundos antes de solicitar otro código de verificación.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Handle Idempotency Key
    if (dto.idempotencyKey) {
      const duplicate = await this.prisma.challenge.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (duplicate) {
        this.logger.log(
          `Idempotency key match: returning existing challenge ${duplicate.id}`,
        );
        return {
          id: duplicate.id,
          status: duplicate.status,
          expiresAt: duplicate.expiresAt,
        };
      }
    }

    // 5. Generate secure 6-digit OTP code
    const otpLength = this.configService.get<number>('OTP_DEFAULT_LENGTH') ?? 6;
    const minRange = Math.pow(10, otpLength - 1);
    const maxRange = Math.pow(10, otpLength) - 1;
    const plainCode = randomInt(minRange, maxRange).toString();
    const codeHash = this.hashString(plainCode);

    // 6. Encrypt target destination
    const destinationEncrypted = this.secretsService.encrypt(dto.destination);

    // 7. Calculate Expiration Date
    const expirationMin =
      this.configService.get<number>('OTP_DEFAULT_EXPIRATION_MINUTES') ?? 5;
    const expiresAt = new Date(Date.now() + expirationMin * 60 * 1000);

    // 8. Store Challenge
    let challenge = await this.prisma.challenge.create({
      data: {
        workspaceId,
        projectId,
        channel: dto.channel,
        purpose: dto.purpose,
        destinationHash,
        destinationEncrypted,
        codeHash,
        codeLength: otpLength,
        expiresAt,
        idempotencyKey: dto.idempotencyKey,
        metadata: dto.metadata ? JSON.parse(JSON.stringify(dto.metadata)) : {},
      },
    });

    const signedUrl = this.verifyLinkService.generateSignedUrl(
      challenge.id,
      challenge.expiresAt,
    );

    // Merge signedUrl and locale into metadata
    const currentMetadata: any = (challenge as any).metadata || {};
    let metadataChanged = false;
    if (!currentMetadata.actionUrl) {
      currentMetadata.actionUrl = signedUrl;
      metadataChanged = true;
    }
    if (dto.locale && currentMetadata.locale !== dto.locale) {
      currentMetadata.locale = dto.locale;
      metadataChanged = true;
    }
    if (metadataChanged) {
      challenge = await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: { metadata: currentMetadata },
      });
    }

    // 9. Enqueue async delivery job in Redis via BullMQ
    await this.deliveryQueue.add(
      'send_otp',
      {
        challengeId: challenge.id,
        plainCode,
        templateName: dto.templateName,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    await this.prisma.challenge.update({
      where: { id: challenge.id },
      data: { status: 'QUEUED' },
    });

    this.logger.log(
      `Challenge ${challenge.id} queued for destination ${dto.destination} via ${dto.channel}`,
    );

    // Sandbox check: expose plain code only in development or test environments
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isDev = nodeEnv === 'development' || nodeEnv === 'test';
    return {
      id: challenge.id,
      status: ChallengeStatus.QUEUED,
      expiresAt: challenge.expiresAt,
      signedUrl,
      ...(isDev ? { sandboxCode: plainCode } : {}),
    };
  }

  async verifyChallenge(id: string, projectId: string, code: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, projectId },
    });

    if (!challenge) {
      throw new NotFoundException('Verificación no encontrada.');
    }

    if (challenge.status === 'VERIFIED') {
      return {
        verified: true,
        message: 'El código ya ha sido verificado anteriormente.',
      };
    }

    if (
      challenge.status === 'FAILED' ||
      challenge.status === 'EXPIRED' ||
      challenge.status === 'CANCELLED'
    ) {
      throw new BadRequestException(
        `No se puede verificar esta solicitud: estado actual es ${challenge.status}.`,
      );
    }

    // Expiration check
    if (new Date() > challenge.expiresAt) {
      await this.prisma.challenge.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('El código de verificación ha expirado.');
    }

    // Max attempts check
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.prisma.challenge.update({
        where: { id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException(
        'Se ha superado el número máximo de intentos de verificación.',
      );
    }

    // Increment attempts
    const updatedAttempts = challenge.attempts + 1;
    await this.prisma.challenge.update({
      where: { id },
      data: { attempts: updatedAttempts },
    });

    // Hash comparison
    const inputHash = this.hashString(code);
    if (inputHash === challenge.codeHash) {
      await this.prisma.challenge.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          consumedAt: new Date(),
        },
      });

      await this.webhookService.triggerEvent(
        challenge.projectId,
        'challenge.verified',
        {
          challengeId: challenge.id,
          purpose: challenge.purpose,
          channel: challenge.channel,
          destinationHash: challenge.destinationHash,
          metadata: challenge.metadata,
          verifiedAt: new Date(),
        },
      );

      this.logger.log(`Challenge ${id} successfully verified.`);
      return { verified: true, message: 'Verificación exitosa.' };
    }

    // If matches fail check limit
    if (updatedAttempts >= challenge.maxAttempts) {
      await this.prisma.challenge.update({
        where: { id },
        data: { status: 'FAILED' },
      });

      await this.webhookService.triggerEvent(
        challenge.projectId,
        'challenge.failed',
        {
          challengeId: challenge.id,
          purpose: challenge.purpose,
          channel: challenge.channel,
          destinationHash: challenge.destinationHash,
          metadata: challenge.metadata,
          reason: 'MAX_ATTEMPTS_EXCEEDED',
        },
      );

      throw new BadRequestException(
        'Código incorrecto. Se ha agotado el número de intentos permitidos.',
      );
    }

    throw new BadRequestException('Código incorrecto.');
  }

  async resendChallenge(id: string, projectId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, projectId },
    });

    if (!challenge) {
      throw new NotFoundException('Verificación no encontrada.');
    }

    if (challenge.status === 'VERIFIED') {
      throw new BadRequestException('El código ya ha sido verificado.');
    }

    // Cooldown check (60s since lastSentAt or createdAt if lastSentAt is null)
    const lastSent = challenge.lastSentAt || challenge.createdAt;
    const secondsElapsed = (Date.now() - lastSent.getTime()) / 1000;
    if (secondsElapsed < 60) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Por favor, espere ${Math.ceil(60 - secondsElapsed)} segundos para reenviar.`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate new code
    const otpLength = challenge.codeLength;
    const minRange = Math.pow(10, otpLength - 1);
    const maxRange = Math.pow(10, otpLength) - 1;
    const plainCode = randomInt(minRange, maxRange).toString();
    const codeHash = this.hashString(plainCode);

    // Calculate new expiration date
    const expirationMin =
      this.configService.get<number>('OTP_DEFAULT_EXPIRATION_MINUTES') ?? 5;
    const expiresAt = new Date(Date.now() + expirationMin * 60 * 1000);

    const updated = await this.prisma.challenge.update({
      where: { id },
      data: {
        codeHash,
        expiresAt,
        status: 'QUEUED',
        resendCount: challenge.resendCount + 1,
        attempts: 0, // Reset attempts for the new code
      },
    });

    // Enqueue new delivery job
    await this.deliveryQueue.add(
      'send_otp',
      {
        challengeId: id,
        plainCode,
        templateName: (challenge as any).metadata?.templateName, // or fallback
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log(
      `Challenge ${id} resent. Resend count: ${updated.resendCount}`,
    );

    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isDev = nodeEnv === 'development' || nodeEnv === 'test';
    return {
      id: updated.id,
      status: ChallengeStatus.QUEUED,
      expiresAt: updated.expiresAt,
      ...(isDev ? { sandboxCode: plainCode } : {}),
    };
  }

  async findOne(id: string, projectId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, projectId },
      select: {
        id: true,
        channel: true,
        purpose: true,
        status: true,
        expiresAt: true,
        consumedAt: true,
        attempts: true,
        maxAttempts: true,
        resendCount: true,
        lastSentAt: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Verificación no encontrada.');
    }
    return challenge;
  }

  async cancelChallenge(id: string, projectId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, projectId },
    });

    if (!challenge) {
      throw new NotFoundException('Verificación no encontrada.');
    }

    if (challenge.status === 'VERIFIED') {
      throw new BadRequestException(
        'No se puede cancelar un código ya verificado.',
      );
    }

    const updated = await this.prisma.challenge.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.webhookService.triggerEvent(
      challenge.projectId,
      'challenge.cancelled',
      {
        challengeId: challenge.id,
        purpose: challenge.purpose,
        channel: challenge.channel,
        destinationHash: challenge.destinationHash,
        metadata: challenge.metadata,
      },
    );

    this.logger.log(`Challenge ${id} cancelled.`);
    return { id: updated.id, status: updated.status };
  }
}
