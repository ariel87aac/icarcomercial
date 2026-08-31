import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfig(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.getOrThrow<string>('DATABASE_HOST'),
    port: config.get<number>('DATABASE_PORT', 5432),
    username: config.getOrThrow<string>('DATABASE_USER'),
    password: config.getOrThrow<string>('DATABASE_PASSWORD'),
    database: config.getOrThrow<string>('DATABASE_NAME'),
    ssl:
      config.get<string>('DATABASE_SSL', 'false') === 'true'
        ? { rejectUnauthorized: true }
        : false,
    autoLoadEntities: true,
    synchronize: false,
    retryAttempts: 10,
    retryDelay: 3_000,
    logging: config.get<string>('NODE_ENV') === 'development',
  };
}

