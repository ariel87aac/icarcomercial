import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller(['audit-events', 'auditoria'])
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
