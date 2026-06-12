import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { Role } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createWorkspace(userId: string, createWorkspaceDto: CreateWorkspaceDto) {
    const workspace = await this.prisma.$transaction(async (tx) => {
      // 1. Create Workspace
      const ws = await tx.workspace.create({
        data: {
          name: createWorkspaceDto.name,
        },
      });

      // 2. Add creator as OWNER
      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          role: Role.OWNER,
        },
      });

      return ws;
    });

    await this.auditService.logAction({
      userId,
      workspaceId: workspace.id,
      action: 'workspace.created',
      details: { name: workspace.name },
    });

    this.logger.log(`Workspace created: ${workspace.name} (${workspace.id}) by user ${userId}`);
    return workspace;
  }

  async listWorkspaces(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });
  }

  async getWorkspace(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
    });
  }

  async createProject(userId: string, workspaceId: string, createProjectDto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: createProjectDto.name,
        workspaceId,
        allowedDomains: createProjectDto.allowedDomains || [],
        webhookUrl: createProjectDto.webhookUrl,
      },
    });

    await this.auditService.logAction({
      userId,
      workspaceId,
      projectId: project.id,
      action: 'project.created',
      details: { name: project.name },
    });

    this.logger.log(`Project created: ${project.name} (${project.id}) in workspace ${workspaceId}`);
    return project;
  }

  async listProjects(workspaceId: string) {
    return this.prisma.project.findMany({
      where: { workspaceId },
    });
  }

  async getProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
    });
  }
}
