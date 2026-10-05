import { UserType } from '../../modules/users/entities/user-type.enum';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  username: string;
  type: UserType;
  customerId: string | null;
  roles: string[];
  permissions: string[];
  productLineIds: string[];
}
