import { describe, expect, it, vi } from 'vitest';
import { Notification } from './entidades/notification.entity';
import { NotificationAttemptStatus, NotificationStatus } from './entidades/tracking.enums';
import { NotificationService } from './notification.service';

function queueService(result: { ok: boolean; recoverable: boolean; status: number; messageId: string | null; response: Record<string, unknown>; error: string | null }) {
  const item = {
    id: 'notificacion-1',
    recipient: '59170000001',
    renderedBody: 'Mensaje',
    attempts: [],
  } as unknown as Notification;
  const transactionRepository = { save: vi.fn(), createQueryBuilder: vi.fn() };
  const builder = {
    setLock: vi.fn(),
    setOnLocked: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    getOne: vi.fn().mockResolvedValue(item),
  };
  Object.values(builder).forEach((method) => {
    if (typeof method === 'function' && method !== builder.getOne) method.mockReturnValue(builder);
  });
  transactionRepository.createQueryBuilder.mockReturnValue(builder);
  const attempts = {
    create: vi.fn((value) => value),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = { update: vi.fn().mockResolvedValue(undefined) };
  const subject = Object.create(NotificationService.prototype) as NotificationService;
  Object.assign(subject, {
    dataSource: {
      transaction: (work: (manager: { getRepository: () => typeof transactionRepository }) => unknown) => work({ getRepository: () => transactionRepository }),
    },
    attempts,
    notifications,
    provider: { send: vi.fn().mockResolvedValue(result) },
    channelTokenCipher: { decrypt: vi.fn().mockReturnValue('token') },
    findOne: vi.fn().mockResolvedValue(item),
    activeChannelWithCredential: vi.fn().mockResolvedValue({
      encryptedToken: 'cifrado',
      maxRetries: 2,
      retryDelaySeconds: 5,
    }),
  });
  return { subject, attempts, notifications };
}

describe('Cola de notificaciones', () => {
  it('cierra sin envío la cola anterior cuando el canal está deshabilitado', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const subject = Object.create(NotificationService.prototype) as NotificationService;
    Object.assign(subject, {
      activeChannelWithCredential: vi.fn().mockResolvedValue(null),
      notifications: { update },
    });
    expect(await subject.processNext()).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: NotificationStatus.FAILED,
        lastError: 'Envío omitido porque el canal está deshabilitado',
      }),
    );
  });

  it('registra el intento exitoso y actualiza la notificación sin resincronizar sus relaciones', async () => {
    const { subject, attempts, notifications } = queueService({
      ok: true,
      recoverable: false,
      status: 200,
      messageId: 'mensaje-1',
      response: { ok: true },
      error: null,
    });
    expect(await subject.processNext()).toBe(true);
    expect(attempts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notificacion-1',
        status: NotificationAttemptStatus.SENT,
      }),
    );
    expect(notifications.update).toHaveBeenCalledWith(
      'notificacion-1',
      expect.objectContaining({
        status: NotificationStatus.SENT,
        providerMessageId: 'mensaje-1',
      }),
    );
  });

  it('registra el fallo y programa el reintento sin dejar la notificación en procesamiento', async () => {
    const { subject, attempts, notifications } = queueService({
      ok: false,
      recoverable: true,
      status: 503,
      messageId: null,
      response: { ok: false },
      error: 'Temporal',
    });
    expect(await subject.processNext()).toBe(true);
    expect(attempts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notificacion-1',
        status: NotificationAttemptStatus.RECOVERABLE_FAILURE,
      }),
    );
    expect(notifications.update).toHaveBeenCalledWith(
      'notificacion-1',
      expect.objectContaining({
        status: NotificationStatus.RETRY,
        lastError: 'Temporal',
      }),
    );
  });
});
