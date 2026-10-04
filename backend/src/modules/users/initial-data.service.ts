import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { Role } from '../access-control/entities/role.entity';
import { User } from './entities/user.entity';
import { UserType } from './entities/user-type.enum';

@Injectable()
export class InitialDataService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('INITIAL_ADMIN_EMAIL', 'admin@icar.local');
    if (await this.userRepository.exists({ where: { email } })) return;
    const administrator = await this.roleRepository.findOne({ where: { name: 'ADMINISTRADOR' } });
    if (!administrator) return;
    await this.userRepository.save(
      this.userRepository.create({
        name: 'Administrador ICAR',
        username: this.config.get<string>('INITIAL_ADMIN_USERNAME', 'admin'),
        email,
        phone: null,
        passwordHash: await hash(
          this.config.getOrThrow<string>('INITIAL_ADMIN_PASSWORD'),
          12,
        ),
        type: UserType.INTERNAL,
        roles: [administrator],
      }),
    );
  }
}
