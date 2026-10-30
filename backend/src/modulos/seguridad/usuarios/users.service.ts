import { Injectable } from '@nestjs/common';
import { UsersServiceParte01 } from './users.01-findAll';

@Injectable()
export class UsersService extends UsersServiceParte01 {}
