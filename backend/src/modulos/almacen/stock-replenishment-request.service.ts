import { Injectable } from '@nestjs/common';
import { StockReplenishmentRequestServiceParte01 } from './stock-replenishment-request.01-list';

@Injectable()
export class StockReplenishmentRequestService extends StockReplenishmentRequestServiceParte01 {}
