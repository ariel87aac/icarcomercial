import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AccountStatementService } from './account-statement.service';
import { CommercialReportService } from './commercial-report.service';
import { CommercialSettingsService } from './commercial-settings.service';
import {
  AccountQueryDto,
  CommercialExportQueryDto,
  CommercialReportQueryDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
  CreateSaleDto,
  PaymentQueryDto,
  ReceivableQueryDto,
  SaleQueryDto,
  SaveVoucherSeriesDto,
  UpdatePaymentMethodDto,
  VoidCommercialOperationDto,
} from './dto/commercial.dto';
import { CommercialReportType, ReportFormat } from './entities/commercial.enums';
import { PaymentService } from './payment.service';
import { ReceivablesService } from './receivables.service';
import { SaleService } from './sale.service';

@Controller()
export class CommercialController {
  constructor(
    private readonly sales: SaleService,
    private readonly payments: PaymentService,
    private readonly accounts: AccountStatementService,
    private readonly receivables: ReceivablesService,
    private readonly reports: CommercialReportService,
    private readonly settings: CommercialSettingsService,
  ) {}

  @Get('deliveries/sale-eligible')
  @RequirePermissions('commercial.sales.create')
  eligibleDeliveries() { return this.sales.eligibleDeliveries(); }

  @Post('sales')
  @RequirePermissions('commercial.sales.create')
  createSale(@Body() dto: CreateSaleDto, @CurrentUser() actor: AuthenticatedUser) { return this.sales.create(dto, actor); }

  @Get('sales')
  @RequirePermissions('commercial.sales.read')
  listSales(@Query() query: SaleQueryDto, @CurrentUser() actor: AuthenticatedUser) { return this.sales.findAll(query, actor); }

  @Get('sales/:id')
  @RequirePermissions('commercial.sales.read')
  sale(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.sales.findOne(id, actor); }

  @Get('sales/:id/voucher')
  @RequirePermissions('commercial.vouchers.read')
  async voucher(@Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    if (format?.toUpperCase() === ReportFormat.PDF) {
      const file = await this.sales.voucherPdf(id, actor);
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      response.send(file.content);
      return;
    }
    response.json(await this.sales.voucher(id, actor));
  }

  @Post('sales/:id/void')
  @RequirePermissions('commercial.sales.void')
  voidSale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidCommercialOperationDto, @CurrentUser() actor: AuthenticatedUser) { return this.sales.void(id, dto, actor); }

  @Get('payment-methods')
  paymentMethods() { return this.settings.paymentMethods(true); }

  @Post('payments')
  @RequirePermissions('commercial.payments.create')
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.create(dto, actor); }

  @Get('payments')
  @RequirePermissions('commercial.payments.read')
  listPayments(@Query() query: PaymentQueryDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.findAll(query, actor); }

  @Get('payments/:id')
  @RequirePermissions('commercial.payments.read')
  payment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.payments.findOne(id, actor); }

  @Post('payments/:id/confirm')
  @RequirePermissions('commercial.payments.confirm')
  confirmPayment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.payments.confirm(id, actor); }

  @Post('payments/:id/void')
  @RequirePermissions('commercial.payments.void')
  voidPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidCommercialOperationDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.void(id, dto, actor); }

  @Get('customers/:id/account')
  @RequirePermissions('commercial.accounts.read')
  account(@Param('id', ParseUUIDPipe) id: string, @Query() query: AccountQueryDto, @CurrentUser() actor: AuthenticatedUser) { return this.accounts.get(id, query, actor); }

  @Get('me/account')
  @RequirePermissions('commercial.accounts.own')
  ownAccount(@Query() query: AccountQueryDto, @CurrentUser() actor: AuthenticatedUser) { return this.accounts.own(query, actor); }

  @Get('receivables')
  @RequirePermissions('commercial.receivables.read')
  listReceivables(@Query() query: ReceivableQueryDto) { return this.receivables.findAll(query); }

  @Get('reports/commercial/:type')
  @RequirePermissions('commercial.reports.read')
  report(@Param('type', new ParseEnumPipe(CommercialReportType)) type: CommercialReportType, @Query() query: CommercialReportQueryDto) { return this.reports.report(type, query); }

  @Get('reports/commercial/:type/export')
  @RequirePermissions('commercial.reports.export')
  async exportReport(@Param('type', new ParseEnumPipe(CommercialReportType)) type: CommercialReportType, @Query() query: CommercialExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const file = await this.reports.export(type, query.format, query, actor);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.content);
  }

  @Get('commercial-settings')
  @RequirePermissions('commercial.settings.read')
  commercialSettings() { return this.settings.settings(); }

  @Post('payment-methods')
  @RequirePermissions('commercial.settings.manage')
  createPaymentMethod(@Body() dto: CreatePaymentMethodDto, @CurrentUser() actor: AuthenticatedUser) { return this.settings.createMethod(dto, actor); }

  @Patch('payment-methods/:id')
  @RequirePermissions('commercial.settings.manage')
  updatePaymentMethod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentMethodDto, @CurrentUser() actor: AuthenticatedUser) { return this.settings.updateMethod(id, dto, actor); }

  @Post('voucher-series')
  @RequirePermissions('commercial.settings.manage')
  saveVoucherSeries(@Body() dto: SaveVoucherSeriesDto, @CurrentUser() actor: AuthenticatedUser) { return this.settings.saveSeries(dto, actor); }
}
