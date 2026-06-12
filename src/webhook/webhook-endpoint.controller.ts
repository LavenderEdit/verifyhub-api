import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhookEndpointService } from './webhook-endpoint.service.js';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook-endpoint.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Projects - Webhooks')
@Controller('projects/:projectId/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WebhookEndpointController {
  constructor(private readonly webhookService: WebhookEndpointService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Register a new webhook endpoint for a project' })
  @ApiResponse({ status: 201, description: 'Webhook registered successfully' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.webhookService.create(projectId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List all webhook endpoints for a project' })
  @ApiResponse({
    status: 200,
    description: 'List of webhook endpoints returned',
  })
  async findAll(@Param('projectId') projectId: string) {
    return this.webhookService.findAll(projectId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'Get details of a webhook endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Webhook endpoint details returned',
  })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhookService.findOne(id, projectId);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook endpoint updated' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhookService.update(id, projectId, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook endpoint deleted' })
  async delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.webhookService.delete(id, projectId);
  }

  @Get(':id/deliveries')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'Get recent webhook delivery attempts' })
  @ApiResponse({ status: 200, description: 'Delivery list returned' })
  async findDeliveries(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhookService.findDeliveries(id, projectId);
  }

  @Post('deliveries/:deliveryId/replay')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Trigger a manual replay of a webhook delivery' })
  @ApiResponse({ status: 200, description: 'Webhook delivery replayed' })
  async replay(
    @Param('projectId') projectId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.webhookService.replayDelivery(deliveryId, projectId);
  }
}
