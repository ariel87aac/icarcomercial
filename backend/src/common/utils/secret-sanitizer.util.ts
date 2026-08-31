const sensitiveKeys = [
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'cookie',
];

export function sanitizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKeys.includes(key.toLowerCase()))
      .map(([key, nested]) => [key, sanitizeSecrets(nested)]),
  );
}

