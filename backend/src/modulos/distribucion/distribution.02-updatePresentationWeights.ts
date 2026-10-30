import { workflowTransaction } from '../pedidos/order-workflow';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { SaleService } from '../ventas-cobranzas/sale.service';
import { Sale } from '../ventas-cobranzas/entidades/sale.entity';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { InventoryMovementType, InventoryReservationStatus } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderPreparationDetail } from '../preparacion/entidades/order-preparation-detail.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationHistory } from '../preparacion/entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from '../preparacion/entidades/preparation.enums';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import {
  AddRouteDeliveriesDto,
  CancelRouteDto,
  CompleteFactoryDeliveryDto,
  CreateDistributionRouteDto,
  DistributionRouteQueryDto,
  PendingDistributionQueryDto,
  RegisterVisitResultDto,
  ReceiveWarehouseReturnDto,
  RescheduleRouteDto,
  RouteTransitionDto,
  SettleRouteDto,
  UpdatePresentationWeightsDto,
  UpdateRouteSequenceDto,
  UpdateRouteVehicleDto,
  WeightReadinessQueryDto,
  WarehouseReturnQueryDto,
} from './dto/distribution.dto';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionDeliveryType, DistributionRouteStatus, RouteDeliveryStatus, RouteHistoryEvent, RouteResponsibleFunction, VisitResultType, WarehouseReturnStatus } from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteHistory } from './entidades/route-history.entity';
import { RouteResponsible } from './entidades/route-responsible.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';
import { VisitResult } from './entidades/visit-result.entity';
import { WarehouseReturnOrderDetail } from './entidades/warehouse-return-order-detail.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';

const ACTIVE_ROUTE_STATUSES = [
  DistributionRouteStatus.DRAFT,
  DistributionRouteStatus.PLANNED,
  DistributionRouteStatus.IN_DELIVERY,
];
import { DistributionServiceParte03 } from './distribution.03-reschedule';

export abstract class DistributionServiceParte02 extends DistributionServiceParte03 {
  async updatePresentationWeights(dto: UpdatePresentationWeightsDto, actor: AuthenticatedUser) {
      if (new Set(dto.items.map((item) => item.presentationId)).size !== dto.items.length) {
        throw new BadRequestException('No puede repetir una presentación');
      }
      await workflowTransaction(this.dataSource, async (manager) => {
        const repository = manager.getRepository(ProductPresentation);
        for (const item of [...dto.items].sort((a, b) => a.presentationId.localeCompare(b.presentationId))) {
          const presentation = await repository.createQueryBuilder('presentation')
            .setLock('pessimistic_write')
            .where('presentation.id = :id', { id: item.presentationId })
            .getOne();
          if (!presentation) throw new NotFoundException('Presentación no encontrada');
          const previousWeightKg = presentation.weightKg;
          presentation.weightKg = item.weightKg.toFixed(6);
          await repository.save(presentation);
          const auditRepository = manager.getRepository(AuditEvent);
          await auditRepository.save(auditRepository.create({
            userId: actor.id,
            module: 'distribution',
            action: 'ACTUALIZAR_PESO_PRESENTACION',
            entity: 'presentaciones_producto',
            entityId: presentation.id,
            result: 'EXITOSO',
            ipAddress: null,
            metadata: { previousWeightKg, weightKg: presentation.weightKg },
          }));
        }
      });
      return { updated: dto.items.length };
    }

