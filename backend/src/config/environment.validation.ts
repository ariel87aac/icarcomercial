interface EnvironmentConfig {
  [key: string]: unknown;
}

const requiredVariables = [
  'DATABASE_HOST',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'JWT_SECRET',
  'INITIAL_ADMIN_PASSWORD',
] as const;

export function validateEnvironment(
  environment: EnvironmentConfig,
): EnvironmentConfig {
  const missing = requiredVariables.filter(
    (key) => typeof environment[key] !== 'string' || environment[key] === '',
  );

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}`,
    );
  }

  const port = Number(environment['DATABASE_PORT'] ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DATABASE_PORT debe ser un puerto TCP válido');
  }

  const applicationPort = Number(environment['PORT'] ?? 3000);
  const accessTtl = Number(environment['JWT_ACCESS_TTL_SECONDS'] ?? 900);
  const refreshTtl = Number(environment['REFRESH_TOKEN_TTL_SECONDS'] ?? 604800);
  if (!Number.isInteger(applicationPort) || applicationPort < 1 || applicationPort > 65_535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }
  if (!Number.isInteger(accessTtl) || accessTtl < 60) {
    throw new Error('JWT_ACCESS_TTL_SECONDS debe ser un entero de al menos 60 segundos');
  }
  if (!Number.isInteger(refreshTtl) || refreshTtl <= accessTtl) {
    throw new Error('REFRESH_TOKEN_TTL_SECONDS debe ser mayor que JWT_ACCESS_TTL_SECONDS');
  }
  if (String(environment['JWT_SECRET']).length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }

  return {
    ...environment,
    DATABASE_PORT: port,
    PORT: applicationPort,
    JWT_ACCESS_TTL_SECONDS: accessTtl,
    REFRESH_TOKEN_TTL_SECONDS: refreshTtl,
  };
}
