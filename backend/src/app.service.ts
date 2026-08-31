import { Injectable } from '@nestjs/common';

export interface ApplicationInfo {
  name: string;
  description: string;
  version: string;
}

@Injectable()
export class AppService {
  getApplicationInfo(): ApplicationInfo {
    return {
      name: 'Sistema Comercial ICAR',
      description: 'API REST para comercialización y distribución',
      version: '0.1.0',
    };
  }
}

