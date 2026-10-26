import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelSetting } from './entities/channel-setting.entity';
import { LimiteApiAdapter } from './limite-api.adapter';

describe('LimiteApiAdapter', () => {
  const setting = {
    apiUrl: 'https://apiqr.limiteflix.com/api/v1/messages/send',
    timeoutMs: 10_000,
  } as ChannelSetting;

  afterEach(() => vi.restoreAllMocks());

  it('envía el formato esperado y conserva una respuesta sanitizada', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { messageId: 'mensaje-123', token: 'no-debe-guardarse', access_token: 'tampoco', apiKey: 'ni-esto' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await new LimiteApiAdapter().send(setting, '59170000000', 'Mensaje de prueba', 'token-secreto');

    expect(fetchMock).toHaveBeenCalledWith(setting.apiUrl, expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token-secreto',
      },
      body: JSON.stringify({ number: '59170000000', body: 'Mensaje de prueba' }),
    }));
    expect(result).toMatchObject({ ok: true, status: 200, messageId: 'mensaje-123', error: null });
    expect(result.response).toEqual({ data: { messageId: 'mensaje-123' } });
  });

  it('devuelve un diagnóstico recuperable cuando no existe conexión', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await new LimiteApiAdapter().send(setting, '59170000000', 'Mensaje de prueba', 'token-secreto');

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      status: null,
      messageId: null,
      response: { message: 'No fue posible contactar LimiteAPI' },
      error: 'No fue posible contactar LimiteAPI',
    });
  });
});
