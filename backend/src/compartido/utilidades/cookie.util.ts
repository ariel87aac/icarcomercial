export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const entry = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  return decodeURIComponent(entry.slice(name.length + 1));
}

