import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.config.get<number>('NOTIFICATION_WORKER_POLL_MS', 5000);
    this.timer = setInterval(() => void this.drain(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let processed = 0; processed < 20; processed += 1) {
        if (!(await this.notifications.processNext())) break;
      }
    } catch (error) {
      this.logger.error('No fue posible procesar la cola de notificaciones', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
