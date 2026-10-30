import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationEventSettings1720000049000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE notificaciones_eventos_configuracion (
      evento varchar(80) PRIMARY KEY,
      habilitado boolean NOT NULL DEFAULT true,
      actualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE notificaciones_eventos_configuracion');
  }
}
