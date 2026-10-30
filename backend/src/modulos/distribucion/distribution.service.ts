import { Injectable } from '@nestjs/common';
import { DistributionServiceParte01 } from './distribution.01-findAll';

@Injectable()
export class DistributionService extends DistributionServiceParte01 {}
