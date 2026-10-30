import { EntityManager } from 'typeorm';
import { PublicTrackingStatus } from '../tracking/entities/tracking.enums';

export interface DetailCoverage {
  detalle_pedido_id: string;
  pedido_id: string;
  existencia_id: string;
  solicitado: string;
  cubierto: string;
  faltante: string;
  disponibilidad: 'DISPONIBLE' | 'STOCK_PARCIAL' | 'PENDIENTE_STOCK' | 'DESPACHADO';
}

export async function coverageForOrders(manager: EntityManager, orderIds: string[]): Promise<Map<string, DetailCoverage>> {
  if (!orderIds.length) return new Map();
  const rows: DetailCoverage[] = await manager.query(
    `SELECT * FROM cobertura_pedidos WHERE pedido_id = ANY($1::uuid[])
     UNION ALL
     SELECT r.id, r.existencia_id, d.id, d.pedido_id, r.cantidad, r.cantidad, 0::numeric, 'DESPACHADO'
     FROM reservas_inventario r JOIN pedidos_detalle d ON d.id = r.detalle_pedido_id
     WHERE d.pedido_id = ANY($1::uuid[]) AND r.estado = 'CONSUMIDA'`, [orderIds],
  );
  return new Map(rows.map((row) => [row.detalle_pedido_id, row]));
}

export async function attachOrderWorkflow<T extends { id: string; details?: Array<{ id: string }> }>(manager: EntityManager, orders: T[]) {
  if (!orders.length) return orders;
  const ids = orders.map((order) => order.id);
  const [coverage, stages]: [Map<string, DetailCoverage>, Array<{ pedido_id: string; estado: PublicTrackingStatus }>] = await Promise.all([
    coverageForOrders(manager, ids),
    manager.query('SELECT * FROM pedido_flujo_actual WHERE pedido_id = ANY($1::uuid[])', [ids]),
  ]);
  const stageByOrder = new Map(stages.map((row) => [row.pedido_id, row.estado]));
  for (const order of orders) {
    Object.assign(order, { operationalStatus: stageByOrder.get(order.id) });
    for (const detail of order.details ?? []) {
      const current = coverage.get(detail.id);
      if (current) Object.assign(detail, {
        coveredQuantity: current.cubierto, shortageQuantity: current.faltante, availability: current.disponibilidad,
      });
    }
  }
  return orders;
}

/** Commit the inventory decision and its public history/outbox atomically. */
export async function workflowTransaction<T>(dataSource: import('typeorm').DataSource, work: (manager: EntityManager) => Promise<T>): Promise<T> {
  return dataSource.transaction(async (manager) => {
    // One warehouse: serialize stock, preparation and reservation mutations in a consistent order.
    await manager.query('SELECT pg_advisory_xact_lock(741001)');
    const result = await work(manager);
    await manager.query(`INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, fecha_hora, notificacion_procesada)
      SELECT pedido_id, CASE estado_nuevo::text WHEN 'CONFIRMADO' THEN 'PEDIDO_CONFIRMADO' ELSE estado_nuevo::text END,
        'order.history:' || id, fecha_hora, true FROM pedidos_estados_historial
      ON CONFLICT (evento_origen) DO NOTHING`);
    await manager.query(`WITH current AS (
      SELECT f.pedido_id, f.estado,
        CASE WHEN f.estado = 'EN_RUTA' THEN (SELECT COUNT(*)::int FROM rutas_entregas prior
          LEFT JOIN resultados_visita vr ON vr.ruta_entrega_id = prior.id
          WHERE prior.ruta_id = delivery.ruta_id AND prior.posicion < delivery.posicion AND vr.id IS NULL)
        ELSE 0 END AS stops
      FROM pedido_flujo_actual f
      LEFT JOIN LATERAL (SELECT d.ruta_id, d.posicion FROM rutas_entregas d WHERE d.pedido_id = f.pedido_id
        ORDER BY d.created_at DESC, d.id DESC LIMIT 1) delivery ON true
    )
    INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, paradas_previas_pendientes, fecha_hora, notificacion_procesada)
    SELECT c.pedido_id, c.estado, 'workflow:' || gen_random_uuid(), c.stops, clock_timestamp(),
      c.estado IN ('BORRADOR','RECIBIDO','PEDIDO_CONFIRMADO','CANCELADO') OR COALESCE(previous.estado_visible = c.estado, false)
      OR NOT COALESCE((SELECT setting.habilitado FROM notificaciones_eventos_configuracion setting
        WHERE setting.evento = CASE c.estado WHEN 'EN_RUTA' THEN 'SALIDA_RUTA' ELSE c.estado END), true)
    FROM current c LEFT JOIN LATERAL (
      SELECT u.estado_visible, u.paradas_previas_pendientes FROM actualizaciones_seguimiento u
      WHERE u.pedido_id = c.pedido_id ORDER BY u.fecha_hora DESC, u.id DESC LIMIT 1
    ) previous ON true
    WHERE previous.estado_visible IS DISTINCT FROM c.estado
      OR previous.paradas_previas_pendientes IS DISTINCT FROM c.stops`);
    return result;
  });
}
