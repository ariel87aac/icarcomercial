import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommercialOutboxService } from './commercial-outbox.service';

@Injectable()
export class CommercialOutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommercialOutboxWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly outbox: CommercialOutboxService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), 10_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (await this.outbox.processNext()) { /* drain pending commercial events */ }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Fallo al procesar el outbox comercial');
    } finally {
      this.processing = false;
    }
  }
}
