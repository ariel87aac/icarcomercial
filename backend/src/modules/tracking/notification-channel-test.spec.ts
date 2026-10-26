import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ChannelSetting } from './entities/channel-setting.entity';
import { ChannelTestLog } from './entities/channel-test-log.entity';
import { NotificationService } from './notification.service';

function activeChannelRepository(channel: ChannelSetting | null) {
  return {
    createQueryBuilder: () => {
      const builder = {
        addSelect: () => builder,
        leftJoinAndSelect: () => builder,
        where: () => builder,
        orderBy: () => builder,
        getOne: async () => channel,
      };
      return builder;
    },
  };
}

describe('NotificationService - prueba del canal', () => {
  const actor = { id: 'usuario-1', name: 'Administrador' } as AuthenticatedUser;

  it('registra respuesta sanitizada y destinatario enmascarado', async () => {
    let saved: ChannelTestLog | null = null;
    const logs = {
      create: (value: ChannelTestLog) => value,
      save: async (value: ChannelTestLog) => {
        saved = { ...value, id: 'prueba-1', occurredAt: new Date() };
        return saved;
      },
      findOneOrFail: async () => ({ ...saved, testedBy: actor }),
    };
    const provider = {
      send: vi.fn().mockResolvedValue({
        ok: false,
        recoverable: false,
        status: 401,
        messageId: null,
        response: { message: 'No autorizado', token: 'dato-sensible' },
        error: 'LimiteAPI respondió HTTP 401',
      }),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new NotificationService(
      {} as never,
      {} as never,
      {} as never,
      activeChannelRepository({ id: 'canal-1', encryptedToken: 'cifrado', timeoutMs: 10_000 } as ChannelSetting) as never,
      logs as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      provider as never,
      { decrypt: () => 'token-real' } as never,
      {} as never,
    );

    const result = await service.testChannel({ number: '59171234567', body: 'Mensaje de prueba' }, actor);

    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ id: 'canal-1' }), '59171234567', 'Mensaje de prueba', 'token-real');
    expect(result).toMatchObject({ result: 'ERROR', httpStatus: 401, maskedRecipient: '•••••••4567' });
    expect(result.sanitizedResponse).toEqual({ message: 'No autorizado' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROBAR_CANAL', result: 'ERROR' }));
  });
});
