import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestWithCorrelation } from '../middleware/correlation-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelation>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        if (Array.isArray(resp.message)) {
          message = resp.message.join(', ');
        }
        error = resp.error as string | undefined;
      }
    } else if (exception && typeof exception === 'object' && 'code' in exception) {
      const prismaError = exception as { code?: string; meta?: { cause?: string } };
      if (prismaError.code === 'P1001') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Database is unavailable. Please try again shortly.';
      } else if (prismaError.code === 'P2021' || prismaError.code === 'P2022') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Database schema is out of date. Run migrations and restart the API.';
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('Unhandled error:', exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
