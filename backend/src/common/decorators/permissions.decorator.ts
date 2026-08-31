import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: string[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

