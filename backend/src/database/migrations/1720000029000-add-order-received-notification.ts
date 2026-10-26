import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderReceivedNotification1720000029000 implements MigrationInterface {
  name = 'AddOrderReceivedNotification1720000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_notificacion_enum" ADD VALUE IF NOT EXISTS 'PEDIDO_RECIBIDO' AFTER 'PEDIDO_BORRADOR'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notificaciones" WHERE "evento" = 'PEDIDO_RECIBIDO'`);
    await queryRunner.query(`DELETE FROM "plantillas_notificacion" WHERE "evento" = 'PEDIDO_RECIBIDO'`);
    await queryRunner.query(`ALTER TYPE "evento_notificacion_enum" RENAME TO "evento_notificacion_enum_anterior"`);
    await queryRunner.query(`CREATE TYPE "evento_notificacion_enum" AS ENUM ('PEDIDO_BORRADOR', 'PEDIDO_CONFIRMADO', 'PEDIDO_CANCELADO', 'CAMBIO_RELEVANTE', 'SALIDA_RUTA', 'PROXIMA_ENTREGA', 'ENTREGADO', 'ENTREGA_NO_COMPLETADA', 'PAGO_RECIBIDO')`);
    await queryRunner.query(`ALTER TABLE "plantillas_notificacion" ALTER COLUMN "evento" TYPE "evento_notificacion_enum" USING "evento"::text::"evento_notificacion_enum"`);
    await queryRunner.query(`ALTER TABLE "notificaciones" ALTER COLUMN "evento" TYPE "evento_notificacion_enum" USING "evento"::text::"evento_notificacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_notificacion_enum_anterior"`);
  }
}
