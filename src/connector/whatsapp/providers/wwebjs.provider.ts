import { Client } from 'whatsapp-web.js';
import { WhatsappProvider } from './whatsapp.provider.js';

export class WwebjsProvider implements WhatsappProvider {
  constructor(private readonly client: Client) {}

  async sendMessage(to: string, message: string): Promise<void> {
    let formattedTo = to.replace(/[^0-9]/g, '');
    if (!formattedTo.endsWith('@c.us')) {
      formattedTo = `${formattedTo}@c.us`;
    }
    await this.client.sendMessage(formattedTo, message);
  }

  async getState(): Promise<string> {
    try {
      const state = await this.client.getState();
      return state || 'DISCONNECTED';
    } catch {
      return 'DISCONNECTED';
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      // Ignore if already logged out or destroyed
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.client.destroy();
    } catch {
      // Ignore errors during destruction
    }
  }
}
