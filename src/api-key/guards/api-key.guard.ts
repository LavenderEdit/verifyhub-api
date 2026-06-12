import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../api-key.service.js';
import { SCOPES_KEY } from '../decorators/required-scopes.decorator.js';
import { FastifyRequest } from 'fastify';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Extract x-api-key from headers
    const rawKey = request.headers['x-api-key'] as string;
    if (!rawKey) {
      throw new UnauthorizedException(
        'API Key no proporcionada en la cabecera x-api-key.',
      );
    }

    const apiKey = await this.apiKeyService.validateApiKey(rawKey);
    if (!apiKey) {
      throw new UnauthorizedException(
        'API Key inválida, deshabilitada o expirada.',
      );
    }

    // Check scopes if any are required on the route
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const hasScopes = requiredScopes.every((scope) =>
        apiKey.scopes.includes(scope),
      );
      if (!hasScopes) {
        throw new ForbiddenException(
          'La API Key no cuenta con los scopes requeridos para esta acción.',
        );
      }
    }

    // Attach contextual elements to request
    (request as any).apiKey = apiKey;
    (request as any).project = apiKey.project;
    (request as any).workspaceId = apiKey.workspaceId;

    return true;
  }
}
