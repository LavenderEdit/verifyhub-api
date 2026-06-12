import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('API Keys')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post('projects/:id/api-keys')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new machine-to-machine API Key for the project' })
  @ApiResponse({ status: 201, description: 'API Key created and returned. The plain token is shown ONLY ONCE.' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createApiKey(
    @GetUser('id') userId: string,
    @Param('id') projectId: string,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    return this.apiKeyService.createApiKey(userId, projectId, createApiKeyDto);
  }

  @Get('projects/:id/api-keys')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List API Keys of the project' })
  @ApiResponse({ status: 200, description: 'List of API keys returned' })
  async listApiKeys(@Param('id') projectId: string) {
    return this.apiKeyService.listApiKeys(projectId);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Revoke and delete an API key' })
  @ApiResponse({ status: 200, description: 'API Key revoked successfully' })
  async revokeApiKey(
    @GetUser('id') userId: string,
    @Param('id') apiKeyId: string,
  ) {
    return this.apiKeyService.revokeApiKey(userId, apiKeyId);
  }
}
