import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ROLES_KEY, AuthenticatedRequest, FARM_ACCESS_KEY } from '../decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      throw err || new UnauthorizedException('Please log in to continue');
    }
    return user;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return true;
  }
}

@Injectable()
export class FarmAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresFarmAccess = this.reflector.getAllAndOverride<boolean>(FARM_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresFarmAccess) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const farmId =
      request.params.farmId ||
      request.body?.farmId ||
      (request.query.farmId as string);

    if (!farmId) {
      throw new ForbiddenException('farmId is required');
    }

    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId: request.user.organizationId },
      select: { id: true },
    });
    if (!farm) {
      throw new ForbiddenException('You do not have access to this farm');
    }

    const access = await this.prisma.farmUser.findFirst({
      where: {
        farmId,
        userId: request.user.sub,
        status: 'ACTIVE',
      },
    });

    if (!access && request.user.role !== UserRole.OWNER) {
      throw new ForbiddenException('You do not have access to this farm');
    }

    return true;
  }
}
