import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { DistributionService } from './distribution.service';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionRouteStatus, RouteDeliveryStatus, VisitResultType, WarehouseReturnStatus } from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { RouteResponsible } from './entidades/route-responsible.entity';
import { VehicleDispatch } from './entidades/vehicle-dispatch.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';
import { WarehouseReturnOrderDetail } from './entidades/warehouse-return-order-detail.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';

const actor = {
  id: 'driver-1', sessionId: 'session-1', name: 'Repartidor', email: null, username: 'driver',
  mustChangePassword: false, type: UserType.INTERNAL, customerId: null, roles: ['REPARTIDOR'],
  permissions: ['distribution.routes.finish'], productionAreaIds: [],
} satisfies AuthenticatedUser;

describe('custodia y cierre de rutas de distribución', () => {
  it('rechaza la operación cuando el usuario no es el distribuidor asignado', async () => {
    const manager = { getRepository: vi.fn().mockReturnValue({ findOne: vi.fn().mockResolvedValue(null) }) };
    const service = serviceWithManager(manager) as unknown as {
      assertAssigned(managerValue: unknown, routeId: string, user: AuthenticatedUser): Promise<void>;
    };

    await expect(service.assertAssigned(manager, 'route-1', actor))
      .rejects.toThrow(new ForbiddenException('Solo el distribuidor asignado puede operar esta ruta'));
  });

  it('permite operar al distribuidor principal asignado', async () => {
    const manager = { getRepository: vi.fn().mockReturnValue({ findOne: vi.fn().mockResolvedValue({ userId: actor.id }) }) };
    const service = serviceWithManager(manager) as unknown as {
      assertAssigned(managerValue: unknown, routeId: string, user: AuthenticatedUser): Promise<void>;
    };

    await expect(service.assertAssigned(manager, 'route-1', actor)).resolves.toBeUndefined();
  });

  it('obtiene vehículo y distribuidor del despacho activo sin recibirlos duplicados', async () => {
    const vehicle = { id: 'vehicle-1', status: RecordStatus.ACTIVE, capacityKg: '500.000' };
    const responsible = { id: 'driver-1', status: RecordStatus.ACTIVE };
    const zone = { id: 'zone-1', status: RecordStatus.ACTIVE };
    const dispatch = { id: 'dispatch-1', responsibleId: responsible.id, responsible, vehicle, zones: [zone] };
    const routeRepository = {
      create: vi.fn().mockImplementation((value) => value),
      save: vi.fn().mockImplementation(async (value) => Object.assign(value, { id: 'route-1' })),
    };
    const responsibleRepository = { create: vi.fn().mockImplementation((value) => value), save: vi.fn() };
    const repository = (entity: unknown) => entity === Zone ? { findOne: vi.fn().mockResolvedValue(zone) }
      : entity === VehicleDispatch ? { findOne: vi.fn().mockResolvedValue(dispatch) }
      : entity === DistributionRoute ? routeRepository : entity === RouteResponsible ? responsibleRepository : {};
    const manager = {
      getRepository: vi.fn(repository),
      query: vi.fn().mockImplementation(async (sql: string) => sql.includes("nextval('rutas_codigo_seq')") ? [{ value: '1' }] : []),
    };
    const service = serviceWithManager(manager);
    const helpers = {
      assertResourceAvailability: vi.fn(), assignPreparations: vi.fn(), saveHistory: vi.fn(), saveAudit: vi.fn(),
    };
    Object.assign(service, helpers, { findOne: vi.fn().mockImplementation(async () => routeRepository.save.mock.results[0]?.value) });

    await service.create({ date: '2026-11-03', zoneId: zone.id, vehicleDispatchId: dispatch.id, preparationIds: ['prep-1'] }, actor);

    expect(routeRepository.create).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: vehicle.id, vehicleDispatchId: dispatch.id }));
    expect(responsibleRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: responsible.id, isPrincipal: true }));
    expect(helpers.assertResourceAvailability).toHaveBeenCalledWith(expect.anything(), '2026-11-03', vehicle.id, [responsible.id]);
  });

  it('liquida automáticamente una ruta terminada sin devoluciones', async () => {
    const { service, route, settlementRepository, helpers } = setup();

    const result = await service.finish(route.id, {}, actor);

    expect(result.status).toBe(DistributionRouteStatus.SETTLED);
    expect(route.finishedById).toBe(actor.id);
    expect(route.settledById).toBe(actor.id);
    expect(settlementRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      completeDeliveries: 1, acceptedReturnQuantity: '0.000', responsibleId: actor.id,
    }));
    expect(helpers.assertAssigned).toHaveBeenCalledWith(expect.anything(), route.id, actor);
    expect(helpers.saveHistory).toHaveBeenCalledTimes(2);
  });

  it('impide finalizar mientras exista una entrega pendiente', async () => {
    const { service, route, settlementRepository } = setup({ deliveryStatus: RouteDeliveryStatus.PENDING });

    await expect(service.finish(route.id, {}, actor)).rejects.toThrow('Todas las entregas deben tener un resultado');

    expect(settlementRepository.save).not.toHaveBeenCalled();
  });

  it('envía la devolución a Almacén sin cerrar el recorrido', async () => {
    const { service, route, helpers } = setup({ returnedQuantity: '3.000' });
    helpers.createWarehouseReturnOrder.mockResolvedValue({
      id: 'return-1', code: 1, status: WarehouseReturnStatus.PENDING, expectedQuantity: '3.000',
    });

    const result = await service.sendWarehouseReturn(route.id, actor);

    expect(result.status).toBe(DistributionRouteStatus.IN_DELIVERY);
    expect(route.finishedAt).toBeNull();
    expect(helpers.createWarehouseReturnOrder).toHaveBeenCalledOnce();
    expect(helpers.saveHistory).toHaveBeenCalledWith(
      expect.anything(), route.id, DistributionRouteStatus.IN_DELIVERY,
      DistributionRouteStatus.IN_DELIVERY, expect.anything(), actor.id,
      expect.stringContaining('enviada a Almacén'), expect.anything(),
    );
  });

  it('impide finalizar si la devolución todavía no fue enviada a Almacén', async () => {
    const { service, route } = setup({ returnedQuantity: '3.000' });

    await expect(service.finish(route.id, {}, actor))
      .rejects.toThrow('Debe enviar los productos devueltos a Almacén');
  });

  it('impide finalizar mientras Almacén no recepcione la devolución', async () => {
    const { service, route, settlementRepository } = setup({
      returnedQuantity: '3.000', returnStatus: WarehouseReturnStatus.PENDING,
    });

    await expect(service.finish(route.id, {}, actor))
      .rejects.toThrow('Almacén debe recepcionar la devolución');

    expect(settlementRepository.save).not.toHaveBeenCalled();
  });

  it('permite finalizar después de la recepción de Almacén', async () => {
    const { service, route, settlementRepository } = setup({
      returnedQuantity: '3.000', returnStatus: WarehouseReturnStatus.RECEIVED,
    });

    const result = await service.finish(route.id, {}, actor);

    expect(result.status).toBe(DistributionRouteStatus.SETTLED);
    expect(settlementRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      acceptedReturnQuantity: '3.000', responsibleId: actor.id,
    }));
  });

  it('Almacén ingresa la devolución pero mantiene el recorrido abierto hasta su cierre', async () => {
    const route = {
      id: 'route-1', status: DistributionRouteStatus.IN_DELIVERY,
      finishedById: null, finishedAt: null, settledById: null, settledAt: null,
    } as DistributionRoute;
    const returnOrder = {
      id: 'return-1', code: 1, routeId: route.id, route,
      status: WarehouseReturnStatus.PENDING, expectedQuantity: '3.000', receivedQuantity: '0.000',
    } as WarehouseReturnOrder;
    const stock = { id: 'stock-1', physicalQuantity: '10.000' } as Stock;
    const visitDetail = {
      id: 'visit-detail-1', acceptedReturnQuantity: '0.000',
      preparationDetail: { orderDetailId: 'order-detail-1' },
      visitResult: { delivery: { id: 'delivery-1', orderId: 'order-1' } },
    } as VisitResultDetail;
    const returnDetail = {
      id: 'return-detail-1', stockId: stock.id, expectedQuantity: '3.000',
      receivedQuantity: '0.000', visitResultDetail: visitDetail,
    } as WarehouseReturnOrderDetail;
    const queryBuilder = (value: unknown, finalMethod: 'getOne'|'getOneOrFail') => ({
      setLock: vi.fn().mockReturnThis(), innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), [finalMethod]: vi.fn().mockResolvedValue(value),
    });
    const returnRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(returnOrder, 'getOne')),
      save: vi.fn().mockImplementation(async (value) => value),
    };
    const detailRepository = {
      find: vi.fn().mockResolvedValue([returnDetail]), save: vi.fn().mockImplementation(async (value) => value),
    };
    const stockRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(stock, 'getOneOrFail')),
      save: vi.fn().mockImplementation(async (value) => value),
    };
    const movementRepository = {
      create: vi.fn().mockImplementation((value) => value), save: vi.fn().mockImplementation(async (value) => value),
    };
    const visitDetailRepository = { save: vi.fn().mockImplementation(async (value) => value) };
    const routeRepository = { save: vi.fn().mockImplementation(async (value) => value) };
    const repository = (entity: unknown) => entity === WarehouseReturnOrder ? returnRepository
      : entity === WarehouseReturnOrderDetail ? detailRepository : entity === Stock ? stockRepository
        : entity === InventoryMovement ? movementRepository : entity === VisitResultDetail
          ? visitDetailRepository : entity === DistributionRoute ? routeRepository : {};
    const manager = { getRepository: vi.fn(repository), query: vi.fn().mockResolvedValue([]) };
    const service = serviceWithManager(manager);
    const helpers = { saveHistory: vi.fn(), saveAudit: vi.fn() };
    Object.assign(service, helpers, { warehouseReturn: vi.fn().mockResolvedValue(returnOrder) });

    const result = await service.receiveWarehouseReturn(returnOrder.id, {
      details: [{ detailId: returnDetail.id, quantity: 3 }], observation: undefined,
    }, actor);

    expect(result.status).toBe(WarehouseReturnStatus.RECEIVED);
    expect(stock.physicalQuantity).toBe('13.000');
    expect(route.status).toBe(DistributionRouteStatus.IN_DELIVERY);
    expect(route.settledAt).toBeNull();
    expect(helpers.saveHistory).toHaveBeenCalledWith(
      expect.anything(), route.id, DistributionRouteStatus.IN_DELIVERY,
      DistributionRouteStatus.IN_DELIVERY, expect.anything(), actor.id,
      expect.stringContaining('habilitado para finalizar'), expect.anything(),
    );
  });
});

