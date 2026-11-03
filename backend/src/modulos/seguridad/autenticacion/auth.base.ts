import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../auditoria/audit.service';
import { User } from '../usuarios/entidades/user.entity';
import { UserType } from '../usuarios/entidades/user-type.enum';
import { PasswordResetToken } from './entidades/password-reset-token.entity';
import { UserSession } from './entidades/user-session.entity';

export interface SessionView {
  user: {
    id: string;
    name: string;
    username: string;
    mustChangePassword: boolean;
    email: string | null;
    type: UserType;
    customerId: string | null;
    roles: string[];
    permissions: string[];
    productionAreaIds: string[];
  };
}

export abstract class AuthServiceBase {
  [nombre: string]: any;

  protected readonly accessTtl: number;

  protected readonly refreshTtl: number;

  protected readonly resetTtl: number;

  constructor(
        @InjectRepository(User) protected readonly userRepository: Repository<User>,
        @InjectRepository(UserSession)
        protected readonly sessionRepository: Repository<UserSession>,
        @InjectRepository(PasswordResetToken)
        protected readonly resetRepository: Repository<PasswordResetToken>,
        protected readonly jwtService: JwtService,
        protected readonly config: ConfigService,
        protected readonly auditService: AuditService,
      ) {
        this.accessTtl = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
        this.refreshTtl = this.config.get<number>('REFRESH_TOKEN_TTL_SECONDS', 604800);
        this.resetTtl = this.config.get<number>('PASSWORD_RESET_TTL_SECONDS', 1800);
      }
}
