import { Injectable, Inject, Logger, OnModuleDestroy, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { WhatsappClientRegistry } from './whatsapp-client.registry.js';
import { WwebjsProvider } from './providers/wwebjs.provider.js';
import { WhatsappConnectorStatus } from '@prisma/client';

@Injectable()
export class WhatsappSessionManager implements OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(WhatsappSessionManager.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: WhatsappClientRegistry,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Auto-initializing active WhatsApp connectors on bootstrap...');
    try {
      const activeConnectors = await this.prisma.whatsappConnector.findMany({
        where: {
          status: {
            in: [
              WhatsappConnectorStatus.READY,
              WhatsappConnectorStatus.AUTHENTICATED,
              WhatsappConnectorStatus.QR_READY,
              WhatsappConnectorStatus.PENDING_QR,
              WhatsappConnectorStatus.RECONNECTING,
            ],
          },
        },
      });

      for (const connector of activeConnectors) {
        this.logger.log(`Bootstrap-initializing WhatsApp connector: ${connector.id}`);
        this.initClient(connector.id).catch((err) => {
          this.logger.error(`Failed to auto-init connector ${connector.id}: ${err.message}`);
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to retrieve active connectors during bootstrap: ${error.message}`);
    }
  }

  async initClient(connectorId: string): Promise<void> {
    const lockKey = `lock:wwebjs:connector:${connectorId}`;
    const lockValue = Math.random().toString();
    
    // Acquire distributed lock for 30 seconds
    const acquired = await this.redis.set(lockKey, lockValue, 'PX', 30000, 'NX');
    if (!acquired) {
      this.logger.warn(`Could not acquire lock for connector ${connectorId}. Initialization already in progress.`);
      return;
    }

    try {
      if (this.registry.has(connectorId)) {
        this.logger.log(`WhatsApp client already initialized in registry for connector: ${connectorId}`);
        return;
      }

      const connector = await this.prisma.whatsappConnector.findUnique({
        where: { id: connectorId },
      });

      if (!connector) {
        throw new Error(`Connector ${connectorId} not found in database`);
      }

      const sessionPath = this.configService.get<string>('WWEBJS_SESSION_PATH') || './wwebjs_sessions';
      const executablePath = this.configService.get<string>('WWEBJS_CHROMIUM_EXECUTABLE_PATH');
      const clientId = `${connector.workspaceId}_${connector.id}`;

      this.logger.log(`Initializing whatsapp-web.js for client ${clientId} at path ${sessionPath}`);

      const client = new Client({
        authStrategy: new LocalAuth({
          clientId,
          dataPath: sessionPath,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
          ...(executablePath ? { executablePath } : {}),
        },
      });

      const provider = new WwebjsProvider(client);

      // Register the client immediately in the registry to avoid double spawn
      this.registry.register(connectorId, client, provider);

      // Set up event listeners
      client.on('qr', async (qr) => {
        this.logger.log(`QR code received for connector: ${connectorId}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.QR_READY, qr);
      });

      client.on('authenticated', async () => {
        this.logger.log(`WhatsApp authenticated for connector: ${connectorId}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.AUTHENTICATED);
      });

      client.on('auth_failure', async (msg) => {
        this.logger.error(`WhatsApp auth failure for connector: ${connectorId}. Msg: ${msg}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.FAILED, undefined, msg);
      });

      client.on('ready', async () => {
        this.logger.log(`WhatsApp client ready for connector: ${connectorId}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.READY);
      });

      client.on('disconnected', async (reason) => {
        this.logger.warn(`WhatsApp client disconnected for connector: ${connectorId}. Reason: ${reason}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.DISCONNECTED, undefined, reason);
        // Unregister from memory since it's disconnected
        this.registry.unregister(connectorId);
      });

      // Initialize the client in the background
      client.initialize().catch(async (err: any) => {
        this.logger.error(`Error during client.initialize() for connector ${connectorId}: ${err.message}`);
        await this.updateStatus(connectorId, WhatsappConnectorStatus.FAILED, undefined, err.message);
        this.registry.unregister(connectorId);
      });

    } finally {
      // Release lock atomically
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(releaseScript, 1, lockKey, lockValue);
    }
  }

  async stopClient(connectorId: string): Promise<void> {
    const entry = this.registry.get(connectorId);
    if (entry) {
      this.logger.log(`Stopping client for connector: ${connectorId}`);
      await entry.provider.destroy();
      this.registry.unregister(connectorId);
      await this.updateStatus(connectorId, WhatsappConnectorStatus.DISCONNECTED);
    }
  }

  async logoutClient(connectorId: string): Promise<void> {
    const entry = this.registry.get(connectorId);
    if (entry) {
      this.logger.log(`Logging out client for connector: ${connectorId}`);
      await entry.provider.logout();
      await entry.provider.destroy();
      this.registry.unregister(connectorId);
    }
    await this.updateStatus(connectorId, WhatsappConnectorStatus.PENDING_QR);
  }

  async restartClient(connectorId: string): Promise<void> {
    this.logger.log(`Restarting client for connector: ${connectorId}`);
    await this.stopClient(connectorId);
    await this.initClient(connectorId);
  }

  private async updateStatus(
    connectorId: string,
    status: WhatsappConnectorStatus,
    qrCode?: string,
    lastError?: string,
  ): Promise<void> {
    try {
      await this.prisma.whatsappConnector.update({
        where: { id: connectorId },
        data: {
          status,
          qrCode: qrCode || null,
          lastError: lastError || null,
        },
      });

      await this.prisma.whatsappSessionEvent.create({
        data: {
          connectorId,
          eventType: status,
          message: lastError || (qrCode ? 'QR code generated' : `Session state changed to ${status}`),
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to update status for connector ${connectorId}: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully destroying all WhatsApp sessions on shutdown...');
    const allClients = Array.from(this.registry.getAll().entries());
    for (const [connectorId, entry] of allClients) {
      try {
        this.logger.log(`Destroying client for connector: ${connectorId}`);
        await entry.provider.destroy();
      } catch (err: any) {
        this.logger.error(`Error destroying client ${connectorId}: ${err.message}`);
      }
    }
  }
}
