import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderPublicUrlPort } from '../aplicacion/puertos/order-public-url.port';

@Injectable()
export class ConfigOrderPublicUrlAdapter extends OrderPublicUrlPort {
  constructor(private readonly config: ConfigService) {
    super();
  }
  publicBaseUrl(): string {
    const configured = this.config.get<string>('PUBLIC_APP_URL', '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return this.config.get<string>('CORS_ORIGIN', 'http://localhost:8080').split(',')[0].trim().replace(/\/$/, '');
  }
}
