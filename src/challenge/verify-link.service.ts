import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class VerifyLinkService {
  private readonly logger = new Logger(VerifyLinkService.name);
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('ENCRYPTION_MASTER_KEY') ||
      'fallback_secret_key';
  }

  generateSignedUrl(challengeId: string, expiresAt: Date): string {
    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const expiresTimestamp = expiresAt.getTime().toString();

    // HMAC Signature over challengeId + expires
    const signature = createHmac('sha256', this.secretKey)
      .update(`${challengeId}:${expiresTimestamp}`)
      .digest('hex');

    return `${appUrl}/v1/challenges/verify-link?id=${challengeId}&expires=${expiresTimestamp}&signature=${signature}`;
  }

  verifySignature(
    challengeId: string,
    expiresTimestamp: string,
    signature: string,
  ): boolean {
    try {
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(`${challengeId}:${expiresTimestamp}`)
        .digest('hex');

      // Check signature validity
      if (signature !== expectedSignature) {
        this.logger.warn(`Signature mismatch for challenge ${challengeId}`);
        return false;
      }

      // Check expiration
      const expiresAt = parseInt(expiresTimestamp, 10);
      if (Date.now() > expiresAt) {
        this.logger.warn(`Signature expired for challenge ${challengeId}`);
        return false;
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Error verifying signature: ${error.message}`);
      return false;
    }
  }
}
