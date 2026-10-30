import { Injectable } from '@nestjs/common';
import { OrdersServiceParte01 } from './orders.01-findAll';

@Injectable()
export class OrdersService extends OrdersServiceParte01 {}
