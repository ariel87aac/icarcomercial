const sensitiveKeyFragments = [
  'password',
  'password_hash',
  'token',
  'authorization',
  'secret',
  'cookie',
  'credential',
  'api_key',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment.replace(/[^a-z0-9]/g, '')));
}

export function sanitizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, nested]) => [key, sanitizeSecrets(nested)]),
  );
}

