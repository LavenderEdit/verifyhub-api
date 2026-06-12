import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ConfigService } from '@nestjs/config';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { randomBytes, createHash } from 'crypto';
import { Role } from '@prisma/client';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  private hashKey(rawKey: string): string {
    const pepper = this.configService.get<string>('API_KEY_PEPPER')!;
    return createHash('sha256')
      .update(rawKey + pepper)
      .digest('hex');
  }

  async createApiKey(
    userId: string,
    projectId: string,
    createApiKeyDto: CreateApiKeyDto,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }

    // Generate plain key: prefix + 24 bytes hex (48 chars) = 56 chars total
    const rawKey = `vh_live_${randomBytes(24).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: createApiKeyDto.name,
        keyHash,
        projectId,
        workspaceId: project.workspaceId,
        scopes: createApiKeyDto.scopes,
        expiresAt: createApiKeyDto.expiresAt
          ? new Date(createApiKeyDto.expiresAt)
          : null,
      },
    });

    await this.auditService.logAction({
      userId,
      workspaceId: project.workspaceId,
      projectId,
      action: 'api_key.created',
      details: { name: apiKey.name, scopes: apiKey.scopes },
    });

    this.logger.log(
      `API Key "${apiKey.name}" created for project ${projectId} by user ${userId}`,
    );

    // Return the plain key to the user (ONLY ONCE)
    return {
      id: apiKey.id,
      name: apiKey.name,
      plainKey: rawKey,
      scopes: apiKey.scopes,
      enabled: apiKey.enabled,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  async listApiKeys(projectId: string) {
    return this.prisma.apiKey.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        scopes: true,
        enabled: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async revokeApiKey(userId: string, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key no encontrada.');
    }

    // Check workspace membership and permission (OWNER, ADMIN, or DEVELOPER)
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: apiKey.workspaceId,
          userId,
        },
      },
    });

    if (
      !member ||
      (member.role !== Role.OWNER &&
        member.role !== Role.ADMIN &&
        member.role !== Role.DEVELOPER)
    ) {
      throw new ForbiddenException(
        'No tienes permisos en este workspace para revocar esta API Key.',
      );
    }

    await this.prisma.apiKey.delete({
      where: { id: apiKeyId },
    });

    await this.auditService.logAction({
      userId,
      workspaceId: apiKey.workspaceId,
      projectId: apiKey.projectId,
      action: 'api_key.revoked',
      details: { name: apiKey.name },
    });

    this.logger.log(
      `API Key "${apiKey.name}" revoked (deleted) by user ${userId}`,
    );
    return { success: true };
  }

  async validateApiKey(rawKey: string) {
    const keyHash = this.hashKey(rawKey);
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            allowedDomains: true,
          },
        },
      },
    });

    if (!apiKey || !apiKey.enabled) {
      return null;
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      // Key expired
      return null;
    }

    return apiKey;
  }
}