  async create(dto: CreateDistributionRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      const id = await workflowTransaction(this.dataSource, async (manager) => {
        const zone = await manager.getRepository(Zone).findOne({ where: { id: dto.zoneId, status: RecordStatus.ACTIVE } });
        if (!zone) throw new NotFoundException('Zona no encontrada o inactiva');
        const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
        if (!vehicle) throw new UnprocessableEntityException('El vehículo debe estar activo');
        if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) throw new UnprocessableEntityException('El vehículo debe tener una capacidad válida en kg');
        const responsibleIds = [...new Set(dto.responsibleIds)];
        if (responsibleIds.length !== dto.responsibleIds.length || !responsibleIds.includes(dto.principalResponsibleId)) {
          throw new BadRequestException('Debe identificar un responsable principal dentro de la asignación');
        }
        const users = await manager.getRepository(User).createQueryBuilder('user')
          .leftJoinAndSelect('user.roles', 'role')
          .where('user.id IN (:...ids)', { ids: responsibleIds })
          .andWhere('user.status = :status', { status: RecordStatus.ACTIVE })
          .andWhere('role.name IN (:...roles)', { roles: ['REPARTIDOR', 'DISTRIBUCION'] })
          .getMany();
        if (users.length !== responsibleIds.length) throw new UnprocessableEntityException('Todos los responsables deben estar activos y autorizados para distribución');
        await this.assertResourceAvailability(manager, dto.date, dto.vehicleId, responsibleIds);
        const sequence = await manager.query<{ value: string }[]>(`SELECT nextval('rutas_codigo_seq')::text AS value`);
        const repository = manager.getRepository(DistributionRoute);
        const route = await repository.save(repository.create({
          code: `RUTA-${dto.date.replaceAll('-', '')}-${sequence[0].value.padStart(4, '0')}`,
          date: dto.date,
          zoneId: dto.zoneId,
          vehicleId: dto.vehicleId,
          status: DistributionRouteStatus.DRAFT,
          createdById: actor.id,
          observation: dto.observation?.trim() || null,
          departedById: null,
          departedAt: null,
          finishedById: null,
          finishedAt: null,
          settledById: null,
          settledAt: null,
          rescheduledById: null,
          rescheduledAt: null,
          rescheduleReason: null,
          canceledById: null,
          canceledAt: null,
          cancellationReason: null,
        }));
        for (const userId of responsibleIds) {
          const isPrincipal = userId === dto.principalResponsibleId;
          await manager.getRepository(RouteResponsible).save(manager.getRepository(RouteResponsible).create({
            routeId: route.id,
            userId,
            function: isPrincipal ? RouteResponsibleFunction.PRINCIPAL : RouteResponsibleFunction.SUPPORT,
            isPrincipal,
          }));
        }
        await this.saveHistory(manager, route.id, null, DistributionRouteStatus.DRAFT, RouteHistoryEvent.CREATION, actor.id, 'Ruta creada y recursos asignados', { responsibleIds });
        const preparationIds = dto.preparationIds ?? [];
        if (preparationIds.length) {
          await this.assignPreparations(manager, route, preparationIds, actor.id);
          await this.saveHistory(manager, route.id, route.status, route.status, RouteHistoryEvent.ASSIGNMENT, actor.id, 'Preparaciones agregadas al crear la ruta', { preparationIds, operationalDate: route.date });
        }
        await this.saveAudit(manager, actor.id, 'CREAR_RUTA', route.id, { date: route.date, zoneId: route.zoneId, vehicleId: route.vehicleId, preparationIds });
        return route.id;
      });
      return this.findOne(id);
    }

  async updateVehicle(id: string, dto: UpdateRouteVehicleDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'El vehículo sólo puede cambiarse mientras la ruta está en Borrador');
        const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
        if (!vehicle) throw new UnprocessableEntityException('El vehículo debe estar activo');
        if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) throw new UnprocessableEntityException('El vehículo debe tener una capacidad válida en kg');
        const responsibles = await manager.getRepository(RouteResponsible).find({ where: { routeId: id } });
        await this.assertResourceAvailability(manager, route.date, vehicle.id, responsibles.map((item) => item.userId), route.id);
        const load = await this.routeLoad(manager, id);
        if (!load.missingWeightPresentations.length && load.loadWeightKg > Number(vehicle.capacityKg) + 0.0005) {
          const excess = load.loadWeightKg - Number(vehicle.capacityKg);
          throw new UnprocessableEntityException(`La carga de ${load.loadWeightKg.toFixed(3)} kg supera la capacidad de ${Number(vehicle.capacityKg).toFixed(3)} kg por ${excess.toFixed(3)} kg`);
        }
        const previousVehicleId = route.vehicleId;
        route.vehicleId = vehicle.id;
        await manager.getRepository(DistributionRoute).save(route);
        await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.VEHICLE_CHANGE, actor.id, `Vehículo cambiado a ${vehicle.plate}`, { previousVehicleId, vehicleId: vehicle.id, capacityKg: vehicle.capacityKg, loadWeightKg: load.loadWeightKg });
        await this.saveAudit(manager, actor.id, 'CAMBIAR_VEHICULO_RUTA', id, { previousVehicleId, vehicleId: vehicle.id, capacityKg: vehicle.capacityKg, loadWeightKg: load.loadWeightKg });
      });
      return this.findOne(id);
    }

  async addDeliveries(id: string, dto: AddRouteDeliveriesDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador admite pedidos');
        const preparationIds = [...new Set(dto.preparationIds)];
        if (preparationIds.length !== dto.preparationIds.length) throw new BadRequestException('No puede repetir una preparación');
        await this.assignPreparations(manager, route, preparationIds, actor.id);
        await this.saveHistory(manager, route.id, route.status, route.status, RouteHistoryEvent.ASSIGNMENT, actor.id, 'Preparaciones agregadas a la ruta', { preparationIds, operationalDate: route.date });
        await this.saveAudit(manager, actor.id, 'ASIGNAR_ENTREGAS_RUTA', route.id, { preparationIds });
      });
      return this.findOne(id);
    }

  async removeDelivery(id: string, deliveryId: string, actor: AuthenticatedUser): Promise<DistributionRoute> {
      const orderId = await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador permite retirar entregas');
        const delivery = await manager.getRepository(RouteDelivery).findOne({
          where: { id: deliveryId, routeId: id },
          relations: { preparation: true, order: true },
        });
        if (!delivery) throw new NotFoundException('Entrega de ruta no encontrada');
        if (delivery.preparation.status !== PreparationStatus.ASSIGNED) throw new ConflictException('La preparación ya no puede retirarse de la ruta');
        delivery.preparation.status = PreparationStatus.PREPARED;
        delivery.preparation.handedOffById = null;
        delivery.preparation.handedOffAt = null;
        await manager.getRepository(OrderPreparation).save(delivery.preparation);
        await this.savePreparationHistory(manager, delivery.preparation.id, PreparationStatus.ASSIGNED, PreparationStatus.PREPARED, PreparationEvent.UNASSIGNMENT, actor.id, `Retirada de ${route.code}`);
        await manager.getRepository(RouteDelivery).delete(delivery.id);
        const remaining = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, order: { position: 'ASC', createdAt: 'ASC' } });
        await manager.getRepository(RouteDelivery).update({ routeId: id }, { position: null });
        for (const [index, item] of remaining.entries()) await manager.getRepository(RouteDelivery).update({ id: item.id }, { position: index + 1 });
        await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.UNASSIGNMENT, actor.id, `Pedido ${delivery.order.code} retirado de la ruta`, { deliveryId, preparationId: delivery.preparationId, orderId: delivery.orderId });
        await this.saveAudit(manager, actor.id, 'RETIRAR_ENTREGA_RUTA', id, { deliveryId, preparationId: delivery.preparationId, orderId: delivery.orderId });
        return delivery.orderId;
      });
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureOrder(orderId, `route.delivery.removed:${deliveryId}`);
      return this.findOne(id);
    }
}
