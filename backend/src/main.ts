import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const allowedOrigins = config
    .get<string>('CORS_ORIGIN', 'http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim());

  // A 2 MiB image becomes roughly 2.8 MiB when it is encoded as a JSON data URL.
  // The catalog service still enforces the real decoded-image limit.
  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
