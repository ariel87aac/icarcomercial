import { describe, expect, it } from 'vitest';
import { createIcarPdfReport } from '../../../compartido/reportes/icar-pdf-report';
import { Vehicle } from '../flota/entidades/vehicle.entity';
import { VehicleDispatch } from '../entidades/vehicle-dispatch.entity';
import { VehicleDispatchStatus } from '../entidades/distribution.enums';
import { buildVehicleDispatchReport } from './vehicle-dispatch-report';

const generatedAt = new Date('2026-11-02T18:00:00.000Z');

describe('reporte histórico de vehículo', () => {
  it('consolida kilometrajes, recorrido, tiempo y número de despachos', () => {
    const report = buildVehicleDispatchReport({
      vehicle: vehicle(),
      dispatches: [
        dispatch(1, '1000.0', '1055.5', '2026-11-01T12:00:00.000Z', '2026-11-01T18:30:00.000Z'),
        dispatch(2, '1055.5', '1080.0', '2026-11-02T12:00:00.000Z', '2026-11-02T17:00:00.000Z'),
      ],
      generatedBy: 'Administrador',
      generatedAt,
      logoPath: '/ruta/no-existente/logo.jpg',
    });

    expect(report.metrics.map((metric) => metric.value)).toEqual([
      '1.000,0 km', '1.080,0 km', '80,0 km', '11 h 30 min', 2,
    ]);
    expect(report.groups[0].rows[0].values).toMatchObject({
      dispatch: 'DV-1 · Devuelto',
      observations: 'Entrega: Vehículo sin novedad\nRecepción: Recepción conforme',
    });
  });

  it('genera un PDF carta vertical aun cuando el vehículo no tiene despachos', async () => {
    const options = buildVehicleDispatchReport({
      vehicle: vehicle(), dispatches: [], generatedBy: 'Administrador', generatedAt,
      logoPath: '/ruta/no-existente/logo.jpg',
    });
    const pdf = await createIcarPdfReport(options);

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 612 792]');
    expect(options.metrics.at(-1)?.value).toBe(0);
  });
});

function vehicle(): Vehicle {
  return { id: 'vehicle-1', plate: 'ABC-123', description: 'Camión de reparto' } as Vehicle;
}

function dispatch(code: number, initial: string, final: string, handover: string, returned: string): VehicleDispatch {
  return {
    code,
    status: VehicleDispatchStatus.RETURNED,
    handedOverAt: new Date(handover),
    returnedAt: new Date(returned),
    initialOdometer: initial,
    finalOdometer: final,
    responsible: { name: 'Repartidor Uno' },
    zones: [{ name: 'Zona Centro' }],
    routeCount: 2,
    handoverObservation: 'Vehículo sin novedad',
    returnObservation: 'Recepción conforme',
  } as VehicleDispatch;
}
