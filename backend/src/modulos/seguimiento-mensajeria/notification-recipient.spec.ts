import { describe, expect, it } from 'vitest';
import { NotificationService } from './notification.service';

function normalize(value: string, countryCode: string): string | null {
  const subject = Object.create(NotificationService.prototype) as NotificationService;
  return (subject as unknown as {
    normalizeRecipient(value: string, countryCode: string): string | null;
  }).normalizeRecipient(value, countryCode);
}

describe('Destinatario de WhatsApp', () => {
  it('combina el código de país con un número local', () => {
    expect(normalize('69413721', '+591')).toBe('59169413721');
  });

  it('no duplica el código de país de un número internacional', () => {
    expect(normalize('59169413721', '+591')).toBe('59169413721');
  });

  it('acepta un número internacional escrito con prefijo +', () => {
    expect(normalize('+591 694 13721', '+591')).toBe('59169413721');
  });
});
