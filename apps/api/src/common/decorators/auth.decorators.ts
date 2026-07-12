import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestWithCorrelation } from '../middleware/correlation-id.middleware';

export interface JwtPayload {
  sub: string;
  organizationId: string;
  role: UserRole;
  phoneNumber: string;
}

export interface AuthenticatedRequest extends RequestWithCorrelation {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return data ? request.user?.[data] : request.user;
  },
);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const FARM_ACCESS_KEY = 'farmAccess';
export const RequireFarmAccess = () => SetMetadata(FARM_ACCESS_KEY, true);
