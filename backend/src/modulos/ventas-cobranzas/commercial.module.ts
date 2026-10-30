import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../seguridad/auditoria/audit.module';
import { Customer } from '../clientes/entidades/customer.entity';
import { VisitResult } from '../distribucion/entidades/visit-result.entity';
import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { AccountLedgerService } from './account-ledger.service';
import { AccountStatementService } from './account-statement.service';
import { CommercialOutboxWorkerService } from './commercial-outbox-worker.service';
import { CommercialOutboxService } from './commercial-outbox.service';
import { CommercialReportService } from './commercial-report.service';
import { CommercialSettingsService } from './commercial-settings.service';
import { CommercialController } from './commercial.controller';
import { CommercialOutbox } from './entidades/commercial-outbox.entity';
import { CustomerAccountMovement } from './entidades/customer-account-movement.entity';
import { InternalVoucher } from './entidades/internal-voucher.entity';
import { PaymentApplication } from './entidades/payment-application.entity';
import { PaymentHistory } from './entidades/payment-history.entity';
import { PaymentMethod } from './entidades/payment-method.entity';
import { Payment } from './entidades/payment.entity';
import { SaleDetail } from './entidades/sale-detail.entity';
import { Sale } from './entidades/sale.entity';
import { VoucherSeries } from './entidades/voucher-series.entity';
import { PaymentService } from './payment.service';
import { ReceivablesService } from './receivables.service';
import { SaleService } from './sale.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleDetail,
      VoucherSeries,
      InternalVoucher,
      PaymentMethod,
      Payment,
      PaymentApplication,
      PaymentHistory,
      CustomerAccountMovement,
      CommercialOutbox,
      VisitResult,
      Customer,
    ]),
    AuditModule,
    TrackingModule,
  ],
  controllers: [CommercialController],
  providers: [
    AccountLedgerService,
    SaleService,
    PaymentService,
    AccountStatementService,
    ReceivablesService,
    CommercialReportService,
    CommercialSettingsService,
    CommercialOutboxService,
    CommercialOutboxWorkerService,
  ],
  exports: [SaleService],
})
export class CommercialModule {}
