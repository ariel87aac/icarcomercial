import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class ChannelTokenCipherService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split(':');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new ServiceUnavailableException('La credencial almacenada no tiene un formato válido');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('No fue posible descifrar la credencial del canal');
    }
  }

  private key(): Buffer {
    const secret = this.config.get<string>('CHANNEL_CREDENTIALS_KEY', '').trim()
      || this.config.getOrThrow<string>('JWT_SECRET');
    return createHash('sha256').update(`icar:notification-channel:${secret}`).digest();
  }
}
