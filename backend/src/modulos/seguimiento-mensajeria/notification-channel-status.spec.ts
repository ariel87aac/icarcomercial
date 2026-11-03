import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { ChannelSetting } from './entidades/channel-setting.entity';
import { NotificationService } from './notification.service';

describe('NotificationService - estado global del canal', () => {
  const actor = { id: 'usuario-1', name: 'Administrador' } as AuthenticatedUser;
  const channel = {
    id: 'canal-1',
    provider: 'LIMITEAPI',
    apiUrl: 'https://api.example.com/messages',
    encryptedToken: 'token-cifrado',
    tokenLast3: 'xyz',
    enabledNumber: '59170000000',
    licenseReference: null,
    timeoutMs: 10_000,
    maxRetries: 3,
    retryDelaySeconds: 60,
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedById: actor.id,
    updatedBy: actor,
  } as unknown as ChannelSetting;

  it('devuelve la configuración más reciente aunque esté deshabilitada', async () => {
    const subject = Object.create(NotificationService.prototype) as NotificationService;
    Object.assign(subject, {
      channels: { find: vi.fn().mockResolvedValue([channel]) },
    });
    await expect(subject.getChannel()).resolves.toMatchObject({ id: 'canal-1', active: false, tokenConfigured: true });
  });

  it('devuelve null cuando todavía no existe configuración', async () => {
    const subject = Object.create(NotificationService.prototype) as NotificationService;
    Object.assign(subject, {
      channels: { find: vi.fn().mockResolvedValue([]) },
    });
    await expect(subject.getChannel()).resolves.toBeNull();
  });

  it('permite guardar un canal deshabilitado conservando la credencial cifrada', async () => {
    const create = vi.fn((value) => value);
    const save = vi.fn(async (value) => ({ ...value, id: 'canal-2' }));
    const update = vi.fn().mockResolvedValue(undefined);
    const subject = Object.create(NotificationService.prototype) as NotificationService;
    Object.assign(subject, {
      latestChannelWithCredential: vi.fn().mockResolvedValue({
        ...channel,
        encryptedToken: 'token-cifrado',
        tokenLast3: 'xyz',
      }),
      dataSource: {
        transaction: (work: (manager: { getRepository: () => { create: typeof create; save: typeof save; update: typeof update } }) => unknown) =>
          work({ getRepository: () => ({ create, save, update }) }),
      },
      channels: { findOneOrFail: vi.fn().mockResolvedValue(channel) },
      audit: { record: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(subject.saveChannel({
      apiUrl: channel.apiUrl,
      enabledNumber: channel.enabledNumber,
      licenseReference: '',
      timeoutMs: channel.timeoutMs,
      maxRetries: channel.maxRetries,
      retryDelaySeconds: channel.retryDelaySeconds,
      active: false,
    }, actor)).resolves.toMatchObject({ active: false, tokenConfigured: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      encryptedToken: 'token-cifrado',
      tokenLast3: 'xyz',
      active: false,
    }));
  });

  it('deshabilita el canal, conserva la configuración y registra auditoría', async () => {
    const update = vi.fn().mockResolvedValue({ affected: 2 });
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const subject = Object.create(NotificationService.prototype) as NotificationService;
    Object.assign(subject, {
      channels: {
        find: vi.fn().mockResolvedValue([{ ...channel, active: true }]),
        findOneOrFail: vi.fn().mockResolvedValue(channel),
      },
      dataSource: {
        transaction: (work: (manager: { getRepository: () => { update: typeof update } }) => unknown) =>
          work({ getRepository: () => ({ update }) }),
      },
      audit,
    });

    await expect(subject.setChannelActive(false, actor)).resolves.toMatchObject({ active: false });
    expect(update).toHaveBeenCalledWith({ active: true }, { active: false });
    expect(update).toHaveBeenCalledWith('canal-1', { active: false, updatedById: actor.id });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DESHABILITAR_CANAL',
      metadata: { active: false, omitted: 2 },
    }));
  });
});
