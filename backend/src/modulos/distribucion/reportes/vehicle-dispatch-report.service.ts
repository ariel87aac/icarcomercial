import { Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { createIcarPdfReport } from '../../../compartido/reportes/icar-pdf-report';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { Vehicle } from '../flota/entidades/vehicle.entity';
import { VehicleDispatch } from '../entidades/vehicle-dispatch.entity';
import { buildVehicleDispatchReport } from './vehicle-dispatch-report';

@Injectable()
export class VehicleDispatchReportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async export(vehicleId: string, actor: AuthenticatedUser) {
    const vehicle = await this.dataSource.getRepository(Vehicle).findOne({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    const dispatches = await this.dataSource.getRepository(VehicleDispatch).createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.responsible', 'responsible')
      .leftJoinAndSelect('dispatch.zones', 'zone')
      .loadRelationCountAndMap('dispatch.routeCount', 'dispatch.routes')
      .where('dispatch.vehicleId = :vehicleId', { vehicleId })
      .orderBy('dispatch.code', 'ASC')
      .getMany();
    const options = buildVehicleDispatchReport({
      vehicle,
      dispatches,
      generatedBy: actor.name,
      generatedAt: new Date(),
      logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    });
    const content = await createIcarPdfReport(options);
    await this.audit.record({
      userId: actor.id,
      module: 'distribution',
      action: 'EXPORTAR_REPORTE_VEHICULO',
      entity: 'vehiculos',
      entityId: vehicle.id,
      result: 'EXITOSO',
      metadata: { plate: vehicle.plate, dispatchCount: dispatches.length },
    });
    return {
      filename: `icar-vehiculo-${safeFilename(vehicle.plate)}.pdf`,
      mime: 'application/pdf',
      content,
    };
  }
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
