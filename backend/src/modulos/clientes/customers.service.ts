import { Injectable } from '@nestjs/common';
import { CustomersServiceParte01 } from './customers.01-findAll';

@Injectable()
export class CustomersService extends CustomersServiceParte01 {}
