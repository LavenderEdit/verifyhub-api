import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { WorkspaceService } from './workspace.service.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Workspaces & Projects')
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created successfully' })
  async createWorkspace(
    @GetUser('id') userId: string,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    return this.workspaceService.createWorkspace(userId, createWorkspaceDto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the authenticated user belongs to' })
  @ApiResponse({ status: 200, description: 'List of workspaces returned' })
  async listWorkspaces(@GetUser('id') userId: string) {
    return this.workspaceService.listWorkspaces(userId);
  }

  @Post(':id/projects')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new project in the workspace' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createProject(
    @GetUser('id') userId: string,
    @Param('id') workspaceId: string,
    @Body() createProjectDto: CreateProjectDto,
  ) {
    return this.workspaceService.createProject(userId, workspaceId, createProjectDto);
  }

  @Get(':id/projects')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List projects within a workspace' })
  @ApiResponse({ status: 200, description: 'List of projects returned' })
  async listProjects(@Param('id') workspaceId: string) {
    return this.workspaceService.listProjects(workspaceId);
  }
}
