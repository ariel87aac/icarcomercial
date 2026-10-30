import { Injectable } from '@nestjs/common';
import { PreparationServiceParte01 } from './preparation.01-eligible';

@Injectable()
export class PreparationService extends PreparationServiceParte01 {}
