import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { VerifyLinkService } from './verify-link.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { WebhookEndpointService } from '../webhook/webhook-endpoint.service.js';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Delivery - Verify Links')
@Controller('challenges')
export class VerifyLinkController {
  private readonly logger = new Logger(VerifyLinkController.name);

  constructor(
    private readonly verifyLinkService: VerifyLinkService,
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookEndpointService,
  ) {}

  @Get('verify-link')
  @ApiOperation({ summary: 'Verify a challenge via public email/WA link' })
  async verifyLink(
    @Query('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: any,
  ) {
    const isSignatureValid = this.verifyLinkService.verifySignature(
      id,
      expires,
      signature,
    );

    if (!isSignatureValid) {
      return this.renderPage(res, {
        success: false,
        title: 'Enlace Inválido',
        message:
          'El enlace de verificación es incorrecto, ha expitado o ha sido manipulado.',
      });
    }

    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { id },
      });

      if (!challenge) {
        return this.renderPage(res, {
          success: false,
          title: 'No Encontrado',
          message: 'La solicitud de verificación ya no existe en el sistema.',
        });
      }

      if (challenge.status === 'VERIFIED') {
        const redirectUrl = (challenge as any).metadata?.actionUrl;
        return this.renderPage(res, {
          success: true,
          title: 'Ya Verificado',
          message:
            'Esta verificación ya ha sido procesada con éxito anteriormente.',
          redirectUrl,
        });
      }

      if (
        challenge.status === 'FAILED' ||
        challenge.status === 'CANCELLED' ||
        challenge.status === 'EXPIRED'
      ) {
        return this.renderPage(res, {
          success: false,
          title: 'Código Inválido',
          message: `Esta solicitud no puede procesarse. Su estado actual es: ${challenge.status}.`,
        });
      }

      // Mark as verified
      await this.prisma.challenge.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          consumedAt: new Date(),
        },
      });

      // Audit Log
      await this.prisma.auditLog.create({
        data: {
          workspaceId: challenge.workspaceId,
          projectId: challenge.projectId,
          action: 'CHALLENGE_VERIFIED_VIA_LINK',
          details: { challengeId: challenge.id },
        },
      });

      // Webhook Notification
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

      const redirectUrl = (challenge as any).metadata?.actionUrl;

      return this.renderPage(res, {
        success: true,
        title: '¡Verificado!',
        message: 'Tu código de verificación ha sido validado correctamente.',
        redirectUrl,
      });
    } catch (error: any) {
      this.logger.error(`Error during link verification: ${error.message}`);
      return this.renderPage(res, {
        success: false,
        title: 'Error del Sistema',
        message: 'Ocurrió un error inesperado al procesar la verificación.',
      });
    }
  }

  private renderPage(
    res: any,
    options: {
      success: boolean;
      title: string;
      message: string;
      redirectUrl?: string;
    },
  ) {
    const icon = options.success ? '✓' : '✗';
    const textClass = options.success ? 'success-text' : 'error-text';

    let buttonHtml = '';
    let refreshMeta = '';

    if (options.redirectUrl) {
      buttonHtml = `<a href="${options.redirectUrl}" class="btn">Continuar</a>`;
      refreshMeta = `<meta http-equiv="refresh" content="3;url=${options.redirectUrl}">`;
    }

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${refreshMeta}
  <title>Verificación - VerifyHub</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Outfit', sans-serif;
      background: radial-gradient(circle at center, #1a162b 0%, #0d0b14 100%);
      color: #ffffff;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .card {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 40px;
      width: 90%;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-left: auto;
      margin-right: auto;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: ${options.success ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)'};
      color: ${options.success ? '#34d399' : '#f87171'};
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 12px;
    }
    .success-text {
      background: linear-gradient(135deg, #34d399 0%, #059669 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .error-text {
      background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .message {
      font-size: 16px;
      color: #9ca3af;
      line-height: 1.5;
      margin-bottom: 32px;
    }
    .btn {
      display: inline-block;
      width: 90%;
      padding: 14px;
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      border: none;
      border-radius: 12px;
      color: #ffffff;
      font-weight: 600;
      font-size: 16px;
      text-decoration: none;
      cursor: pointer;
      box-shadow: 0 10px 20px rgba(139, 92, 246, 0.3);
      transition: all 0.3s ease;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 24px rgba(139, 92, 246, 0.4);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="title ${textClass}">${options.title}</div>
    <div class="message">${options.message}</div>
    ${buttonHtml}
  </div>
</body>
</html>
    `;
    res.type('text/html').send(html);
  }
}
