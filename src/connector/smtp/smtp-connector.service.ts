import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SecretsService } from '../../common/security/secrets.service.js';
import { CreateSmtpConnectorDto, UpdateSmtpConnectorDto } from './dto/create-smtp-connector.dto.js';
import { createTransport } from 'nodemailer';

@Injectable()
export class SmtpConnectorService {
  private readonly logger = new Logger(SmtpConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {}

  async create(workspaceId: string, dto: CreateSmtpConnectorDto) {
    const passwordEncrypted = this.secretsService.encrypt(dto.password);

    const connector = await this.prisma.smtpConnector.create({
      data: {
        workspaceId,
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? false,
        username: dto.username,
        passwordEncrypted,
        fromName: dto.fromName,
        fromEmail: dto.fromEmail,
        replyTo: dto.replyTo,
        maxDailySends: dto.maxDailySends ?? 1000,
        maxHourlySends: dto.maxHourlySends ?? 100,
      },
    });

    this.logger.log(`SMTP Connector created for workspace ${workspaceId}`);
    return this.sanitizeConnector(connector);
  }

  async findAll(workspaceId: string) {
    const connectors = await this.prisma.smtpConnector.findMany({
      where: { workspaceId },
    });
    return connectors.map(c => this.sanitizeConnector(c));
  }

  async findOne(workspaceId: string, id: string) {
    const connector = await this.prisma.smtpConnector.findFirst({
      where: { id, workspaceId },
    });
    if (!connector) {
      throw new NotFoundException('Conector SMTP no encontrado.');
    }
    return this.sanitizeConnector(connector);
  }

  async update(workspaceId: string, id: string, dto: UpdateSmtpConnectorDto) {
    const connector = await this.prisma.smtpConnector.findFirst({
      where: { id, workspaceId },
    });
    if (!connector) {
      throw new NotFoundException('Conector SMTP no encontrado.');
    }

    const updatedData: any = {
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      username: dto.username,
      fromName: dto.fromName,
      fromEmail: dto.fromEmail,
      replyTo: dto.replyTo,
      maxDailySends: dto.maxDailySends,
      maxHourlySends: dto.maxHourlySends,
    };

    if (dto.password) {
      updatedData.passwordEncrypted = this.secretsService.encrypt(dto.password);
    }

    const updated = await this.prisma.smtpConnector.update({
      where: { id },
      data: updatedData,
    });

    this.logger.log(`SMTP Connector ${id} updated for workspace ${workspaceId}`);
    return this.sanitizeConnector(updated);
  }

  async remove(workspaceId: string, id: string) {
    const connector = await this.prisma.smtpConnector.findFirst({
      where: { id, workspaceId },
    });
    if (!connector) {
      throw new NotFoundException('Conector SMTP no encontrado.');
    }

    await this.prisma.smtpConnector.delete({
      where: { id },
    });

    this.logger.log(`SMTP Connector ${id} deleted for workspace ${workspaceId}`);
    return { success: true };
  }

  async testConnection(workspaceId: string, id: string) {
    const connector = await this.prisma.smtpConnector.findFirst({
      where: { id, workspaceId },
    });
    if (!connector) {
      throw new NotFoundException('Conector SMTP no encontrado.');
    }

    const decryptedPassword = this.secretsService.decrypt(connector.passwordEncrypted);

    // Create a transporter just for verification
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
      await transporter.verify();
      
      const updated = await this.prisma.smtpConnector.update({
        where: { id },
        data: {
          testedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(`SMTP connection verified successfully for connector ${id}`);
      return {
        success: true,
        message: 'Conexión SMTP exitosa.',
        testedAt: updated.testedAt,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Error de autenticación o de conexión.';
      
      await this.prisma.smtpConnector.update({
        where: { id },
        data: {
          lastError: errorMessage,
        },
      });

      this.logger.warn(`SMTP connection failed for connector ${id}: ${errorMessage}`);
      return {
        success: false,
        message: `Fallo de conexión: ${errorMessage}`,
      };
    }
  }

  private sanitizeConnector(connector: any) {
    // Delete encrypted password from output object
    const sanitized = { ...connector };
    delete sanitized.passwordEncrypted;
    return sanitized;
  }
}
