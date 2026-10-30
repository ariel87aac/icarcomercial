import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Customer } from '../customers/entities/customer.entity';
import { VisitResult } from '../distribution/entities/visit-result.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { AccountLedgerService } from './account-ledger.service';
import { AccountStatementService } from './account-statement.service';
import { CommercialOutboxWorkerService } from './commercial-outbox-worker.service';
import { CommercialOutboxService } from './commercial-outbox.service';
import { CommercialReportService } from './commercial-report.service';
import { CommercialSettingsService } from './commercial-settings.service';
import { CommercialController } from './commercial.controller';
import { CommercialOutbox } from './entities/commercial-outbox.entity';
import { CustomerAccountMovement } from './entities/customer-account-movement.entity';
import { InternalVoucher } from './entities/internal-voucher.entity';
import { PaymentApplication } from './entities/payment-application.entity';
import { PaymentHistory } from './entities/payment-history.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { Payment } from './entities/payment.entity';
import { SaleDetail } from './entities/sale-detail.entity';
import { Sale } from './entities/sale.entity';
import { VoucherSeries } from './entities/voucher-series.entity';
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
