import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ConfigOrderPublicUrlAdapter } from './config-order-public-url.adapter';

describe('URL pública de pedidos', () => {
  it.each([
    [{ PUBLIC_APP_URL: ' https://pedidos.example/ ', CORS_ORIGIN: 'https://otro.example' }, 'https://pedidos.example'],
    [
      { PUBLIC_APP_URL: ' ', CORS_ORIGIN: ' https://primero.example/ ,https://segundo.example' },
      'https://primero.example',
    ],
    [{}, 'http://localhost:8080'],
  ])('mantiene precedencia, normalización y valor por defecto: %j', (configuration, expected) => {
    expect(new ConfigOrderPublicUrlAdapter(new ConfigService(configuration)).publicBaseUrl()).toBe(expected);
  });
});
