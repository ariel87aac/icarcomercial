import { UserType } from '../../modulos/seguridad/usuarios/entidades/user-type.enum';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  name: string;
  email: string | null;
  username: string;
  type: UserType;
  customerId: string | null;
  roles: string[];
  permissions: string[];
  productionAreaIds: string[];
}
