import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const messages =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: string | string[] }).message
        : status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Ocurrió un error inesperado'
          : 'La solicitud no pudo procesarse';

    response.status(status).json({
      statusCode: status,
      error:
        body && typeof body === 'object' && 'error' in body
          ? (body as { error: string }).error
          : HttpStatus[status],
      message: messages,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}

