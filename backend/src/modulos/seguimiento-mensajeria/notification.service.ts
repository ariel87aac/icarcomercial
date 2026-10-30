import { Injectable } from '@nestjs/common';
import { NotificationServiceParte01 } from './notification.01-listSettings';

@Injectable()
export class NotificationService extends NotificationServiceParte01 {}
