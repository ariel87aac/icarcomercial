import { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductionError, ProductionErrorKind } from '../dominio/production-error';
import { ProductionErrorFilter } from './production-error.filter';

describe('contrato HTTP de errores de Producción', () => {
  it.each<[ProductionErrorKind, number, string]>([
    ['invalid', 400, 'Bad Request'],
    ['forbidden', 403, 'Forbidden'],
    ['missing', 404, 'Not Found'],
    ['conflict', 409, 'Conflict'],
    ['inconsistent', 422, 'Unprocessable Entity'],
  ])('traduce %s sin modificar el sobre público', (kind, code, label) => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ originalUrl: '/api/production-consolidations' }),
      }),
    } as unknown as ArgumentsHost;
    new ProductionErrorFilter().catch(new ProductionError(kind, 'Motivo operativo'), host);
    expect(response.status).toHaveBeenCalledWith(code);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: code,
      error: label,
      message: 'Motivo operativo',
      path: '/api/production-consolidations',
      timestamp: expect.any(String),
    });
  });
});
