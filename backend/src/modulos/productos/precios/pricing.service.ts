import { Injectable } from '@nestjs/common';
import { PricingServiceParte01 } from './pricing.01-prices';

@Injectable()
export class PricingService extends PricingServiceParte01 {}
