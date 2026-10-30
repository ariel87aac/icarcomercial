import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../compartido/decoradores/current-user.decorator';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('operational-summary')
  operationalSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.operationalSummary(actor);
  }
}
