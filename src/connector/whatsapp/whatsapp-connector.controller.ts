import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsappConnectorService } from './whatsapp-connector.service.js';
import { CreateWhatsappConnectorDto } from './dto/create-whatsapp-connector.dto.js';
import { TestSendWhatsappDto } from './dto/test-send-whatsapp.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Connectors - WhatsApp')
@Controller('connectors/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WhatsappConnectorController {
  constructor(private readonly whatsappService: WhatsappConnectorService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new WhatsApp connector for a workspace' })
  @ApiResponse({ status: 201, description: 'WhatsApp connector created' })
  async create(
    @Query('workspaceId') workspaceId: string,
    @Body() dto: CreateWhatsappConnectorDto,
  ) {
    return this.whatsappService.create(workspaceId, dto.name);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List all WhatsApp connectors in a workspace' })
  @ApiResponse({ status: 200, description: 'WhatsApp connectors list returned' })
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.whatsappService.findAll(workspaceId);
  }

  @Get(':id/status')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'Get the status and current QR code for a WhatsApp connector' })
  @ApiResponse({ status: 200, description: 'Status details returned' })
  async getStatus(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.whatsappService.getStatus(id, workspaceId);
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Restart the WhatsApp session' })
  @ApiResponse({ status: 200, description: 'Restart initiated' })
  async restart(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.whatsappService.restart(id, workspaceId);
  }

  @Post(':id/logout')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Log out and destroy the WhatsApp session' })
  @ApiResponse({ status: 200, description: 'Logout completed' })
  async logout(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.whatsappService.logout(id, workspaceId);
  }

  @Post(':id/test-send')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Send a test WhatsApp message using the active session' })
  @ApiResponse({ status: 200, description: 'Test message sent' })
  async testSend(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: TestSendWhatsappDto,
  ) {
    return this.whatsappService.testSend(id, workspaceId, dto.to, dto.message);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a WhatsApp connector and close its session' })
  @ApiResponse({ status: 200, description: 'WhatsApp connector deleted' })
  async delete(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.whatsappService.delete(id, workspaceId);
  }
}
