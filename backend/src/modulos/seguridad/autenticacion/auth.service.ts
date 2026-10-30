import { Injectable } from '@nestjs/common';
import { AuthServiceParte01 } from './auth.01-login';

@Injectable()
export class AuthService extends AuthServiceParte01 {}
