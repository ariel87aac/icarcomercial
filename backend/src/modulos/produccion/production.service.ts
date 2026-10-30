import { Injectable } from '@nestjs/common';
import { ProductionServiceParte01 } from './production.01-areas';

@Injectable()
export class ProductionService extends ProductionServiceParte01 {}
