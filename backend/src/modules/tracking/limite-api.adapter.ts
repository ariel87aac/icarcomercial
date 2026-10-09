import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sanitizeSecrets } from '../../common/utils/secret-sanitizer.util';
import { ChannelSetting } from './entities/channel-setting.entity';

export interface ProviderSendResult {
  ok: boolean;
  recoverable: boolean;
  status: number | null;
  messageId: string | null;
  response: Record<string, unknown>;
  error: string | null;
}

@Injectable()
export class LimiteApiAdapter {
  async send(setting: ChannelSetting, number: string, body: string, token: string): Promise<ProviderSendResult> {
    if (!token.trim()) throw new ServiceUnavailableException('El token de LimiteAPI no está configurado');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), setting.timeoutMs);
    try {
      const response = await fetch(setting.apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ number, body }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let parsed: unknown = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { response: raw.slice(0, 500) }; }
      const sanitized = (sanitizeSecrets(parsed) ?? {}) as Record<string, unknown>;
      const providerId = this.findMessageId(sanitized);
      return {
        ok: response.ok,
        recoverable: response.status === 408 || response.status === 429 || response.status >= 500,
        status: response.status,
        messageId: providerId,
        response: sanitized,
        error: response.ok ? null : `LimiteAPI respondió HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'Tiempo de espera agotado al contactar LimiteAPI'
        : 'No fue posible contactar LimiteAPI';
      return { ok: false, recoverable: true, status: null, messageId: null, response: { message }, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private findMessageId(response: Record<string, unknown>): string | null {
    for (const key of ['id', 'messageId', 'message_id']) {
      const value = response[key];
      if (typeof value === 'string' && value.length <= 160) return value;
    }
    const data = response['data'];
    if (data && typeof data === 'object') return this.findMessageId(data as Record<string, unknown>);
    return null;
  }
}
