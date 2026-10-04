import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const sslEnabled = process.env['DATABASE_SSL'] === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['DATABASE_PORT'] ?? 5432),
  username: process.env['DATABASE_USER'],
  password: process.env['DATABASE_PASSWORD'],
  database: process.env['DATABASE_NAME'],
  ssl: sslEnabled ? { rejectUnauthorized: true } : false,
  synchronize: false,
  logging: false,
  migrationsTableName: 'migraciones',
  migrations: [join(__dirname, 'migrations', '*.js')],
});
