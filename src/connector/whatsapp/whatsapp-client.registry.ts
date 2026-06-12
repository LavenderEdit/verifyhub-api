import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'whatsapp-web.js';
import { WwebjsProvider } from './providers/wwebjs.provider.js';

@Injectable()
export class WhatsappClientRegistry {
  private readonly logger = new Logger(WhatsappClientRegistry.name);
  private readonly registry = new Map<
    string,
    { client: Client; provider: WwebjsProvider }
  >();

  register(
    connectorId: string,
    client: Client,
    provider: WwebjsProvider,
  ): void {
    this.logger.log(
      `Registering WhatsApp client in memory for connector: ${connectorId}`,
    );
    this.registry.set(connectorId, { client, provider });
  }

  get(
    connectorId: string,
  ): { client: Client; provider: WwebjsProvider } | undefined {
    return this.registry.get(connectorId);
  }

  getProvider(connectorId: string): WwebjsProvider | undefined {
    return this.registry.get(connectorId)?.provider;
  }

  unregister(connectorId: string): void {
    this.logger.log(
      `Unregistering WhatsApp client from memory for connector: ${connectorId}`,
    );
    this.registry.delete(connectorId);
  }

  has(connectorId: string): boolean {
    return this.registry.has(connectorId);
  }

  getAll(): Map<string, { client: Client; provider: WwebjsProvider }> {
    return this.registry;
  }
}
