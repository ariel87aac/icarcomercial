import { ServiceUnavailableException } from '@nestjs/common';
import { Notification } from './entidades/notification.entity';
import { NotificationAttemptStatus, NotificationStatus } from './entidades/tracking.enums';
import { NotificationServiceParte04 } from './notification.04-recoverInterruptedProcessing';

export abstract class NotificationServiceProcessNext extends NotificationServiceParte04 {
  async processNext(): Promise<boolean> {
    const notificationId = await this.dataSource.transaction(async (manager) => {
      const item = await manager.getRepository(Notification).createQueryBuilder('notification')
        .setLock('pessimistic_write').setOnLocked('skip_locked')
        .where('notification.estado IN (:...states)', { states: [NotificationStatus.PENDING, NotificationStatus.RETRY] })
        .andWhere('notification.proximo_intento_at <= now()')
        .orderBy('notification.proximo_intento_at', 'ASC').getOne();
      if (!item) return null;
      item.status = NotificationStatus.PROCESSING;
      await manager.getRepository(Notification).save(item);
      return item.id;
    });
    if (!notificationId) return false;
    const item = await this.findOne(notificationId);
    const channel = await this.activeChannelWithCredential();
    if (!channel) {
      await this.finishFailure(item, null, {}, 'No existe un canal de WhatsApp activo', false, 0);
      return true;
    }
    let result;
    try {
      if (!channel.encryptedToken) throw new ServiceUnavailableException('El token de LimiteAPI no está configurado');
      result = await this.provider.send(channel, item.recipient, item.renderedBody, this.channelTokenCipher.decrypt(channel.encryptedToken));
    } catch (error) {
      const message = error instanceof ServiceUnavailableException ? error.message : 'Configuración de LimiteAPI no disponible';
      await this.finishFailure(item, null, { message }, message, false, channel.maxRetries);
      return true;
    }
    if (!result.ok) {
      await this.finishFailure(item, result.status, result.response, result.error ?? 'Error de proveedor', result.recoverable, channel.maxRetries, channel.retryDelaySeconds);
      return true;
    }
    await this.attempts.save(this.attempts.create({
      notificationId: item.id,
      attemptNumber: item.attempts.length + 1,
      status: NotificationAttemptStatus.SENT,
      httpStatus: result.status,
      sanitizedResponse: result.response,
    }));
    await this.notifications.update(item.id, {
      status: NotificationStatus.SENT,
      providerMessageId: result.messageId,
      processedAt: new Date(),
      lastError: null,
    });
    return true;
  }
}
