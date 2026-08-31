import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
  service: 'backend';
  database: 'up';
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        service: 'backend',
        database: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }
}
