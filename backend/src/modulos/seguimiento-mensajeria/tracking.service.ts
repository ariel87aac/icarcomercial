import { Injectable } from '@nestjs/common';
import { TrackingServiceParte01 } from './tracking.01-generate';

@Injectable()
export class TrackingService extends TrackingServiceParte01 {}
