import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { WhatsappSessionManager } from './whatsapp-session.manager.js';
import { WhatsappClientRegistry } from './whatsapp-client.registry.js';
import { WhatsappConnector } from '@prisma/client';

@Injectable()
export class WhatsappConnectorService {
  private readonly logger = new Logger(WhatsappConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: WhatsappSessionManager,
    private readonly registry: WhatsappClientRegistry,
  ) {}

  async create(workspaceId: string, name: string): Promise<WhatsappConnector> {
    const connector = await this.prisma.whatsappConnector.create({
      data: {
        workspaceId,
        name,
        status: 'PENDING_QR',
      },
    });

    // Start initialization asynchronously in background
    this.sessionManager.initClient(connector.id).catch((err) => {
      this.logger.error(
        `Failed to initialize client for new connector ${connector.id}: ${err.message}`,
      );
    });

    return connector;
  }

  async findAll(workspaceId: string): Promise<WhatsappConnector[]> {
    return this.prisma.whatsappConnector.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    connectorId: string,
    workspaceId: string,
  ): Promise<WhatsappConnector> {
    const connector = await this.prisma.whatsappConnector.findFirst({
      where: { id: connectorId, workspaceId },
    });

    if (!connector) {
      throw new NotFoundException(
        `WhatsApp connector ${connectorId} not found in this workspace.`,
      );
    }

    return connector;
  }

  async getStatus(connectorId: string, workspaceId: string) {
    const connector = await this.findOne(connectorId, workspaceId);

    // Check dynamic state from provider if ready
    let dynamicState = connector.status;
    const entry = this.registry.get(connectorId);
    if (entry) {
      const state = await entry.provider.getState();
      dynamicState = state as any;
    }

    return {
      id: connector.id,
      name: connector.name,
      status: connector.status,
      dynamicState,
      qrCode: connector.qrCode,
      lastError: connector.lastError,
      updatedAt: connector.updatedAt,
    };
  }

  async restart(
    connectorId: string,
    workspaceId: string,
  ): Promise<{ message: string }> {
    await this.findOne(connectorId, workspaceId);

    // Trigger restart in background
    this.sessionManager.restartClient(connectorId).catch((err) => {
      this.logger.error(
        `Error during manual restart of connector ${connectorId}: ${err.message}`,
      );
    });

    return { message: 'WhatsApp session restart initiated.' };
  }

  async logout(
    connectorId: string,
    workspaceId: string,
  ): Promise<{ message: string }> {
    await this.findOne(connectorId, workspaceId);
    await this.sessionManager.logoutClient(connectorId);
    return { message: 'Logged out and WhatsApp session destroyed.' };
  }

  async testSend(
    connectorId: string,
    workspaceId: string,
    to: string,
    message: string,
  ): Promise<{ messageId: string }> {
    await this.findOne(connectorId, workspaceId);

    const entry = this.registry.get(connectorId);
    if (!entry) {
      throw new BadRequestException(
        'WhatsApp session is not active or initialized.',
      );
    }

    const state = await entry.provider.getState();
    if (state !== 'CONNECTED' && entry.client.info === undefined) {
      // In whatsapp-web.js, we check if client is authenticated and ready
      throw new BadRequestException(
        `WhatsApp session is not ready (State: ${state}).`,
      );
    }

    try {
      await entry.provider.sendMessage(to, message);
      return { messageId: `test_${Date.now()}` };
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to send WhatsApp message: ${error.message}`,
      );
    }
  }

  async delete(
    connectorId: string,
    workspaceId: string,
  ): Promise<{ message: string }> {
    const connector = await this.findOne(connectorId, workspaceId);

    // Stop and destroy Puppeteer client
    await this.sessionManager.stopClient(connectorId);

    // Delete from DB
    await this.prisma.whatsappConnector.delete({
      where: { id: connector.id },
    });

    return { message: 'WhatsApp connector deleted successfully.' };
  }
}
