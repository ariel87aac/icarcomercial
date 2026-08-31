export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
}

