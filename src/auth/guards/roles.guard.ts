import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return false;
    }

    // Extract workspaceId from params, query, or body
    let workspaceId = request.params.workspaceId || 
                      request.query.workspaceId || 
                      request.body.workspaceId;

    if (!workspaceId && request.params.id) {
      const project = await this.prisma.project.findUnique({
        where: { id: request.params.id },
        select: { workspaceId: true },
      });
      if (project) {
        workspaceId = project.workspaceId;
      } else {
        workspaceId = request.params.id;
      }
    }

    if (!workspaceId) {
      throw new ForbiddenException('ID de Workspace no especificado en la ruta.');
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('No eres miembro de este Workspace.');
    }

    const roleHierarchy: Record<Role, number> = {
      [Role.OWNER]: 4,
      [Role.ADMIN]: 3,
      [Role.DEVELOPER]: 2,
      [Role.VIEWER]: 1,
    };

    const userWeight = roleHierarchy[member.role];
    
    const hasRole = requiredRoles.some(role => {
      const requiredWeight = roleHierarchy[role];
      return userWeight >= requiredWeight;
    });

    if (!hasRole) {
      throw new ForbiddenException('No tienes los permisos necesarios para realizar esta acción.');
    }

    // Attach membership context to request
    request.workspaceMember = member;

    return true;
  }
}
