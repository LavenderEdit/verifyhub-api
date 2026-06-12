import { Injectable } from '@nestjs/common';
import { VerifyHubSDK } from '../../sdk/verifyhub-sdk.js';

@Injectable()
export class VerificationService {
  private readonly sdk: VerifyHubSDK;

  constructor() {
    this.sdk = new VerifyHubSDK({
      apiKey: process.env.VERIFYHUB_API_KEY || 'vh_live_example_key',
      baseUrl: process.env.VERIFYHUB_BASE_URL || 'http://localhost:3000',
    });
  }

  async sendEmailOtp(email: string) {
    return this.sdk.createChallenge({
      channel: 'EMAIL',
      purpose: 'VERIFY_EMAIL',
      destination: email,
      locale: 'es',
    });
  }

  async sendWhatsappOtp(phone: string) {
    return this.sdk.createChallenge({
      channel: 'WHATSAPP',
      purpose: 'VERIFY_PHONE',
      destination: phone,
      locale: 'es',
    });
  }

  async verifyOtp(challengeId: string, code: string) {
    return this.sdk.verifyChallenge(challengeId, code);
  }
}
