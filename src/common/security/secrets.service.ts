import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('ENCRYPTION_MASTER_KEY');
    if (!rawKey) {
      throw new Error('ENCRYPTION_MASTER_KEY is not defined in the environment.');
    }

    // Always derive a 32-byte (256-bit) key regardless of the key length in env
    this.encryptionKey = createHash('sha256').update(rawKey).digest();
  }

  encrypt(text: string): string {
    try {
      const iv = randomBytes(12); // 12 bytes IV is standard for GCM
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();

      // Store as iv:tag:encryptedText
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error: any) {
      this.logger.error('Encryption failed', error.stack);
      throw new Error('Encryption operation failed.');
    }
  }

  decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format.');
      }

      const [ivHex, tagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      this.logger.error('Decryption failed', error.stack);
      throw new Error('Decryption operation failed.');
    }
  }
}
