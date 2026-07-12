import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelation, res: Response, next: NextFunction) {
    req.correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  }
}
