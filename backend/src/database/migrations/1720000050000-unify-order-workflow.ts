import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyOrderWorkflow1720000050000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const event of ['EN_PREPARACION', 'DISPONIBLE_PARA_PREPARAR', 'PREPARADO', 'ASIGNADO', 'ENTREGA_PARCIAL']) {
      await queryRunner.query(`ALTER TYPE evento_notificacion_enum ADD VALUE IF NOT EXISTS '${event}'`);
    }
    await queryRunner.query(`ALTER TABLE actualizaciones_seguimiento
      ALTER COLUMN enlace_id DROP NOT NULL,
      ALTER COLUMN estado_visible TYPE varchar(40) USING estado_visible::text,
      ADD COLUMN notificacion_procesada boolean NOT NULL DEFAULT true`);
    // History belongs to the order, not to a replaceable access link.
    const constraints = await queryRunner.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'actualizaciones_seguimiento'::regclass AND confrelid = 'enlaces_seguimiento'::regclass`);
    for (const row of constraints) await queryRunner.query(`ALTER TABLE actualizaciones_seguimiento DROP CONSTRAINT "${row.conname}"`);
    await queryRunner.query(`ALTER TABLE actualizaciones_seguimiento ADD CONSTRAINT fk_seguimiento_enlace
      FOREIGN KEY (enlace_id) REFERENCES enlaces_seguimiento(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE enlaces_seguimiento ADD COLUMN token_cifrado text, ADD COLUMN token_hash_anterior varchar(64) UNIQUE`);
    await queryRunner.query(`CREATE INDEX idx_seguimiento_pedido_fecha ON actualizaciones_seguimiento(pedido_id, fecha_hora)`);
    await queryRunner.query(`CREATE INDEX idx_seguimiento_notificacion_pendiente ON actualizaciones_seguimiento(fecha_hora) WHERE NOT notificacion_procesada`);
    await queryRunner.query(`CREATE VIEW cobertura_pedidos AS
      WITH protected AS (
        SELECT pd.detalle_pedido_id, SUM(pd.cantidad_preparada) AS quantity
        FROM preparaciones_detalle pd JOIN preparaciones_pedido p ON p.id = pd.preparacion_id
        WHERE p.estado IN ('PREPARADA', 'ASIGNADA') GROUP BY pd.detalle_pedido_id
      ), demand AS (
        SELECT r.id AS reserva_id, r.existencia_id, d.id AS detalle_pedido_id, d.pedido_id,
          r.cantidad AS requested, s.cantidad_fisica AS physical, o.created_at AS fecha_pedido,
          LEAST(r.cantidad, COALESCE(p.quantity, 0)) AS protected
        FROM reservas_inventario r JOIN pedidos_detalle d ON d.id = r.detalle_pedido_id
        JOIN pedidos o ON o.id = d.pedido_id JOIN existencias s ON s.id = r.existencia_id
        LEFT JOIN protected p ON p.detalle_pedido_id = d.id
        WHERE r.estado = 'ACTIVA' AND o.estado = 'CONFIRMADO' AND o.eliminado_at IS NULL
      ), ranked AS (
        SELECT *, SUM(protected) OVER (PARTITION BY existencia_id) AS protected_total,
          COALESCE(SUM(requested - protected) OVER (PARTITION BY existencia_id
            ORDER BY fecha_pedido, pedido_id, detalle_pedido_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_demand
        FROM demand
      ), allocated AS (
        SELECT *, protected + LEAST(requested - protected,
          GREATEST(0, physical - protected_total - prior_demand)) AS covered FROM ranked
      )
      SELECT reserva_id, existencia_id, detalle_pedido_id, pedido_id,
        requested AS solicitado, covered AS cubierto, requested - covered AS faltante,
        CASE WHEN covered >= requested THEN 'DISPONIBLE' WHEN covered > 0 THEN 'STOCK_PARCIAL' ELSE 'PENDIENTE_STOCK' END AS disponibilidad
      FROM allocated`);
    await queryRunner.query(`CREATE VIEW pedido_flujo_actual AS
      SELECT o.id AS pedido_id,
        CASE WHEN o.estado = 'BORRADOR' THEN 'BORRADOR'
          WHEN o.estado = 'RECIBIDO' THEN 'RECIBIDO'
          WHEN o.estado = 'CANCELADO' THEN 'CANCELADO'
          WHEN result.resultado = 'ENTREGADA' THEN 'ENTREGADO'
          WHEN result.resultado = 'ENTREGA_PARCIAL' THEN 'ENTREGA_PARCIAL'
          WHEN result.resultado = 'NO_ENTREGADA' THEN 'ENTREGA_NO_COMPLETADA'
          WHEN route.estado = 'EN_REPARTO' THEN 'EN_RUTA'
          WHEN prep.estado = 'ASIGNADA' THEN 'ASIGNADO'
          WHEN prep.entregado_distribucion_at IS NOT NULL AND prep.estado = 'PREPARADA' THEN 'PREPARADO'
          WHEN EXISTS (SELECT 1 FROM cobertura_pedidos c WHERE c.pedido_id = o.id)
            AND NOT EXISTS (SELECT 1 FROM pedidos_detalle d LEFT JOIN cobertura_pedidos c ON c.detalle_pedido_id = d.id
              WHERE d.pedido_id = o.id AND (c.faltante IS NULL OR c.faltante > 0)) THEN 'DISPONIBLE_PARA_PREPARAR'
          WHEN NOT EXISTS (SELECT 1 FROM pedidos_detalle d WHERE d.pedido_id = o.id) THEN 'PEDIDO_CONFIRMADO'
          ELSE 'EN_PREPARACION' END AS estado
      FROM pedidos o
      LEFT JOIN LATERAL (SELECT p.* FROM preparaciones_pedido p WHERE p.pedido_id = o.id AND p.estado <> 'CANCELADA'
        ORDER BY p.created_at DESC, p.id DESC LIMIT 1) prep ON true
      LEFT JOIN LATERAL (SELECT d.* FROM rutas_entregas d WHERE d.pedido_id = o.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1) delivery ON true
      LEFT JOIN rutas_distribucion route ON route.id = delivery.ruta_id
      LEFT JOIN resultados_visita result ON result.ruta_entrega_id = delivery.id
      WHERE o.eliminado_at IS NULL`);
    await queryRunner.query(`INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, fecha_hora)
      SELECT pedido_id, CASE estado_nuevo::text WHEN 'CONFIRMADO' THEN 'PEDIDO_CONFIRMADO' ELSE estado_nuevo::text END,
        'order.history:' || id, fecha_hora FROM pedidos_estados_historial
      ON CONFLICT (evento_origen) DO NOTHING`);
    await queryRunner.query(`INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, fecha_hora)
      SELECT p.pedido_id, CASE h.evento::text WHEN 'ENTREGA_DISTRIBUCION' THEN 'PREPARADO'
        WHEN 'ASIGNACION' THEN 'ASIGNADO' WHEN 'DESASIGNACION' THEN 'PREPARADO' ELSE 'EN_RUTA' END,
        'preparation.history:' || h.id, h.fecha_hora
      FROM preparaciones_historial h JOIN preparaciones_pedido p ON p.id = h.preparacion_id
      WHERE h.evento::text IN ('ENTREGA_DISTRIBUCION','ASIGNACION','DESASIGNACION')
        OR (h.evento::text = 'DESPACHO' AND EXISTS (SELECT 1 FROM rutas_entregas d WHERE d.preparacion_id = p.id AND d.ruta_id IS NOT NULL))
      ON CONFLICT (evento_origen) DO NOTHING`);
    await queryRunner.query(`INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, fecha_hora)
      SELECT d.pedido_id, CASE v.resultado::text WHEN 'ENTREGADA' THEN 'ENTREGADO'
        WHEN 'ENTREGA_PARCIAL' THEN 'ENTREGA_PARCIAL' ELSE 'ENTREGA_NO_COMPLETADA' END,
        'visit.history:' || v.id, v.fecha_hora
      FROM resultados_visita v JOIN rutas_entregas d ON d.id = v.ruta_entrega_id
      ON CONFLICT (evento_origen) DO NOTHING`);
    // Baseline existing orders without sending retroactive WhatsApp messages.
    await queryRunner.query(`INSERT INTO actualizaciones_seguimiento
      (pedido_id, estado_visible, evento_origen, fecha_hora, notificacion_procesada)
      SELECT f.pedido_id, f.estado, 'workflow.baseline:' || f.pedido_id, clock_timestamp(), true
      FROM pedido_flujo_actual f ON CONFLICT (evento_origen) DO NOTHING`);
    await queryRunner.query(`INSERT INTO notificaciones_eventos_configuracion(evento, habilitado)
      SELECT event, event IN ('PEDIDO_BORRADOR', 'PEDIDO_CONFIRMADO', 'SALIDA_RUTA', 'ENTREGADO')
      FROM unnest(ARRAY['PEDIDO_BORRADOR','PEDIDO_RECIBIDO','PEDIDO_CONFIRMADO','PEDIDO_CANCELADO',
        'EN_PREPARACION','DISPONIBLE_PARA_PREPARAR','PREPARADO','ASIGNADO','SALIDA_RUTA',
        'ENTREGADO','ENTREGA_PARCIAL','ENTREGA_NO_COMPLETADA','CAMBIO_RELEVANTE','PROXIMA_ENTREGA','PAGO_RECIBIDO']) event
      ON CONFLICT (evento) DO NOTHING`);
    await queryRunner.query(`CREATE TABLE solicitudes_cambio_pedido (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid NOT NULL REFERENCES pedidos(id),
      mensaje varchar(1000) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
      respuesta varchar(1000), resuelto_por uuid REFERENCES usuarios(id),
      created_at timestamptz NOT NULL DEFAULT now(), resuelto_at timestamptz,
      CHECK (estado IN ('PENDIENTE', 'RESUELTA'))
    )`);
    await queryRunner.query(`CREATE INDEX idx_solicitudes_cambio_pedido ON solicitudes_cambio_pedido(pedido_id, created_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE solicitudes_cambio_pedido');
    await queryRunner.query('DROP VIEW pedido_flujo_actual');
    await queryRunner.query('DROP VIEW cobertura_pedidos');
    await queryRunner.query('DROP INDEX idx_seguimiento_notificacion_pendiente');
    await queryRunner.query('DROP INDEX idx_seguimiento_pedido_fecha');
    await queryRunner.query('ALTER TABLE enlaces_seguimiento DROP COLUMN token_cifrado, DROP COLUMN token_hash_anterior');
    await queryRunner.query('ALTER TABLE actualizaciones_seguimiento DROP COLUMN notificacion_procesada');
    // Keep the order-owned history and varchar statuses to avoid discarding recorded events.
  }
}