function setup(options: {
  returnedQuantity?: string;
  returnStatus?: WarehouseReturnStatus;
  deliveryStatus?: RouteDeliveryStatus;
} = {}) {
  const returnedQuantity = options.returnedQuantity ?? '0.000';
  const returnOrder = options.returnStatus ? {
    id: 'return-1', code: 1, routeId: 'route-1', status: options.returnStatus,
    expectedQuantity: returnedQuantity, receivedQuantity: options.returnStatus === WarehouseReturnStatus.RECEIVED ? returnedQuantity : '0.000',
  } as WarehouseReturnOrder : null;
  const route = {
    id: 'route-1', status: DistributionRouteStatus.IN_DELIVERY,
    finishedById: null, finishedAt: null, settledById: null, settledAt: null,
    warehouseReturnOrder: returnOrder,
  } as DistributionRoute;
  const deliveries = [{
    id: 'delivery-1', status: options.deliveryStatus ?? RouteDeliveryStatus.VISITED,
    result: { result: VisitResultType.DELIVERED, details: [{ id: 'visit-detail-1', returnedQuantity }] },
  }] as unknown as RouteDelivery[];
  const routeRepository = { save: vi.fn().mockImplementation(async (value) => value) };
  const deliveryRepository = { find: vi.fn().mockResolvedValue(deliveries) };
  const settlementRepository = {
    create: vi.fn().mockImplementation((value) => value),
    save: vi.fn().mockImplementation(async (value) => value),
  };
  const returnRepository = { findOne: vi.fn().mockResolvedValue(returnOrder) };
  const repository = (entity: unknown) => entity === DistributionRoute
    ? routeRepository : entity === RouteDelivery ? deliveryRepository : entity === RouteSettlement
      ? settlementRepository : entity === WarehouseReturnOrder ? returnRepository : {};
  const manager = { getRepository: vi.fn(repository), query: vi.fn().mockResolvedValue([]) };
  const service = serviceWithManager(manager);
  const helpers = {
    lockRoute: vi.fn().mockResolvedValue(route),
    assertAssigned: vi.fn().mockResolvedValue(undefined),
    createWarehouseReturnOrder: vi.fn().mockResolvedValue(returnOrder),
    saveHistory: vi.fn().mockResolvedValue(undefined),
    saveAudit: vi.fn().mockResolvedValue(undefined),
  };
  Object.assign(service, helpers, { findOne: vi.fn().mockImplementation(async () => route) });
  return { service, route, settlementRepository, helpers };
}

function serviceWithManager(manager: unknown): DistributionService {
  const dataSource = { transaction: vi.fn(async (work) => work(manager)) };
  return new DistributionService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    dataSource as never, {} as never, {} as never,
  );
}
