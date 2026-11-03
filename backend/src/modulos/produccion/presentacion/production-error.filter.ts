import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { ApiExceptionFilter } from '../../../compartido/filtros/api-exception.filter';
import { ProductionError, ProductionErrorKind } from '../dominio/production-error';

const responses: Record<ProductionErrorKind, { status: number; error: string }> = {
  invalid: { status: 400, error: 'Bad Request' },
  forbidden: { status: 403, error: 'Forbidden' },
  missing: { status: 404, error: 'Not Found' },
  conflict: { status: 409, error: 'Conflict' },
  inconsistent: { status: 422, error: 'Unprocessable Entity' },
};

@Catch(ProductionError)
export class ProductionErrorFilter extends ApiExceptionFilter {
  catch(exception: ProductionError, host: ArgumentsHost): void {
    const { status, error } = responses[exception.kind];
    super.catch(new HttpException({ statusCode: status, message: exception.message, error }, status), host);
  }
}
