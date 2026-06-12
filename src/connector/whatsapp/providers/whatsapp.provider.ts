export interface WhatsappProvider {
  sendMessage(to: string, message: string): Promise<void>;
  getState(): Promise<string>;
  logout(): Promise<void>;
  destroy(): Promise<void>;
}
