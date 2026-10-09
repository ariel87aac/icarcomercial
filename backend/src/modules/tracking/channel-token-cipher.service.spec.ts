import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ChannelTokenCipherService } from './channel-token-cipher.service';

describe('ChannelTokenCipherService', () => {
  const service = new ChannelTokenCipherService({
    get: (key: string, fallback: string) => key === 'CHANNEL_CREDENTIALS_KEY' ? 'clave-de-prueba-suficientemente-larga' : fallback,
    getOrThrow: () => 'jwt-secret-de-prueba',
  } as ConfigService);

  it('cifra el token sin conservar el texto original y puede recuperarlo', () => {
    const token = 'token-secreto-limite-api-XYZ';
    const encrypted = service.encrypt(token);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(token);
    expect(service.decrypt(encrypted)).toBe(token);
  });

  it('rechaza un valor cifrado alterado', () => {
    const encrypted = service.encrypt('otro-token-secreto-123');
    const parts = encrypted.split(':');
    parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
    const tampered = parts.join(':');

    expect(() => service.decrypt(tampered)).toThrow('No fue posible descifrar la credencial del canal');
  });
});
