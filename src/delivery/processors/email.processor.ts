import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SecretsService } from '../../common/security/secrets.service.js';
import { TemplateService } from '../../template/template.service.js';
import { createTransport } from 'nodemailer';
import { WhatsappClientRegistry } from '../../connector/whatsapp/whatsapp-client.registry.js';
import { WebhookEndpointService } from '../../webhook/webhook-endpoint.service.js';

@Processor('delivery_queue')
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly templateService: TemplateService,
    private readonly registry: WhatsappClientRegistry,
    private readonly webhookService: WebhookEndpointService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== 'send_otp') {
      return;
    }

    const { challengeId, plainCode, templateName } = job.data;

    // 1. Fetch Challenge Details
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { project: true },
    });

    if (!challenge) {
      this.logger.error(`Challenge ${challengeId} not found in database.`);
      return;
    }

    const destination = this.secretsService.decrypt(
      challenge.destinationEncrypted,
    );

    // 2. Route by Channel
    if (challenge.channel === 'EMAIL') {
      await this.deliverEmail(challenge, plainCode, destination, templateName);
    } else if (challenge.channel === 'WHATSAPP') {
      await this.deliverWhatsApp(
        challenge,
        plainCode,
        destination,
        templateName,
      );
    }
  }

  private async deliverEmail(
    challenge: any,
    plainCode: string,
    destination: string,
    templateName?: string,
  ) {
    // 1. Find enabled SMTP connector for workspace
    const connector = await this.prisma.smtpConnector.findFirst({
      where: { workspaceId: challenge.workspaceId, enabled: true },
    });

    if (!connector) {
      const errorMsg = 'No active/enabled SMTP connector found for workspace.';
      await this.recordDeliveryFailure(challenge.id, null, errorMsg);
      throw new Error(errorMsg);
    }

    // 2. Fetch template
    const locale =
      challenge.metadata && challenge.metadata.locale === 'en' ? 'en' : 'es';
    let subject =
      locale === 'en' ? 'Verification Code' : 'Código de Verificación';
    let bodyHtml: string | null =
      locale === 'en'
        ? `<p>Your verification code is: <b>${plainCode}</b></p>`
        : `<p>Tu código de verificación es: <b>${plainCode}</b></p>`;
    let bodyText =
      locale === 'en'
        ? `Your verification code is: ${plainCode}`
        : `Tu código de verificación es: ${plainCode}`;

    if (templateName) {
      const template = await this.prisma.template.findFirst({
        where: {
          workspaceId: challenge.workspaceId,
          name: templateName,
          type: 'EMAIL',
        },
        include: {
          versions: {
            where: { isCurrent: true },
          },
        },
      });

      if (template && template.versions.length > 0) {
        const activeVer = template.versions[0];

        // Calculate expiration minutes
        const diffMs =
          challenge.expiresAt.getTime() - challenge.createdAt.getTime();
        const expiresInMinutes = Math.round(diffMs / 60000);

        const variables = {
          code: plainCode,
          appName: challenge.project.name,
          expiresInMinutes,
          purpose: challenge.purpose,
          actionUrl: challenge.metadata && challenge.metadata.actionUrl,
          tenantName: challenge.metadata && challenge.metadata.tenantName,
          supportEmail: challenge.metadata && challenge.metadata.supportEmail,
        };

        subject = this.templateService.renderVariables(
          activeVer.subject || 'Código de Verificación',
          variables,
        );
        bodyHtml = activeVer.bodyHtml
          ? this.templateService.renderVariables(activeVer.bodyHtml, variables)
          : null;
        bodyText = this.templateService.renderVariables(
          activeVer.bodyText,
          variables,
        );
      } else {
        this.logger.warn(
          `Template "${templateName}" not found. Falling back to default layout.`,
        );
      }
    }

    // 3. Decrypt SMTP password
    const decryptedPassword = this.secretsService.decrypt(
      connector.passwordEncrypted,
    );

    // 4. Initialize Nodemailer Transporter
    const transporter = createTransport({
      host: connector.host,
      port: connector.port,
      secure: connector.secure,
      auth: {
        user: connector.username,
        pass: decryptedPassword,
      },
    });

    try {
      // 5. Send Mail
      await transporter.sendMail({
        from: `"${connector.fromName}" <${connector.fromEmail}>`,
        to: destination,
        subject,
        html: bodyHtml || undefined,
        text: bodyText,
        replyTo: connector.replyTo || undefined,
      });

      // 6. Record success
      await this.prisma.$transaction([
        this.prisma.challenge.update({
          where: { id: challenge.id },
          data: { status: 'SENT', lastSentAt: new Date() },
        }),
        this.prisma.deliveryAttempt.create({
          data: {
            challengeId: challenge.id,
            connectorId: null, // SMTP uses host connector
            status: 'SENT',
            sentAt: new Date(),
            deliveredAt: new Date(), // SMTP sent is usually delivered for MVP
          },
        }),
      ]);

      await this.webhookService.triggerEvent(
        challenge.projectId,
        'challenge.sent',
        {
          challengeId: challenge.id,
          purpose: challenge.purpose,
          channel: challenge.channel,
          destinationHash: challenge.destinationHash,
          metadata: challenge.metadata,
        },
      );

      this.logger.log(
        `Email verification sent successfully to ${destination} for challenge ${challenge.id}`,
      );
    } catch (error: any) {
      const errorMsg = error.message || 'SMTP transmission error';
      await this.recordDeliveryFailure(challenge.id, connector.id, errorMsg);
      throw error; // Re-throw so BullMQ registers the failure/retry
    }
  }

  private async deliverWhatsApp(
    challenge: any,
    plainCode: string,
    destination: string,
    templateName?: string,
  ) {
    const connector = await this.prisma.whatsappConnector.findFirst({
      where: { workspaceId: challenge.workspaceId, status: 'READY' },
    });

    if (!connector) {
      const errorMsg =
        'No active/ready WhatsApp connector found for workspace.';
      await this.recordDeliveryFailure(challenge.id, null, errorMsg);
      throw new Error(errorMsg);
    }

    const locale =
      challenge.metadata && challenge.metadata.locale === 'en' ? 'en' : 'es';
    let bodyText =
      locale === 'en'
        ? `Your verification code is: ${plainCode}`
        : `Tu código de verificación es: ${plainCode}`;

    if (templateName) {
      const template = await this.prisma.template.findFirst({
        where: {
          workspaceId: challenge.workspaceId,
          name: templateName,
          type: 'WHATSAPP',
        },
        include: {
          versions: {
            where: { isCurrent: true },
          },
        },
      });

      if (template && template.versions.length > 0) {
        const activeVer = template.versions[0];

        // Calculate expiration minutes
        const diffMs =
          challenge.expiresAt.getTime() - challenge.createdAt.getTime();
        const expiresInMinutes = Math.round(diffMs / 60000);

        const variables = {
          code: plainCode,
          appName: challenge.project.name,
          expiresInMinutes,
          purpose: challenge.purpose,
          actionUrl: challenge.metadata && challenge.metadata.actionUrl,
          tenantName: challenge.metadata && challenge.metadata.tenantName,
          supportEmail: challenge.metadata && challenge.metadata.supportEmail,
        };

        bodyText = this.templateService.renderVariables(
          activeVer.bodyText,
          variables,
        );
      } else {
        this.logger.warn(
          `WhatsApp template "${templateName}" not found. Falling back to default layout.`,
        );
      }
    }

    const entry = this.registry.get(connector.id);
    if (!entry) {
      const errorMsg = `WhatsApp session for connector ${connector.id} is not initialized in memory.`;
      await this.recordDeliveryFailure(challenge.id, connector.id, errorMsg);
      throw new Error(errorMsg);
    }

    try {
      await entry.provider.sendMessage(destination, bodyText);

      // Record success
      await this.prisma.$transaction([
        this.prisma.challenge.update({
          where: { id: challenge.id },
          data: { status: 'SENT', lastSentAt: new Date() },
        }),
        this.prisma.deliveryAttempt.create({
          data: {
            challengeId: challenge.id,
            connectorId: connector.id,
            status: 'SENT',
            sentAt: new Date(),
            deliveredAt: new Date(),
          },
        }),
      ]);

      await this.webhookService.triggerEvent(
        challenge.projectId,
        'challenge.sent',
        {
          challengeId: challenge.id,
          purpose: challenge.purpose,
          channel: challenge.channel,
          destinationHash: challenge.destinationHash,
          metadata: challenge.metadata,
        },
      );

      this.logger.log(
        `WhatsApp OTP sent successfully to ${destination} for challenge ${challenge.id}`,
      );
    } catch (error: any) {
      const errorMsg = error.message || 'WhatsApp transmission error';
      await this.recordDeliveryFailure(challenge.id, connector.id, errorMsg);
      throw error;
    }
  }

  private async recordDeliveryFailure(
    challengeId: string,
    connectorId: string | null,
    errorMsg: string,
  ) {
    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { id: challengeId },
      });

      await this.prisma.$transaction([
        this.prisma.challenge.update({
          where: { id: challengeId },
          data: { status: 'FAILED' },
        }),
        this.prisma.deliveryAttempt.create({
          data: {
            challengeId,
            status: 'FAILED',
            error: errorMsg,
          },
        }),
      ]);

      if (challenge) {
        await this.webhookService.triggerEvent(
          challenge.projectId,
          'challenge.failed',
          {
            challengeId: challenge.id,
            purpose: challenge.purpose,
            channel: challenge.channel,
            destinationHash: challenge.destinationHash,
            metadata: challenge.metadata,
            reason: errorMsg,
          },
        );
      }
    } catch (dbErr: any) {
      this.logger.error(
        `Failed to record database delivery failure status: ${dbErr.message}`,
      );
    }
  }
}
